"""
Elasticsearch queries generation and results parsing.
"""
import numpy as np
import pandas as pd
from .common import get_aggregated_field


###########
# Queries #
###########


def get_time_interval_filter(ts_field, time_interval):
    time_range = dict()
    if time_interval["start"] != "":
        time_range["gte"] = time_interval["start"]
    if time_interval["end"] != "":
        time_range["lte"] = time_interval["end"]

    return {
        "range": {
            ts_field: time_range
        }
    }


def get_docs_query(signals, ts_field, time_interval=None, size=10000):
    """
    Creates a query for ES to return the docs (in their original form).
    Note: The results are sorted in reversed order (from latest to oldest).

    Parameters
    ----------
    signals : list[dict]
        Signal parameters for query creation. Expected keys:
         - "field" - the ES field for the signal
    ts_field : string
        ES field for timestamp signal
    time_interval : dict
        Dict with "start" and "end" keys which are ISO date strings.
    size : int
        Max number of returned docs. The latest docs are returned.

    Returns
    -------
    dict
        The generated ES query.
    """
    if time_interval is None:
        time_interval = {"start": "", "end": ""}

    def sig_to_field(sig):
        return sig["field"]

    return {
        'size': size,
        '_source': list(map(sig_to_field, signals)),
        'sort': [{ts_field: 'desc'}],
        'query': get_time_interval_filter(ts_field, time_interval)
    }


def get_histogram_query(signals, ts_field, aggregation_interval, time_interval=None, size=10000):
    """
    Creates a query for ES to return a date histogram aggregation.

    Parameters
    ----------
    signals : list[dict]
        Signal parameters for query creation. Expected keys:
         - "field" - the ES field for the signal
         - "data_type": "numerical" or "categorical"
         - "aggregation": aggregation for Elasticsearch ("min", "max", "avg", ...)
    ts_field : string
        ES field for timestamp signal
    aggregation_interval : string
        The interval for the ES date histogram aggregation. Format is number + unit (e.g. "1d").
    time_interval : dict
        Dict with "start" and "end" keys which are ISO date strings.
    size : int
        Max number of returned docs. The latest docs are returned.


    Returns
    -------
    dict
        The generated ES query.
    """
    if time_interval is None:
        time_interval = {"start": "", "end": ""}

    signal_aggs = dict()
    for sig in signals:
        field = sig["field"]

        if sig["data_type"] == 'categorical':
            signal_aggs[field] = {
                "terms": {
                    "field": field,
                    'size': 1
                }
            }
        else:  # 'numerical'
            signal_aggs[f"{field}_{sig['aggregation']}"] = {
                sig['aggregation']: {
                    "field": field
                }
            }

    return {
        "size": 0,
        "aggs": {
            "aggregated_data": {
                "date_histogram": {
                    "field": ts_field,
                    "interval": aggregation_interval,
                    "min_doc_count": 1,
                    "order": {"_key": "desc"}  # temporarily sort from the latest to oldest - used for limiting the number of buckets
                },
                "aggs": {
                    "size": {  # limit number of returned buckets
                        "bucket_sort": {
                            "size": size
                        }
                    },
                    "sort": {  # sort the returned buckets by time (oldest to latest)
                        "bucket_sort": {
                            "sort": {"_key": "asc"}
                        }
                    },
                    **signal_aggs,
                }
            }
        },
        "query": get_time_interval_filter(ts_field, time_interval)
    }


###########
# Results #
###########


def _parse_signal_values_from_docs(signal, docs):
    """Returns the values of one signal as np array (vector)"""
    field = signal["field"]
    data_type = signal["data_type"]
    values = []
    for d in docs:
        values.append(d["_source"][field])
    return np.array(values,
                    dtype=np.float32 if data_type == "numerical" else np.str)


def _parse_signal_values_from_sort(docs):
    """Returns the values of the timestamp signal as np array (vector)"""
    values = []
    for d in docs:
        values.append(d["sort"][0])
    return np.array(values)


def _parse_signal_values_from_buckets(signal, buckets):
    """Returns the values of one signal as np array (vector)"""
    field = get_aggregated_field(signal)
    data_type = signal["data_type"]

    values = []
    for b in buckets:
        if data_type == 'categorical':
            val = b[field]["buckets"][0]["key"]
        else:
            val = b[field]["value"]

        values.append(val)
    return np.array(values,
                    dtype=np.float32 if data_type == "numerical" else np.str)


def _parse_signal_values_from_buckets_key(buckets):
    """Returns the values of the timestamp signal as np array (vector)"""
    values = []
    for b in buckets:
        values.append(b["key"])
    return np.array(values)


def _get_hits(data):
    return data["hits"]["hits"]


def _get_buckets(data):
    return data["aggregations"]["aggregated_data"]["buckets"]


def parse_docs(signals, data):
    """
    Parse the docs data from Elasticsearch.

    Parameters
    ----------
    signals : list[dict]
        Signal parameters (same as used for query creation). Expected keys:
         - "field" - the ES field for the signal
         - "data_type": "numerical" or "categorical"
    data : dict
        JSON response from Elasticsearch parsed to dict. It is expected that the Elasticsearch query was produced by `get_docs_query` and the data are thus ordered from the latest to the oldest.

    Returns
    -------
    pd.DataFrame
        Dataframe of both inputs and targets. Columns are fields, rows are the training patterns (docs from ES).
    """
    docs = _get_hits(data)

    dataframe = pd.DataFrame()

    for sig in signals:
        sig_values = _parse_signal_values_from_docs(sig, docs)
        dataframe[sig["field"]] = sig_values
    dataframe["ts"] = _parse_signal_values_from_sort(docs)

    dataframe = dataframe[::-1]  # reverse -> the rows are now ordered from the oldest to the latest
    dataframe.set_index("ts", inplace=True)
    return dataframe


def parse_histogram(signals, data):
    """
    Parse the date histogram data from Elasticsearch.

    Parameters
    ----------
    signals : list[dict]
        Signal parameters for query creation. Expected keys:
         - "field" - the ES field for the signal
         - "data_type": "numerical" or "categorical"
         - "aggregation": aggregation for Elasticsearch ("min", "max", "avg", ...)
    data : dict
        JSON response from Elasticsearch parsed to dict

    Returns
    -------
    pd.DataFrame
        Dataframe of both inputs and targets. Columns are fields, rows are the training patterns (buckets from ES).
    """
    buckets = _get_buckets(data)

    dataframe = pd.DataFrame()

    for sig in signals:
        sig_values = _parse_signal_values_from_buckets(sig, buckets)
        dataframe[get_aggregated_field(sig)] = sig_values
    dataframe["ts"] = _parse_signal_values_from_buckets_key(buckets)

    dataframe.set_index("ts", inplace=True)
    return dataframe


def parse_data(training_parameters, data):
    signals = training_parameters.input_signals + training_parameters.target_signals
    if training_parameters.query_type == "docs":
        return parse_docs(signals, data)
    elif training_parameters.query_type == "histogram":
        return parse_histogram(signals, data)
    else:
        raise Exception("Unknown query type")

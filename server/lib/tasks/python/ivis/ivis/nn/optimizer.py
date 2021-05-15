"""
Code for hyperparameter optimizer.
"""
from ivis import ivis
from . import elasticsearch as es, TrainingParams
from .common import interval_string_to_milliseconds, get_ts_field, get_entities_signals


def prepare_signal_parameters(signals, entities_signals, aggregated):
    """
    Go through the `inputSignals` and `targetSignals` and preprocess the signal properties for later use. Modifies the `signals` array.
    - Determine the automatic values of numerical/categorical data types for all signals in input and target.
    - Parse float values (min, max, ...).
    - Add field and type from entity information.
    """

    for signal in signals:
        entity = entities_signals[signal["cid"]]

        if signal["data_type"] == "auto":
            if entity["type"] in ["keyword", "boolean"]:
                signal["data_type"] = "categorical"
            elif entity["type"] in ["integer", "long", "float", "double"]:
                signal["data_type"] = "numerical"
            else:
                raise TypeError("Unsupported signal type: " + entity["type"])

        signal["type"] = entity["type"]
        signal["field"] = entity["field"]

        if "min" in signal:
            if signal["min"] != "":
                signal["min"] = float(signal["min"])
            else:
                del signal["min"]
        if "max" in signal:
            if signal["max"] != "":
                signal["max"] = float(signal["max"])
            else:
                del signal["max"]

        if not aggregated or signal["data_type"] != "numerical":
            del signal["aggregation"]


def get_els_index(parameters):
    sig_set_cid = parameters["signalSet"]
    return ivis.entities["signalSets"][sig_set_cid]["index"]


def default_training_params(parameters, training_params_class=TrainingParams):
    training_params = training_params_class()
    aggregated = parameters["timeInterval"]["aggregation"] != ""

    entities_signals = get_entities_signals(parameters)
    prepare_signal_parameters(parameters["inputSignals"], entities_signals, aggregated)
    prepare_signal_parameters(parameters["targetSignals"], entities_signals, aggregated)

    training_params.index = get_els_index(parameters)
    training_params.input_signals = parameters["inputSignals"]
    training_params.target_signals = parameters["targetSignals"]
    training_params.input_width = parameters["input_width"]
    training_params.target_width = parameters["target_width"]
    ts_field = get_ts_field(parameters)
    training_params.ts_field = ts_field

    signals = parameters["inputSignals"] + parameters["targetSignals"]
    time_interval = parameters["timeInterval"]
    size = parameters["size"]

    if aggregated:
        aggregation_interval = parameters["timeInterval"]["aggregation"]
        training_params.interval = interval_string_to_milliseconds(aggregation_interval)
        training_params.query_type = "histogram"
        training_params.query = es.get_histogram_query(signals, ts_field, aggregation_interval, time_interval, size)
    else:
        training_params.query_type = "docs"
        training_params.query = es.get_docs_query(signals, ts_field, time_interval, size)

    return training_params

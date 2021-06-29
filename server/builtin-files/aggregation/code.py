from ivis import ivis

es = ivis.elasticsearch
state = ivis.state
params= ivis.params
entities= ivis.entities
#owned= ivis.owned

sig_set_cid = params['signalSet']
sig_set = entities['signalSets'][sig_set_cid]
ts = entities['signals'][sig_set_cid][params['ts']]
interval = params['interval']
offset = params['offset']

agg_set_cid =  f"aggregation_{interval}_{sig_set_cid}"

numeric_signals = { cid: signal for (cid,signal) in entities['signals'][sig_set_cid].items() if (signal['type'] in ['integer','long','float','double']) }

if state is None or state.get(agg_set_cid) is None:
  ns = sig_set['namespace']

  signals= []
  for cid, signal in numeric_signals.items():
    signal_base = {
      "cid": signal['cid'],
      "name": signal['name'],
      "description": signal['description'],
      "namespace": signal['namespace'],
      "type": signal['type'],
      "indexed": signal['indexed'],
      "settings": signal['settings']
    }
    signals.append(signal_base)

  # Cid is important it is used in the system to identify related signals
    for stat in ['min', 'max', 'count', 'sum']:
      signal = signal_base.copy()
      signal.update({
        "cid": f"_{signal_base['cid']}_{stat}",
        "name": f"{stat} of {signal_base['cid']}",
        "description": f"Stat {stat} for aggregation of signal '{signal_base['cid']}'"
      })
      signals.append(signal)

  signals.append({
      "cid": ts['cid'],
      "name": ts['name'],
      "description": ts['description'],
      "namespace": ts['namespace'],
      "type": ts['type'],
      "indexed": ts['indexed'],
      "settings": ts['settings']
  })

  state = ivis.create_signal_set(
    agg_set_cid,
    ns,
    agg_set_cid,
    f"aggregation with interval '{interval}' for signal set '{sig_set_cid}'",
    None,
    signals)

  state['last'] = None
  ivis.store_state(state)

if state is not None and state.get('last') is not None:
  last = state['last']
  filter = {
    "range": {
      ts['field']: {
        "gte" : last
      }
    }
  }

  es.delete_by_query(index=state[agg_set_cid]['index'], body={
    "query": {
      "match": {
        state[agg_set_cid]['fields']['ts']: last
      }
    }
  })

else:
  if offset is not None:
    filter = {
      "range": {
        ts['field']: {
          "gte": offset,
          "format":  "yyyy-MM-dd HH:mm:ss"
        }
      }
    }
  else:
    filter = {'match_all': {}}

query_content = {
  "bool": {
    "filter": filter
  }
}

stat_aggs = {}
for cid, signal in numeric_signals.items():
  stat_aggs[cid] = {
    "stats": {
      "field": signal['field']
    }
  }

# interval is deprecated in the newer elasticsearch, instead fixed_interval should be used
query = {
  'size': 0,
  'query': query_content,
  "aggs": {
    "sig_set_aggs": {
      "date_histogram": {
        "field": ts['field'],
        "interval": interval
      },
      "aggs": stat_aggs
    }
  }
}

res = es.search(index=sig_set['index'], body=query)

for hit in res['aggregations']['sig_set_aggs']['buckets']:
  last = hit['key_as_string']
  doc = {}
  for cid in numeric_signals.keys():
    doc[state[agg_set_cid]['fields'][f"_{cid}_min"]]= hit[cid]['min']
    doc[state[agg_set_cid]['fields'][cid]]= hit[cid]['avg']
    doc[state[agg_set_cid]['fields'][f"_{cid}_max"]]= hit[cid]['max']
    doc[state[agg_set_cid]['fields'][f"_{cid}_count"]]= hit[cid]['count']
    doc[state[agg_set_cid]['fields'][f"_{cid}_sum"]]= hit[cid]['sum']

  doc[state[agg_set_cid]['fields'][ts['cid']]] = last
  res = es.index(index=state[agg_set_cid]['index'], id=last, doc_type='_doc', body=doc)


state['last'] = last
ivis.store_state(state)
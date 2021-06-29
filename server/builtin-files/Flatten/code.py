from ivis import ivis
from elasticsearch import helpers

es = ivis.elasticsearch
state = ivis.state

params = ivis.parameters
entities = ivis.entities
owned = ivis.owned

sig_set = params['signalSet']
sig_set['namespace'] = sig_set['namespace'] if sig_set['namespace'].isdigit() else 1

method = params['resolutionMethod']
sets = params['sets']

if owned['signalSets'].get(sig_set['cid']) is None:
  ns = sig_set['namespace']

  signals= {}
  for sigSet in sets:
    for signal in sigSet['signals']:
      if signals.get(signal) is not None:
        if signals[signal]['type'] != entities['signals'][sigSet['cid']][signal]['type']:
          raise Exception(f"Signals with same cid have to share type")
      else:
        signals[signal] = entities['signals'][sigSet['cid']][signal]

  state = ivis.create_signal_set(sig_set['cid'],sig_set['namespace'],sig_set['name'], sig_set['description'], None, list(signals.values()))

  ivis.store_state(state)

last = None
if state is not None and state.get('last') is not None:
  last = state['last']
  query_content = {
    "bool": {
      "filter": {
        "bool": {
          "should": [{"range": { entities['signals'][sigSet['cid']][sigSet['ts']]['field']: { "gte": last}}}  for sigSet in sets]
              #{"range": { entities['signals'][sets[0]['cid']]['ts']['field']: { "gte": "2020-08-17" }}},
          }
        }
    }
  }


else:
  print('u')
  query_content = {'match_all': {}}



indices=",".join([entities['signalSets'][sigSet["cid"]]['index'] for sigSet in sets])


query= {
  "sort" : [
     {"_script" : {
      "type" : "number",
      "script" : {
        "lang": "painless",
        "source": """
          long epoch = 0;
          for (int i = 0; i < params.tsSigs.length; i++) {
            if (doc.containsKey(params.tsSigs[i])) {
             epoch = doc[params.tsSigs[i]].value.toInstant().toEpochMilli();
             break;
            }
          }
          return epoch;
          """,
        "params" : {
          "tsSigs" : [entities['signals'][sigSet["cid"]][sigSet["ts"]]['field']  for sigSet in sets]
        }
      },
      "order" : "asc"
    }}
    #{entities['signals'][sets[0]['cid']]['ts']['field'] : {"order" : "asc"}},
    #{ entities['signals'][sets[1]['cid']]['ts']['field'] : {"order" : "asc"}}
  ],
  'query': query_content
}

i=0
for hit in helpers.scan(
    es,
    index=indices,
    preserve_order=True,
    query=query,
    scroll='5m',
    size=1000):

  time=hit['_id']


print(time)
print(indices)
quit()


for hit in res['aggregations']['stats']['buckets']:
  last = hit['key_as_string']
  doc = {
    state['aggs']['fields']['ts']: last,
    state['aggs']['fields']['min']: hit['min']['value'],
    state['aggs']['fields']['avg']: hit['avg']['value'],
    state['aggs']['fields']['max']: hit['max']['value']
  }
  res = es.index(index=state['aggs']['index'], doc_type='_doc', body=doc)

# Request to store state
state['last'] = last
ivis.store_state(state)
import zipfile, json, glob
def decode(v):
    if not isinstance(v,dict): return v
    if 'o' in v: return {x['k']:decode(x['v']) for x in v['o']}
    if 'a' in v: return [decode(x) for x in v['a']]
    for k in ('n','s','b'): 
        if k in v: return v[k]
    return None
for file in glob.glob('artifacts/browser/*/trace.zip'):
    if not any(k in file for k in ('interaction-', 'world-interactions')): continue
    print(file)
    z=zipfile.ZipFile(file)
    previous={}
    for name in z.namelist():
        if not name.endswith('.trace'): continue
        for line in z.read(name).splitlines():
            event=json.loads(line)
            value=decode(event.get('result',{}).get('value'))
            if isinstance(value,dict) and 'pendingSeat' in value:
                s={k:value.get(k) for k in ('name','x','z','pendingSeat','seated','action','toast','status','started')}
                s['self']=next((p for p in value.get('players',[]) if p['id']==value.get('selfId')),None)
                if previous.get(s['name'])!=s:
                    print(json.dumps(s,ensure_ascii=True))
                    previous[s['name']]=s

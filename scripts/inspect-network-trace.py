import glob,json,zipfile
for path in glob.glob('artifacts/browser/phase13-private*/trace.zip'):
    archive=zipfile.ZipFile(path)
    print(path)
    for name in archive.namelist():
        if not name.endswith('.network'): continue
        for line in archive.read(name).splitlines():
            event=json.loads(line)
            s=event.get('snapshot',{})
            request=s.get('request',{})
            if 'socket.io' in request.get('url',''):
                print(json.dumps({'url':request['url'],'method':request.get('method'),'time':s.get('time'),'status':s.get('response',{}).get('status'),'started':s.get('startedDateTime'),'timings':s.get('timings')}))
                messages=s.get('_webSocketMessages',[])
                print('keys', list(s), 'messages',len(messages))
                for message in messages:
                    print(json.dumps(message))

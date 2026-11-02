#!/usr/bin/env bash
# Drive one Craft turn through Onyx's own API and print what the agent did.
# Usage: craft_turn.sh <cookie jar> <session id | new> <message>
# Prints the session id, every shell command the agent ran (with an output
# excerpt), any error, and the agent's reply. Waits up to 25 minutes for the
# turn's end marker (context_usage) or an error.
set -euo pipefail
B=http://localhost:3390/api; J=$1; SID=$2; MSG=$3
if [ "$SID" = new ]; then
  SID=""
  for attempt in 1 2 3; do
    SID=$(curl -s -b "$J" -H "Content-Type: application/json" -d '{"name":"ep study","headless":true}' $B/build/sessions \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || true)
    [ -n "$SID" ] && break
    sleep 10
  done
  [ -n "$SID" ] || { echo "could not create a session"; exit 1; }
  for i in $(seq 1 60); do curl -s -b "$J" $B/build/sessions/$SID/sandbox-status | grep -q running && break; sleep 3; done
  ATTACHMENTS="[]"
  if [ -n "${ATTACH:-}" ]; then
    ATTACHMENTS=$(for f in $(echo "$ATTACH" | tr "," " "); do curl -s -b "$J" -F "file=@$f" $B/build/sessions/$SID/upload; echo; done | python3 -c "
import sys,json,mimetypes
out=[]
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    d=json.loads(line); out.append({'name':d['filename'],'path':d['path'],'mime_type':mimetypes.guess_type(d['filename'])[0] or 'application/octet-stream'})
print(json.dumps(out))")
    echo "attachments $ATTACHMENTS"
  fi
  export ATTACHMENTS
fi
echo "session $SID"
before=""
for attempt in 1 2 3 4 5; do
  before=$(curl -s -b "$J" $B/build/sessions/$SID/messages | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['messages']))" 2>/dev/null || true)
  [ -n "$before" ] && break
  sleep 5
done
[ -n "$before" ] || { echo "could not read messages"; exit 1; }
python3 -c "
import json,sys,os
body={'content': sys.argv[1]}
if os.environ.get('ATTACHMENTS') and os.environ['ATTACHMENTS']!='[]': body['attachments']=json.loads(os.environ['ATTACHMENTS'])
if os.environ.get('CRAFT_MODEL'): body.update(provider='bedrock', provider_id=1, model=os.environ['CRAFT_MODEL'])
print(json.dumps(body))" "$MSG" \
  | curl -s -b "$J" -H "Content-Type: application/json" -d @- $B/build/sessions/$SID/send-message > /dev/null
for i in $(seq 1 300); do
  done_flag=$(curl -s -b "$J" $B/build/sessions/$SID/messages | python3 -c "
import sys,json
m=(json.load(sys.stdin) or {}).get('messages') or []; m=m[$before:]
print(any((x.get('message_metadata') or {}).get('type') in ('context_usage','error') for x in m))")
  [ "$done_flag" = True ] && break
  sleep 5
done
curl -s -b "$J" $B/build/sessions/$SID/messages | python3 -c "
import sys,json
m=(json.load(sys.stdin) or {}).get('messages') or []; m=m[$before:]
for x in m:
    md=x.get('message_metadata') or {}
    t=md.get('type')
    if t=='tool_call_progress' and md.get('status')=='completed':
        cmd=(md.get('rawInput') or {}).get('command') or md.get('title')
        out=(md.get('rawOutput') or {}).get('output') if isinstance(md.get('rawOutput'),dict) else ''
        print('$', str(cmd)[:200].replace(chr(10),' ; '))
        if out: print('   ', str(out)[-300:].replace(chr(10),' | '))
    elif t=='agent_message':
        c=md.get('content') or {}
        print('AGENT:', c.get('text') if isinstance(c,dict) else c)
    elif t=='error':
        print('ERROR:', md.get('message'))
    elif t=='context_usage':
        print('[turn end, tokens', md.get('used_tokens'), ']')
"

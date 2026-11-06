#!/usr/bin/env bash
# One line per tool flow: did the agent run the named tool command, errors, inline charts loaded, banned terms.
TAG=$1; J=$2; TOOL=${TAG#t_}
cat ~/craft-ep/flow-$TAG-turn?.txt > /tmp/audit-$TAG.txt 2>/dev/null
runs=$(grep -cE "^\\$ .*(^|[ ;&|(])$TOOL( |$)" /tmp/audit-$TAG.txt)
[ "$TOOL" = conversation ] && runs=$(grep -cE "^\\$ .*(conversation|Conversation)" /tmp/audit-$TAG.txt)
errs=$(grep -c "^ERROR" /tmp/audit-$TAG.txt)
ok=0; n=0; for u in $(grep -oE "/api/build/sessions/[^) ]+\.png" /tmp/audit-$TAG.txt | sort -u); do n=$((n+1)); c=$(curl -s -o /dev/null -w "%{http_code}" -b $J "http://localhost:3390$u"); [ "$c" = 200 ] && ok=$((ok+1)); done
banned=$(sed -n "/^AGENT:/,\$p" /tmp/audit-$TAG.txt | grep -vE "^(\\$|    )" | grep -oiE "market share|penetration|market size" | wc -l)
replied=$(grep -c "^AGENT:" /tmp/audit-$TAG.txt)
echo "$TAG tool_runs=$runs errors=$errs charts=$ok/$n banned=$banned replies=$replied"

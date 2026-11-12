#!/usr/bin/env bash
# Summarize one finished three-turn flow: errors, inline chart count and HTTP status, banned terms, cost line.
TAG=$1; J=$2
for t in 1 2 3; do
  f=~/craft-ep/flow-$TAG-turn$t.txt; [ -f "$f" ] || continue
  errs=$(grep -c "^ERROR" "$f"); cmds=$(grep -c "^\\$" "$f")
  imgs=$(grep -oE "\!\[[^]]*\]\(/api/build/sessions/[^)]+\)" "$f" | sort -u)
  n=$(printf "%s" "$imgs" | grep -c . )
  ok=0; for u in $(printf "%s\n" "$imgs" | grep -oE "/api/build[^)]+"); do c=$(curl -s -o /dev/null -w "%{http_code}" -b "$J" "http://localhost:3390$u"); [ "$c" = 200 ] && ok=$((ok+1)); done
  banned=$(sed -n "/^AGENT:/,\$p" "$f" | grep -vE "^(\\$|    )" | grep -oiE "market share|penetration|adoption|market size" | sort | uniq -c | tr "\n" " ")
  cost=$(grep -oiE "\\\$[0-9]+\.[0-9]+[^|]{0,40}(pilot|full|cost|respondent)|(pilot|full|actual|total) cost[^|]{0,30}\\\$[0-9.]+" "$f" | head -1)
  echo "$TAG turn$t: cmds=$cmds errors=$errs images=$n loaded=$ok banned=[${banned}] cost=[${cost}]"
done

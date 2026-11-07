#!/usr/bin/env bash
# Three-turn flow for one Expected Parrot tool prompt: ask, approve, finish. Turn output in ~/craft-ep/flow-<tag>-turnN.txt
set -uo pipefail
TAG=$1; J=$2
Q=$(awk -F"\t" -v t="$TAG" "\$1==t{print \$2}" ~/craft-ep/ep_tool_prompts.tsv)
~/craft-ep/craft_turn.sh $J new "$Q" > ~/craft-ep/flow-$TAG-turn1.txt 2>&1
SID=$(grep -m1 "^session " ~/craft-ep/flow-$TAG-turn1.txt | awk "{print \$2}")
~/craft-ep/craft_turn.sh $J $SID "Approved. Go ahead with the tool." > ~/craft-ep/flow-$TAG-turn2.txt 2>&1
~/craft-ep/craft_turn.sh $J $SID "Approved. Finish it and show me the results." > ~/craft-ep/flow-$TAG-turn3.txt 2>&1
echo "FLOW-DONE $TAG $SID"

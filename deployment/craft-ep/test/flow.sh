#!/usr/bin/env bash
# Three-turn customer flow: ask, approve plan, approve full run. Output per turn in ~/craft-ep/flow-<tag>-turnN.txt
set -uo pipefail
TAG=$1; Q=$2; J=${3:-$HOME/craft-ep/user.cookies}
~/craft-ep/craft_turn.sh $J new "$Q" > ~/craft-ep/flow-$TAG-turn1.txt 2>&1
SID=$(head -1 ~/craft-ep/flow-$TAG-turn1.txt | awk "{print \$2}")
~/craft-ep/craft_turn.sh $J $SID "Approved. Run the pilot." > ~/craft-ep/flow-$TAG-turn2.txt 2>&1
~/craft-ep/craft_turn.sh $J $SID "${4:-Approved. Run the full study with 20 respondents per group and show me the charts.}" > ~/craft-ep/flow-$TAG-turn3.txt 2>&1
echo "FLOW-DONE $TAG $SID"

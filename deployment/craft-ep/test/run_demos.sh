#!/usr/bin/env bash
# Run a list of demo tags from ep_demos.tsv through the three-turn flow as one user, one after another.
J=$1; shift
for tag in "$@"; do
  q=$(awk -F"\t" -v t="$tag" "\$1==t{print \$2}" ~/craft-ep/ep_demos.tsv | sed "s/\\\\n/\n/g")
  ~/craft-ep/flow.sh "$tag" "$q" "$J"
done

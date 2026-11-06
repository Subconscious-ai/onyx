#!/bin/sh
# Install each Expected Parrot tool (ep-tools.txt: repo sha scripts) into its own venv
# under /opt/ep-tools/<repo>, link its commands into /usr/local/bin, and log the outcome.
set -u
mkdir -p /opt/ep-tools
: > /opt/ep-tools/install.log
while read -r repo sha scripts; do
  [ -n "$repo" ] || continue
  v=/opt/ep-tools/$repo
  if python3 -m venv "$v" >/dev/null 2>&1 && "$v/bin/pip" install -q --no-cache-dir "git+https://github.com/expectedparrot/$repo.git@$sha" > "$v.pip.log" 2>&1; then
    for s in $(echo "$scripts" | tr , ' '); do
      [ -x "$v/bin/$s" ] && ln -sf "$v/bin/$s" "/usr/local/bin/$s"
    done
    echo "$repo ok" >> /opt/ep-tools/install.log
  else
    echo "$repo FAILED $(tail -1 "$v.pip.log" 2>/dev/null | cut -c1-160)" >> /opt/ep-tools/install.log
  fi
done < "$1"
# Dependency drift (2026-11-02): raiffa needs click; flyvbjerg imports typer._click Exit, gone after typer 0.26.
[ -x /opt/ep-tools/raiffa/bin/pip ] && /opt/ep-tools/raiffa/bin/pip install -q --no-cache-dir click
[ -x /opt/ep-tools/flyvbjerg/bin/pip ] && /opt/ep-tools/flyvbjerg/bin/pip install -q --no-cache-dir "typer==0.26.0"
chmod -R a+rX /opt/ep-tools

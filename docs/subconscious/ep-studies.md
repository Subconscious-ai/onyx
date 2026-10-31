# Expected Parrot studies from the Beca chat

Plan and progress: [onyx #109](https://github.com/Subconscious-ai/onyx/issues/109).

Beca designs, runs and analyzes surveys and experiments with the open-source
Expected Parrot library (EDSL, MIT) through one MCP server,
`scripts/subconscious/serve_ep.py`. It wraps EDSL and Expected Parrot's public
chart assets (`plot_style.py` and the standard plots that ship inside the
`edsl` package). Charts return as MCP image content, which native Onyx saves
into the conversation. Study objects live as JSON under a workspace directory
and are addressed by name, so a later turn can reuse what an earlier turn built.

## Run the wrapper

```bash
uv venv ~/ep-venv --python 3.12
~/ep-venv/bin/uv pip install -r scripts/subconscious/ep-requirements.txt
EP_MCP_TOKEN=<32+ random characters> ~/ep-venv/bin/python \
  scripts/subconscious/serve_ep.py --workspace ~/ep-workspace --host 127.0.0.1 --port 3194
```

Tests use EDSL's keyless `test` model and spend nothing:

```bash
cd scripts/subconscious && ~/ep-venv/bin/python -m pytest test_serve_ep.py -q
```

## Register it in Onyx

An administrator registers the server under Actions, MCP servers: URL
`http://<host>:3194/mcp`, authentication API token, performer admin, the
`EP_MCP_TOKEN` value as the token. Discover tools, then attach them to a
persona whose system prompt is `docs/subconscious/ep-research-prompt.md`.
Onyx's outbound guard blocks loopback and private addresses unless the
administrator's SSRF protection setting allows them; the agent-dev stack
reaches other private tailnet hosts, so it allows private addresses.

Paid models need provider keys in the wrapper's environment (`OPENAI_API_KEY`,
`GEMINI_API_KEY`, or AWS credentials for Bedrock). Without them only the
`test` model runs. The persona prompt makes Beca call `estimate_cost` and ask
before any paid run.

## Demos

`scripts/subconscious/ep_demo.py` drives a chat through Onyx's API, one
Expected Parrot example per demo, and saves the transcript, the tool calls and
every returned image under `~/ep-demos/<demo>/`. That folder is the proof that
the chat reproduced the example.

```bash
ONYX_DEMO_EMAIL=... ONYX_DEMO_PASSWORD=... ~/ep-venv/bin/python \
  scripts/subconscious/ep_demo.py --base http://localhost:8088 --persona <id> --demo quickstart
```

## What Expected Parrot does not provide

No chart library: its hosted agent writes matplotlib scripts, which the
wrapper reproduces. No census-weighted population builder: audiences are
trait lists, drafted personas, or imported files. Human recruiting goes
through `humanize` (a web survey link) or Prolific, both of which need an
Expected Parrot account.

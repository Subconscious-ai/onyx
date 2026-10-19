# GPT Researcher preview

Native Onyx calls the existing GPT Researcher MCP server. Collection and source retrieval remain upstream.

## Install and run

Use Python 3.12. Pin the upstream checkout and dependencies:

```bash
git clone https://github.com/assafelovic/gptr-mcp.git /private/path/gptr-mcp
git -C /private/path/gptr-mcp checkout 63884773685b1f12c7f0d9e283b3d71a5b9b5fda
uv venv --python 3.12 /private/path/research-venv
uv pip install --python /private/path/research-venv/bin/python -r scripts/subconscious/research-requirements.txt
```

Supply `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `EXA_API_KEY` and `GPTR_PREVIEW_TOKEN` through private configuration. The preview token requires at least 32 characters. Never commit credentials.

```bash
/private/path/research-venv/bin/python scripts/subconscious/serve_research.py \
  --upstream /private/path/gptr-mcp --host 127.0.0.1 --port 3193
```

Nova Pro performs research synthesis. Titan v2 supplies embeddings. Exa performs search. Exa 1.16.2 preserves compatibility with GPT Researcher 0.14.8; newer Exa versions removed an argument used upstream.

The adapter exposes `deep_research`, `get_research_sources` and `get_research_context`. Each call has a 120-second cancellation deadline. A timeout returns an explicit unavailable receipt with no source URLs. Public queries have an 800-character limit and reject email addresses. The email check does not detect every form of private information. The interview rubric restricts research requests to public company or category context.

Upstream research context is generated synthesis. Source URLs support inspection of original material. A successful research receipt does not validate every generated claim.

## Native Onyx connection

Register the server through native Onyx MCP administration. Select Streamable HTTP with administrator-managed bearer authentication. Restrict the connection to the private QA agent. Native Onyx encrypts connection credentials.

The current QA connection uses the existing Vercel preview API proxy at `/api/research-mcp/mcp`. The gateway forwards `/research-mcp/` to the research listener on the Docker bridge. Bind the listener to the gateway-reachable bridge address for the Docker configuration. Preserve the default loopback binding for a host-only configuration.

Vercel preview authentication remains enabled. The temporary connection also includes an authorized Vercel preview cookie. The gateway strips cookies before contacting GPT Researcher. The researcher requires a separate bearer token. Native SSRF restrictions remain enabled; no private-address allowlist is added.

The preview depends on the local Onyx stack, research process, gateway, workstation and unexpired preview authorization. Research receipts remain in upstream process memory. A restart removes receipt context. The adapter supplies no production service manager or durable job queue.

After native registration, attach discovered tool IDs through the existing installer:

```bash
python3 scripts/subconscious/configure_executive.py \
  --cookies /private/path/administrator-cookies.txt \
  --source-agent <existing-agent-id> --name 'Executive model QA' \
  --model-configuration <existing-bedrock-model-id> \
  --tool-id <deep-research-id> --tool-id <sources-id> --tool-id <context-id> --apply
```

Use `--update-agent` for subsequent updates. Default tool and document permissions come from the source agent. The named QA agent uses native chat; the executive side panel currently recognizes the exact `Executive interview` agent name.

## Replay

```bash
python3 scripts/subconscious/eval_interview.py \
  --cookies /private/path/administrator-cookies.txt \
  --agent <qa-agent-id> --scenario-file scripts/subconscious/model_cases.json \
  --output /private/path/model-replay.json
```

The runner creates synthetic sessions and soft-deletes runner-created sessions by default. `--keep-sessions` retains sessions for browser inspection. Store transcripts privately.

The three cases cover retail velocity, subscription renewals and service capacity. Each case requests real research, executed arithmetic and an explicit scenario boundary. Original regression cases remain available without `--scenario-file`.

`first_content_packet_ms` measures backend content arrival, including possible provider reasoning text. The metric does not prove visible browser latency. `scripted_read_answer_minutes_proxy` assumes 40 answer words/minute, 200 reading words/minute and 15 seconds of preparation per turn. Script instructions inflate the estimate; the proxy excludes machine waiting. No human executive time is measured.

A requested model checkpoint is not a usable-model pass. Manual review must assess question materiality, repeated topics, source support, units, assumptions and decision usefulness. Arithmetic checks compare expected Python outputs; correct numeric outputs alone cannot validate a model.

## Remaining integration

Research currently runs on demand. Email-triggered parallel preparation, PDL enrichment, accepted causl-kb writes and saved Guesstimate models remain outside the implemented connection. Public references never establish accepted company facts.

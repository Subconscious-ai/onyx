# Executive interviewer preview

The executive workspace wraps native Onyx chat. Onyx continues to own streaming, conversation persistence, citations, attachments, tools, model selection and authentication. A single AWS model response contains the spoken question and a compact working brief; no second extraction request or new agent runtime is introduced.

## Entry points

- `/app/executive` resolves the accessible **Executive interview** agent without a hardcoded database ID.
- `/executive-preview` is a labeled, interactive design sample with fictional company data. The sample is separate from live interviews and never writes customer records.

The live workspace includes four specialist descriptions, a customer journey, evidence attribution, proposed interventions and a Markdown brief download. The native transcript remains the record; the side panel is a validated display projection reconstructed from saved messages or current streaming packets.

## Configure an existing Onyx instance

Use the existing administrator session and an existing AWS Bedrock model configuration. The source agent supplies enabled tools and document-set access; the source agent remains unchanged.

```bash
python3 scripts/subconscious/configure_executive.py \
  --origin http://localhost:3011 \
  --cookies /private/path/to/administrator-cookies.txt \
  --model-configuration 8 \
  --source-agent 1 --apply
```

The command returns the saved agent ID and verifies the prompt, tool attachments and model configuration through a fresh read. Subsequent updates require `--update-agent <saved-id>`. A different agent name is rejected. The model configuration ID is instance-specific and must identify an existing Bedrock model.

## Vercel frontend and local preview transport

The Vercel project uses the repository's `web` root, Next.js, `bun install --frozen-lockfile`, and `bun run build`. Preview environment variables:

```text
INTERNAL_URL=https://<authenticated-preview-backend>
OVERRIDE_API_PRODUCTION=true
```

Automatic Git deployments are disabled in `web/vercel.json`; preview publication uses an explicit Vercel deployment with the pushed Git SHA and the API's `staging` target. The initial automatic Git deployment selected production and was canceled. Docker standalone output remains enabled outside Vercel; Vercel builds omit standalone packaging to avoid Next.js issue #96646.

`preview-nginx.conf` provides a temporary transport on the existing `onyx_default` Docker network. Native Onyx authenticates every private request. Public account registration and alternate enrollment routes are disabled on the gateway. Bind the container port to loopback before attaching a dedicated HTTPS preview tunnel. Preserve existing Tailscale serve rules.

Current preview transport uses container `onyx-executive-preview-gateway`, loopback port 3176, and a dedicated Tailscale Funnel HTTPS listener on port 10000. The local Onyx stack and workstation must remain online. The gateway carries no model-provider or MCP credentials. Stop the dedicated listener with `tailscale funnel --https=10000 off`; stop the dedicated container separately. No production backend migration is included.

## Evidence and limitations

- Twelve regression cases cover restored objectives and journey stages, live packet updates, incomplete updates, native stream termination, attributable quotes, safe source URLs, grounded contradictions, intervention references and preservation of newer executive corrections.
- The existing nine catalog checks pass. Executive pilot copy remains English in every locale catalog; no translated pilot experience is claimed.
- Full TypeScript checks pass. Focused lint has no errors; two pre-existing assertion warnings remain in native AppPage and AgentMessage.
- Real AWS Bedrock responses were exercised against synthetic hospital-software interviews. Observed first-output times across three probes were 2.5–6.7 seconds; the range is a small local sample, not a latency SLA.
- Browser checks verified immediate brief updates, identical state after reload, a mobile evidence view without horizontal overflow, and a reachable native composer after returning to the conversation.
- Four running-gateway checks cover login bootstrap, JSON access denials, blocked public enrollment and authenticated session refresh. Run `PREVIEW_COOKIE_JAR=/private/path/to/cookies.txt python3 scripts/subconscious/test_preview_gateway.py`. Set `PREVIEW_GATEWAY_URL` for a different authorized gateway.
- Model quote fidelity is imperfect. Altered or invented quotes remain assumptions rather than attributed executive evidence. A valid later quote restores attribution. Recruiting cases are synthetic evaluation material, not client evidence.

## Remaining unified-plan work

The native interviewer slice is implemented. Email-triggered PDL preparation, background GPT Researcher delivery, accepted causl-kb market writes and the saved Guesstimate V3 model connection are not implemented by this PR. The UI reports the pending market/model connection instead of presenting conversation JSON as canonical ontology or as a saved calculation model.

Accepted market memory must continue through causl-kb's existing tenant authority and safe door. The next integration must bind the authenticated Onyx principal to the authorized causl-kb organization, reuse the current preparation queue, and save the validated model through the Guesstimate boundary. A model-supplied email, organization ID or journey object cannot establish authorization. Existing causl-kb #433, #437 and #450 cover relevant preparation, memory and organization work; no shared database schema is duplicated in Onyx.

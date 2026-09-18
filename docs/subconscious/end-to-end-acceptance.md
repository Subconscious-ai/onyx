# Burn end-to-end acceptance

Run `scripts/subconscious/acceptance/run.cjs` against the actual deployment.
This suite uses Playwright, the existing three prototype cases, and `eval_interview.py`.
It does not mock routes, replace agents, create accounts, or change authentication.

## What the suite checks

1. Start fresh native SSO for two authorized browser sessions and verify their account IDs.
   Remove only the test context’s native cookie, click the existing provider button, and require a successful callback.
2. Inspect phone and desktop entry pages for Beca and unwanted workflow controls.
3. Interview software, grocery and consulting executives through the real composer.
   Check known repeated-question failures, corrected goals, sourced journeys and unknown inputs.
   Wait for automatic preparation and verify saved messages after reload.
4. Open each interview's real model popup. Review sourced stages and edges.
   Generate, approve, save and reopen the model. Compare persisted cells with the submitted document.
   Reject a replayed save. For software, check the native calculated baseline against
   `1,000 leads × 10% conversion × $100 contribution = $10,000`.
5. Check both directions of company isolation for synthetic chats, research, models and experiments.
   Each resource requires an owner read, owner search, outsider read denial and outsider search omission.
   Authenticate both identities on the resource's own service. Anonymous denial is insufficient.

A usable model needs the model check, not merely a saved brief. A failed interview
still leaves evidence for diagnosis. Its model check may run, but cannot turn the overall result green.
All ten checks must pass. Missing accounts or dependent artifacts are blocked, with exit code 1.
The suite never treats skipped or absent coverage as success.

## Run

Install the repository's frontend dependencies and Playwright Chromium normally.
Python 3 is required for the existing interview evaluator.
Copy `scripts/subconscious/acceptance/config.example.json` to a private directory outside Git.
Use normal authorized browser sign-in to save Playwright storage states for both accounts.
Each state must contain Burn and causl-kb sessions for the intended test organization.
For experiment probes, include the corresponding native experiment-service session.
Do not copy the same account into both states or use administrator impersonation.

Set the exact deployment, application origins, expected user IDs and organization IDs.
`callbackOrigins` permits the existing canonical login redirect; it does not bypass authentication.
For an isolated worktree, `playwrightPackageRoot` may point to an installed `web` directory.
An optional `executablePath` selects an already installed Chromium binary.

```sh
node --test scripts/subconscious/acceptance/checks.test.cjs
node scripts/subconscious/acceptance/run.cjs /absolute/private/config.json
```

The runner creates synthetic interviews and markets. It retains them for inspection.
It prints their IDs in the private report. It never deletes existing customer data.
Use only authorized QA accounts. Prompts forbid paid experiment execution.
The suite does not exercise study launch or paid execution.

## Isolation fixtures

Provide eight synthetic resources, one per category and owner direction:
`chats`, `research`, `models`, `experiments`, each owned by `A` and `B`.
Use existing synthetic fixtures. Research and experiment fixtures need not trigger new provider jobs.
A resource entry has this shape:

```json
{
  "kind": "chats",
  "owner": "A",
  "synthetic": true,
  "url": "https://BURN-HOST/api/chat/get-chat-session/SYNTHETIC-ID",
  "identityUrl": "https://BURN-HOST/api/me",
  "searchUrl": "https://BURN-HOST/api/chat/search?query=UNIQUE-SYNTHETIC-TITLE",
  "marker": "UNIQUE-SYNTHETIC-TITLE"
}
```

List additional service origins explicitly in `resourceOrigins`. Read and search endpoints
must return JSON. Identity endpoints must return an authenticated `id`. Adapt through existing
service APIs if their identity shape differs; do not invent a passing identity response.
A 401, redirect, HTML sign-in page, or missing owner resource cannot pass isolation.
A 403 or 404 is accepted only after successful distinct service identity checks.
Use unique synthetic markers present in the owner response and search result.

This matrix tests resource reads and searches. It does not certify all enterprise security.
Write authorization, sharing, downloads, revocation, background jobs, citations and native caller-scoped
MCP invocation still need their applicable service tests. Do not claim those from this receipt.

## Evidence and limits

Each run writes a private `report.json` and available screenshots beneath a unique run directory.
The report includes source revision, configured deployment, exact inputs, answers, timings,
known rubric failures, retained resource IDs and each acceptance status.
Deployment IDs are operator-supplied; independently confirm them before release sign-off.
Browser credentials and raw transcripts must remain outside Git.

The reading/answer-time proxy uses 40 words/minute for answers, 200 for reading, and 15 seconds
per turn. It is not observed executive time. Latency reports total turn time, not first-token latency.
Known-pattern checks are not comprehensive factuality or materiality judgments; inspect the saved answers.
Unknown inputs are expected in grocery and consulting models; do not fill them to make tests pass.
Fresh native SSO reuses an authorized Auth0 session or enters dedicated synthetic credentials. It does not test customer password reset, MFA recovery or onboarding. The test never revokes the original session.

For unattended synthetic login, set `accounts.A.credentialsFile` and `accounts.B.credentialsFile` to a private JSON file. Each named entry contains `email` and `password`. Only reserved `burn-qa-a-<hex>@example.com` and `burn-qa-b-<hex>@example.com` addresses are accepted. Keep this file outside Git with mode 0600. Updated browser state is saved to the configured private state path.

## Initial execution

The initial September 17 restoration run reached the real hosted login boundary. The retained account-A state
could not reach an authenticated app, and no account-B state was supplied. All dependent checks were blocked;
no live interview, model or enterprise-isolation pass was claimed. Guard tests passed.
A direct browser inspection confirmed a redirect to Vercel’s login page before native sign-in.
Supply authorized preview access, current sessions and fixture coverage, then rerun the same command.

The final runner additionally requires a fresh native OIDC callback. Configure `ssoButtonName`,
`identityHost` or `nativeSessionCookie` only when the deployed native configuration differs.
An expired Auth0 session blocks the run instead of bypassing sign-in.

## September 17 live follow-up

Removed the Vercel team-login gate on `onyx-executive` and `causl-kb`. Native authentication remains enabled.
Fresh Auth0 sign-in passed for two dedicated synthetic accounts. Each has viewer access to Beca only.
Separate native Clerk organizations and sessions were provisioned for the paired model preview.
Unauthenticated Burn identity requests still return 403. Native chat reads return 200 for owners and 403 for the other account, in both directions.

Run `b5bdf31f-d927-4251-bdf4-7fd4e5ca553d` remains failed. Three interviews completed, with 2–5 second replies and no known-pattern rubric failures. Automatic saved briefs timed out. Manual preparation succeeded as a diagnostic; it is not an automatic-preparation pass. Model save/reopen remains unverified. The full isolation fixture matrix is absent. Default `/app` opens the generic assistant.

[Open Beca directly](https://onyx-executive.vercel.app/app?agentId=5) for exploratory UAT.
The serving canonical preview was deployment `dpl_Hsdhxe2ZfyEkpCuaeSeGGFtUWbuW`, source `de422c4b8f6d020d98d38324fb82c74b1c9dd25e`.
Its model destination is `https://causl-scenarios-558-subconcious.vercel.app/dashboard/burn-import`.
This is paired preview evidence, not a causl-kb production release.

The native background container was restarted after this failure. Its configuration was preserved; no API restart occurred.
A fresh worker process could prepare a settled synthetic conversation. That does not establish queued-worker completion under rapid turns.

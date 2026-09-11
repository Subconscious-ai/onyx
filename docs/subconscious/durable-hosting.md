# Durable Burn hosting

Active issue: Subconscious-ai/onyx#4. Base: executive interviewer a93ef9a24b.

## Outcome

The existing Vercel application works without a desktop or Tailscale Funnel dependency. Native Onyx retains conversations, accounts, AWS models, the research corpus and automatic briefs.

## Deployment decision

Vercel hosts the existing frontend and API forwarding. The native Onyx stack runs on the existing AWS host behind HTTPS at api.dev.subconscious.ai/burn2. Vercel Container Images support HTTP services, but persistent databases, search storage and Celery workers need backing services. Keeping the native stack together avoids exposed database ports and a serverless rewrite.

Existing service routes remain unchanged. Native authentication and the existing restrictive gateway remain active. Databases bind only inside Docker. Code execution must not receive the production host Docker socket. Retain the current feature PRs as drafts; hosting authorization does not imply a feature merge.

## Milestones

1. Pin running images and private configuration. Prepare isolated services and restart policies on AWS. Provide bounded resource limits and an isolated execution daemon.
2. Copy a consistent native database/search/object-store snapshot. Preserve account encryption and original messages. Verify restored conversation counts and existing account login.
3. Publish the isolated HTTPS route and Vercel candidate. Verify streaming, PDL, source search, automatic brief persistence, and authenticated model handoff without desktop endpoints.
4. Verify a backup restore and service restart. Switch the existing QA alias only after proof. Keep the original data snapshot for rollback; avoid deleting original volumes.

## Current evidence and recovery

Vercel CLI authentication works. The linked team is subconcious; project onyx-executive. Ubuntu SSH to rehoboam-dev works. The EC2 instance role supports identity readback but denies volume inventory and S3 bucket listing. Both local AWS deployment profiles have expired; refreshed AWS access is requested for independent backup configuration.

Existing AWS host has 32 GiB RAM and approximately 35 GiB free disk. Existing native Onyx uses approximately 8 GiB RAM. Native images and volumes must be pinned and resource bounded before migration. The existing api.dev.subconscious.ai certificate avoids a DNS change. No runtime or public route has changed yet.

## Hosting preparation (2026-09-11 UTC)

AWS API and research images built. CPU-only PyTorch 2.9.1 model image replaces the CUDA image that exceeded available extraction space. Native model code and embedding weights remain unchanged. Services use isolated `burn2_*` volumes. Python execution uses a separate rootless Docker daemon with resource limits.

A private Vercel Blob store (`burn2-durable-backups`, iad1) is connected to the Onyx project. The backup token and archive encryption key live outside Git, root-only on AWS and in the local private recovery directory. Renewed AWS SSO is no longer required for backups. Daily backups include Postgres, source objects, and private runtime configuration; the search index is rebuildable and included in the initial cold migration snapshot. Retention automation is deferred; no backup is automatically deleted.

Focused proof: the frontend Host-header regression failed before the fix and 10 proxy/SSR tests pass afterward. The Bedrock bearer-token regression failed against the original research launcher and all three research-launcher tests pass afterward. Cloud migration, restart, restore and user-flow checks remain pending.

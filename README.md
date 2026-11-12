> **Subconscious Burn fork:** [Current application, architecture and recovery](docs/subconscious/README.md). Upstream Onyx documentation follows.

## Onyx chat infrastructure (Subconscious)

How a chat with the Executive interview agent reaches each service. Read from the live AWS host on 2026-11-12.

```mermaid
flowchart TD
  exec(["Executive in a browser"])
  auth0["Auth0 login<br/>auth.subconscious.ai"]
  vercel["Onyx web app on Vercel<br/>chat.causl.io, burn.subconscious.ai"]
  exec --> vercel
  exec -. "sign in" .-> auth0
  vercel -- "HTTPS /api" --> edge

  subgraph host["AWS host: Docker Compose project burn2"]
    edge["Host nginx<br/>api.dev.subconscious.ai/burn2"]
    gateway["burn2 gateway nginx<br/>allows only listed routes"]
    api["api_server<br/>chat, Executive interview agent,<br/>company profile and research context"]
    worker["background: Celery<br/>company research, saved briefs, indexing"]
    research["research<br/>GPT Researcher MCP"]
    mcp["mcp_server<br/>Onyx MCP"]
    ep["ep-mcp<br/>EDSL studies, with ep-litellm"]
    subgraph stores["Data stores"]
      pg[("Postgres<br/>accounts, chats, profiles, research")]
      redis[("Redis<br/>cache and job queue")]
      minio[("MinIO<br/>uploaded files")]
      search[("OpenSearch<br/>document index")]
    end
    subgraph helpers["Helpers"]
      models["Model servers<br/>inference and indexing embeddings"]
      code["code-interpreter<br/>rootless Docker executor"]
    end
    edge --> gateway
    gateway --> api
    gateway -- "/research-mcp/" --> research
    gateway -- "/mcp" --> mcp
    api --> stores
    api --> helpers
    api -- "jobs through Redis" --> worker
    worker --> stores
  end

  subgraph tools["Agent tools over MCP, outside the host"]
    rehoboam["Rehoboam<br/>experiments"]
    world["Colossus<br/>world context"]
    library["causl-kb Library<br/>causl.io market map and models"]
  end

  subgraph providers["Outside providers"]
    bedrock["AWS Bedrock<br/>chat models"]
    pdl["People Data Labs<br/>executive profile"]
    exa["Exa<br/>company pages and news"]
    blob["Vercel Blob<br/>daily encrypted backup, 08:15 UTC"]
  end

  api -- "agent tools" --> tools
  api -- "agent tools" --> research & ep
  api --> bedrock & pdl
  worker --> exa
  research --> exa
  ep --> bedrock
  stores -. "backup" .-> blob
```

Recovery and release steps: [durable hosting](docs/subconscious/durable-hosting.md).

<a name="readme-top"></a>

<h2 align="center">
    <a href="https://www.onyx.app/?utm_source=onyx_repo&utm_medium=github&utm_campaign=readme"> <img width="50%" src="https://github.com/onyx-dot-app/onyx/blob/logo/OnyxLogoCropped.jpg?raw=true" /></a>
</h2>

<p align="center">
    <a href="https://discord.gg/TDJ59cGV2X" target="_blank">
        <img src="https://img.shields.io/badge/discord-join-blue.svg?logo=discord&logoColor=white" alt="Discord" />
    </a>
    <a href="https://docs.onyx.app/?utm_source=onyx_repo&utm_medium=github&utm_campaign=readme" target="_blank">
        <img src="https://img.shields.io/badge/docs-view-blue" alt="Documentation" />
    </a>
    <a href="https://www.onyx.app/?utm_source=onyx_repo&utm_medium=github&utm_campaign=readme" target="_blank">
        <img src="https://img.shields.io/website?url=https://www.onyx.app&up_message=visit&up_color=blue" alt="Documentation" />
    </a>
    <a href="https://github.com/onyx-dot-app/onyx/blob/main/LICENSE" target="_blank">
        <img src="https://img.shields.io/static/v1?label=license&message=MIT&color=blue" alt="License" />
    </a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/12516" target="_blank">
    <img src="https://trendshift.io/api/badge/repositories/12516" alt="onyx-dot-app/onyx | Trendshift" style="width: 250px; height: 55px;" />
  </a>
</p>

# Onyx - The Open Source AI Platform

**[Onyx](https://www.onyx.app/?utm_source=onyx_repo&utm_medium=github&utm_campaign=readme)** is the application layer for LLMs - bringing a feature-rich interface that can be easily hosted by anyone.
Onyx enables LLMs through advanced capabilities like RAG, web search, code execution, file creation, deep research and more.

Connect your applications with over 50+ indexing based connectors provided out of the box or via MCP.

> [!TIP]
> Deploy with a single command:
> ```
> curl -fsSL https://onyx.app/install_onyx.sh | bash
> ```

![Onyx Chat Silent Demo](https://github.com/onyx-dot-app/onyx/releases/download/v3.0.0/Onyx.gif)

---

## ⭐ Features

- **🔍 Agentic RAG:** Get best in class search and answer quality based on hybrid index + AI Agents for information retrieval
  - Benchmark to release soon!
- **🔬 Deep Research:** Get in depth reports with a multi-step research flow.
  - Top of [leaderboard](https://github.com/onyx-dot-app/onyx_deep_research_bench) as of Feb 2026.
- **🤖 Custom Agents:** Build AI Agents with unique instructions, knowledge, and actions.
- **🌍 Web Search:** Browse the web to get up to date information.
  - Supports Serper, Google PSE, Brave, SearXNG, and others.
  - Comes with an in house web crawler and support for Firecrawl/Exa.
- **📄 Artifacts:** Generate documents, graphics, and other downloadable artifacts.
- **▶️ Actions & MCP:** Let Onyx agents interact with external applications, comes with flexible Auth options.
- **💻 Code Execution:** Execute code in a sandbox to analyze data, render graphs, or modify files.
- **🎙️ Voice Mode:** Chat with Onyx via text-to-speech and speech-to-text.
- **🎨 Image Generation:** Generate images based on user prompts.

Onyx supports all major LLM providers, both self-hosted (like Ollama, LiteLLM, vLLM, etc.) and proprietary (like Anthropic, OpenAI, Gemini, etc.).

To learn more - check out our [docs](https://docs.onyx.app/welcome?utm_source=onyx_repo&utm_medium=github&utm_campaign=readme)!

---

## 🚀 Deployment Modes

> Onyx supports deployments in Docker, Kubernetes, Helm/Terraform and provides guides for major cloud providers.
> Detailed deployment guides found [here](https://docs.onyx.app/deployment/overview).

Onyx supports two separate deployment options: standard and lite.

#### Onyx Lite

The Lite mode can be thought of as a lightweight Chat UI. It requires less resources (under 1GB memory) and runs a less complex stack.
It is great for users who want to test out Onyx quickly or for teams who are only interested in the Chat UI and Agents functionalities.

#### Standard Onyx

The complete feature set of Onyx which is recommended for serious users and larger teams. Additional components not included in Lite mode:
- Vector + Keyword index for RAG.
- Background containers to run job queues and workers for syncing knowledge from connectors.
- AI model inference servers to run deep learning models used during indexing and inference.
- Performance optimizations for large scale use via in memory cache (Redis) and blob store (MinIO).

> [!TIP]  
> **To try Onyx for free without deploying, visit [Onyx Cloud](https://cloud.onyx.app/signup?utm_source=onyx_repo&utm_medium=github&utm_campaign=readme)**.

---

## 🏢 Onyx for Enterprise

Onyx is built for teams of all sizes, from individual users to the largest global enterprises:
- 👥 Collaboration: Share chats and agents with other members of your organization.
- 🔐 Single Sign On: SSO via Google OAuth, OIDC, or SAML. Group syncing and user provisioning via SCIM.
- 🛡️ Role Based Access Control: RBAC for sensitive resources like access to agents, actions, etc.
- 📊 Analytics: Usage graphs broken down by teams, LLMs, or agents.
- 🕵️ Query History: Audit usage to ensure safe adoption of AI in your organization.
- 💻 Custom code: Run custom code to remove PII, reject sensitive queries, or to run custom analysis.
- 🎨 Whitelabeling: Customize the look and feel of Onyx with custom naming, icons, banners, and more.

## 📚 Licensing

There are two editions of Onyx:

- Onyx Community Edition (CE) is available freely under the MIT license and covers all of the core features for Chat, RAG, Agents, and Actions.
- Onyx Enterprise Edition (EE) includes extra features that are primarily useful for larger organizations.

For feature details, check out [our website](https://www.onyx.app/pricing?utm_source=onyx_repo&utm_medium=github&utm_campaign=readme).

## 👪 Community

Join our open source community on **[Discord](https://discord.gg/TDJ59cGV2X)**!

## 💡 Contributing

Looking to contribute? Please check out the [Contribution Guide](CONTRIBUTING.md) for more details.

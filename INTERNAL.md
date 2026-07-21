# 🛡️ OpenCora

> **Enterprise-internal AI coding agent — air-gapped, TUI-only, self-hosted.**

OpenCora is a hardened fork of the OpenCode project, stripped of all telemetry, external cloud dependencies, and public-facing surfaces. It runs exclusively as a compiled TUI binary and routes all LLM traffic through your internal [OpenWebUI](http://openwebui.corp.local) instance backed by a vLLM/Hermes stack.

---

## ✨ Features

- 🔒 **Fully air-gapped** — zero outbound connections to the public internet
- 🖥️ **TUI-only binary** — no desktop app, no web frontend, no Electron
- 🤖 **LLM routing via OpenWebUI** — single internal endpoint, OpenAI-compatible API
- 🔑 **Stateless auth** — validated once on startup via `OPENCORA_API_KEY`; no session DB
- 🦊 **GitLab integration** — all git tooling routes to your internal GitLab instance
- 📦 **Single static binary** — runs on machines with no Bun or Node installed
- 🚫 **No telemetry** — PostHog, Sentry, Segment, and all phone-home calls removed

---

## 🚀 Getting Started

### 1. Install

Download and install from the internal file server:

```bash
curl http://files.corp.local/opencora/install | bash
```

Or manually:

```bash
curl -O http://files.corp.local/opencora/dist/opencora
chmod +x opencora
mv opencora /usr/local/bin/opencora
```

### 2. Configure

Add the following to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
export OPENCORA_API_KEY=your_key_here        # OpenWebUI → Account → API Keys
export OPENWEBUI_BASE_URL=http://openwebui.corp.local   # optional, this is the default
export GITLAB_BASE_URL=http://gitlab.corp.local          # optional, this is the default
export GITLAB_ACCESS_TOKEN=your_token_here  # GitLab → User Settings → Access Tokens (read_api)
```

### 3. Run

```bash
opencora
```

Authentication is validated on startup. If your key is missing or expired, the binary will exit with a clear error message.

---

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENCORA_API_KEY` | ✅ Yes | — | OpenWebUI API key. Generate in OpenWebUI → Account → API Keys. |
| `OPENWEBUI_BASE_URL` | No | `http://openwebui.corp.local` | Override if your OpenWebUI URL differs. |
| `GITLAB_BASE_URL` | No | `http://gitlab.corp.local` | Override if your GitLab URL differs. |
| `GITLAB_ACCESS_TOKEN` | ✅ Yes (git tools) | — | GitLab personal access token with `read_api` scope. |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│               OpenCora TUI              │
│           (single static binary)        │
└────────────────┬────────────────────────┘
                 │ internal network only
       ┌─────────┴──────────┐
       ▼                    ▼
┌─────────────┐    ┌─────────────────┐
│  OpenWebUI  │    │  GitLab (corp)  │
│ (vLLM/Hermes│    │  API v4         │
│  backend)   │    │                 │
└─────────────┘    └─────────────────┘
```

- All LLM calls → `OPENWEBUI_BASE_URL/v1/chat/completions`
- Model list fetched dynamically at startup → `OPENWEBUI_BASE_URL/v1/models`
- Git tools (repo search, MR read/list) → `GITLAB_BASE_URL/api/v4/...`

---

## 🛠️ Building from Source

Requires [Bun](https://bun.sh) on a developer machine connected to the internal network.

```bash
# Install dependencies
bun install

# Build the static binary (Linux x64)
bun run build:binary

# Output: dist/opencora
```

> 💡 Add `TURBO_TELEMETRY_DISABLED=1` and `DO_NOT_TRACK=1` to a root `.env.local` before building.

---

## 📋 Project Structure

```
packages/
├── tui/        # Main TUI entry point and UI rendering
├── core/       # Auth validator, shared utilities
├── llm/        # OpenWebUI LLM client (OpenAI-compatible)
├── plugin/     # GitLab tool integrations
└── identity/   # Branding assets (enterprise logos)
```

---

## 📖 Documentation

See the internal wiki for full documentation, onboarding guides, and architecture decisions.

For the rewrite execution plan and progress tracking, see [`ENTERPRISE_REWRITE.md`](./ENTERPRISE_REWRITE.md).

---

## ⚠️ Security

This tool is for **internal use only**. Do not distribute the binary or expose `OPENCORA_API_KEY` outside the corporate network. For vulnerability disclosures, see [`SECURITY.md`](./SECURITY.md).

---

*Built internally. Not for public distribution.* 🔐

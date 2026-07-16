# Opencora Enterprise Air-Gapped Rewrite: Execution Plan

This document contains copy-and-paste AI prompts designed to guide a coding assistant through the full refactoring of opencora into a locked-down, enterprise-internal TUI-only AI coding agent. Each priority is sequential. Do not begin a priority until all tests from the previous priority pass.

**Architecture Goal:**
- Delivery method: TUI binary only — no desktop app, no web frontend
- Auth: OpenWebUI API key (`OPENCORA_API_KEY`) validated on startup against the internal OpenWebUI instance
- LLM routing: All calls go through OpenWebUI's OpenAI-compatible API to your internal vLLM/Hermes stack
- Version control: Internal GitLab instance — no GitHub API calls at runtime
- Network: Fully air-gapped; zero outbound connections to the public internet

**Repo structure note:** All packages live under `packages/` — there is no `apps/` directory.

---

## Priority 1 — Surface Area Reduction & Telemetry Purging

**Objective:** Delete all non-TUI packages, clean the monorepo workspace, and eliminate every phone-home or external DNS call before the first build.

### AI Prompt 1A: Package Deletions & Workspace Cleanup

```
Context: We are converting the opencora monorepo (packages at packages/*) into a TUI-only
tool for an air-gapped environment. The repo uses Bun workspaces. There is no apps/ directory.

Task:
1. Provide the exact `rm -rf` commands to delete the following packages:
   packages/desktop, packages/app, packages/console, packages/web, packages/enterprise,
   packages/session-ui, packages/storybook, packages/stats, packages/docs,
   packages/function, packages/opencode

2. Update the root package.json workspaces array to remove all deleted packages.

3. Update turbo.json to remove all task references for deleted packages.
   Also delete the $schema line entirely — it makes an outbound DNS request to turbo.build.

4. Delete the following SST/cloud config files:
   - root sst.config.ts
   - root sst-env.d.ts
   - packages/tui/sst-env.d.ts
   - packages/server/sst-env.d.ts
   - packages/plugin/sst-env.d.ts

5. Delete the infra/ directory and the github/ directory at the repo root.

6. Audit .husky/ hooks and remove any pre-commit or pre-push hooks that trigger
   external linters, analytics, or network calls.

7. Add the following to a root .env.local file:
   TURBO_TELEMETRY_DISABLED=1
   NEXT_TELEMETRY_DISABLED=1
   DO_NOT_TRACK=1
```

### AI Prompt 1B: Telemetry & Phone-Home Sweep

```
Context: Same opencora repo. All external telemetry must be purged before any build.

Task:
1. Run a recursive grep across the entire repo for the following strings and list every
   file and line number that matches:
   opencode.ai, discord.gg, x.com/opencode, stats.opencode, beacon(, analytics,
   telemetry, posthog, segment.io, sentry.io

2. For each match, either delete the call entirely or replace it with a no-op comment:
   // REMOVED: telemetry

3. Confirm the root `install` script (which currently curls opencode.ai/install) is deleted.
   Replace it with a placeholder shell script that prints:
   "Install via your internal distribution server."

4. Audit packages/stats/ before deletion — extract any metric definitions or counters
   that may be repurposed as internal observability hooks. Then delete the package.
```

### Testing & Validation — Priority 1

| Action | Expected Result |
|--------|----------------|
| Run `bun install` from repo root after deletions | Completes with zero "missing workspace" or "unresolved dependency" errors |
| Run `bun run build` from repo root | Builds only `packages/tui` and its dependencies; no attempt to build deleted packages |
| `grep -r "opencode.ai" . --exclude-dir=.git` | Zero matches |
| `grep -r "sst" packages/tui/src packages/server/src` | Zero matches — all SST imports replaced with plain env vars |
| `cat turbo.json \| grep schema` | Zero matches — `$schema` line removed |
| `grep -r "analytics\|telemetry\|posthog\|sentry" packages/tui/src packages/core/src` | Zero matches |

---

## Priority 2 — Air-Gapped Dependency Isolation

**Objective:** Force all package resolution through your internal npm mirror and strip every external cloud SDK from the codebase.

### AI Prompt 2A: Registry Routing

```
Context: This codebase must never reach the public internet. The internal npm mirror runs
at http://internal-registry.local:4873 (substitute your actual Verdaccio/Nexus/Artifactory URL).

Task:
1. Rewrite the root bunfig.toml and packages/tui/bunfig.toml to set:
   [install]
   registry = "http://internal-registry.local:4873"
   There must be no fallback to registry.npmjs.org anywhere.

2. Generate a root .npmrc file with:
   registry=http://internal-registry.local:4873
   This covers tools that read .npmrc instead of bunfig.toml.

3. Confirm bun.lock is committed so that `bun install --frozen-lockfile` can be used
   in CI without any resolution phase.
```

### AI Prompt 2B: Cloud SDK Stripping

```
Context: packages/core and packages/llm contain SST/AWS bindings and references to
external LLM providers that must be fully removed.

Task:
1. Open packages/core/package.json and packages/llm/package.json.
   List every dependency that is an external cloud SDK:
   AWS, GCP, SST, Vercel, Stripe, external telemetry, Anthropic, Groq, Gemini,
   Mistral, OpenAI direct SDK, or any package pointing to a public SaaS API.

2. Remove all identified cloud SDK dependencies using `bun remove`.

3. Audit every index.ts in packages/core and packages/llm that imports a now-removed
   module. Replace each removed import with either:
   - A deletion if the module is unused
   - A stub: throw new Error("not available in enterprise build")

4. Audit packages/client, packages/sdk, packages/sdk-next, packages/protocol,
   and packages/schema for SST imports and cloud SDK usage.
   Strip all found references and replace with plain process.env reads.
```

### Testing & Validation — Priority 2

| Action | Expected Result |
|--------|----------------|
| Block `registry.npmjs.org` in `/etc/hosts`, run `bun install --no-cache` | All packages resolve from internal mirror; zero DNS failures |
| `bun run dev` from `packages/tui` | App reaches initial prompt screen without "Cannot find module" errors |
| `grep -r "from 'aws-sdk'\|from '@aws-sdk\|from 'sst'" packages/` | Zero matches |
| `grep -r "anthropic\|groq\|gemini\|mistral" packages/llm/src` | Zero matches |
| `cat bunfig.toml \| grep npmjs` | Zero matches |

---

## Priority 3 — Stateless Authentication via OpenWebUI

**Objective:** Replace all existing auth with a stateless OpenWebUI API key validator. Auth is a single `GET /api/user` call on startup. No session database. No Clerk. No NextAuth. No SST auth.

### AI Prompt 3: Auth Validator

```
Context: All user identity is established by an OpenWebUI API key stored in the
environment variable OPENCORA_API_KEY. The OpenWebUI instance lives at
http://openwebui.corp.local (substitute your actual internal URL). Authentication
is validated once on TUI startup via the OpenAI-compatible user endpoint.
There is no session database.

Task:
1. Locate and delete all existing auth logic in packages/core/src/.
   Search for directories or files named: auth, session, clerk, nextauth.
   Delete all matches.

2. Create packages/core/src/auth/openwebui-validator.ts with the following behavior:

   a. Read OPENCORA_API_KEY from process.env.
      If missing or empty: print the following and call process.exit(1):
      "Error: OPENCORA_API_KEY is not set. Add it to your shell profile and restart."

   b. Send: GET http://openwebui.corp.local/api/user
      Header: Authorization: Bearer <OPENCORA_API_KEY>

   c. On HTTP 200: parse and return { id, name, email } from the response body.
      Cache this object for the lifetime of the process.

   d. On HTTP 401 or 403: print the following and call process.exit(1):
      "Authentication failed: your OPENCORA_API_KEY is invalid or expired.
       Generate a new key in OpenWebUI -> Account -> API Keys."

   e. On network error (ECONNREFUSED, ENOTFOUND, timeout): print and exit(1):
      "Cannot reach OpenWebUI at http://openwebui.corp.local.
       Verify you are connected to the internal network."

3. Wire this validator to run as the FIRST operation in packages/tui/src/index.ts,
   before any UI renders or any other imports execute.

4. In packages/llm/src/, add a response interceptor: if any LLM API call returns
   HTTP 401 or 403, print the same session-expired message and call process.exit(1).

5. Create packages/tui/.env.example with the following documented variables:
   OPENCORA_API_KEY=        # Generate in OpenWebUI -> Account -> API Keys
   OPENWEBUI_BASE_URL=http://openwebui.corp.local
```

### Testing & Validation — Priority 3

| Action | Expected Result |
|--------|----------------|
| `OPENCORA_API_KEY=invalid_token bun run dev` | Prints auth failure message, exits with code 1 before any UI renders |
| Unset `OPENCORA_API_KEY` entirely, run `bun run dev` | Prints "OPENCORA_API_KEY is not set" message, exits with code 1 |
| Mock `GET /api/user` returning HTTP 200 + `{"id":"1","name":"Test","email":"test@corp.local"}`; run with valid token | App starts, user identity cached, TUI renders normally |
| Mock `GET /api/user` as unreachable; run app | Prints network error message, exits with code 1 |
| **Unit test** `openwebui-validator.test.ts` — mock fetch returning 401 | `process.exit(1)` called; test passes |
| **Unit test** — mock fetch returning 200 + user JSON | Returns `{ id, name, email }`; test passes |
| **Unit test** — mock fetch throwing `ECONNREFUSED` | `process.exit(1)` called; test passes |

---

## Priority 4 — LLM Provider Wiring to OpenWebUI

**Objective:** Hardcode the LLM layer to route exclusively through OpenWebUI's OpenAI-compatible API. Remove all direct provider connections.

### AI Prompt 4: LLM Hardwiring

```
Context: packages/llm currently supports multiple LLM providers (Anthropic, Groq, Gemini,
Mistral, OpenAI direct, etc.). All must be removed. The sole provider is now OpenWebUI's
OpenAI-compatible endpoint. The same OPENCORA_API_KEY used for auth is reused for all
LLM calls — no second key is needed.

Task:
1. In packages/llm/src/, delete all provider files except the one implementing
   the OpenAI-compatible interface.

2. Hardcode the client baseURL to:
   process.env.OPENWEBUI_BASE_URL ?? "http://openwebui.corp.local"
   Append /api or /v1 as required by your OpenWebUI version's chat completions path.
   Confirm the correct path before committing.

3. Set the Authorization header on all LLM calls to:
   Bearer ${process.env.OPENCORA_API_KEY}

4. On TUI startup (after auth validation passes), call GET /v1/models (or GET /api/models).
   Use the returned list to populate the TUI model selector dynamically.
   Remove all hardcoded model names from the codebase.

5. Search packages/server/src/ for any listen() calls binding to 0.0.0.0 or ::.
   Replace all with 127.0.0.1.
```

### Testing & Validation — Priority 4

| Action | Expected Result |
|--------|----------------|
| `grep -r "anthropic\|groq\|gemini\|mistral\|openai\.com" packages/llm/src` | Zero matches |
| `grep -r "0\.0\.0\.0\|\:\:" packages/server/src` | Zero matches |
| Mock `GET /v1/models` returning `["hermes-3","llama-3.1-70b"]`; start TUI | Model selector shows exactly those two models; no hardcoded names visible |
| Send a chat message while mock OpenAI-compatible server runs at `OPENWEBUI_BASE_URL` | Request hits mock server; response renders in TUI |
| **Unit test**: mock `/v1/models` returning two-item list → assert TUI model array equals that list | Test passes |
| **Unit test**: mock LLM endpoint returning 401 mid-session → assert session-expired message printed and process exits 1 | Test passes |

---

## Priority 5 — Internal Git (GitLab) Integration

**Objective:** Replace all GitHub API calls and tools with GitLab API v4 equivalents so no git operations leave the internal network.

### AI Prompt 5: GitLab Plugin Replacement

```
Context: The agent uses tools in packages/plugin/src/ and possibly packages/core/src/
to interact with GitHub via Octokit or direct api.github.com calls. All must be replaced
with GitLab API v4 equivalents. The internal GitLab instance runs at
http://gitlab.corp.local (substitute your actual URL). Auth uses GITLAB_ACCESS_TOKEN
from the environment.

Task:
1. Grep the following locations for github.com, api.github.com, octokit, @octokit:
   - packages/plugin/src/
   - packages/core/src/
   - .opencode/
   List every match with file path and line number.

2. Delete all GitHub-specific tool files identified.

3. Create the following new tool files in packages/plugin/src/:

   gitlab-repo-search.ts
   - GET http://gitlab.corp.local/api/v4/projects?search={query}&private_token={GITLAB_ACCESS_TOKEN}
   - Returns: array of { id, name, path_with_namespace, description }

   gitlab-mr-read.ts
   - GET http://gitlab.corp.local/api/v4/projects/{id}/merge_requests/{iid}
   - Header: PRIVATE-TOKEN: ${GITLAB_ACCESS_TOKEN}
   - Returns: full MR object

   gitlab-mr-list.ts
   - GET http://gitlab.corp.local/api/v4/projects/{id}/merge_requests?state=opened
   - Header: PRIVATE-TOKEN: ${GITLAB_ACCESS_TOKEN}
   - Returns: array of open MR summaries

4. Implement all three using the native fetch API only. No Octokit. No external HTTP libraries.

5. Update the LLM tool registration manifest to replace the old GitHub tool entries
   with the three new GitLab tools.

6. Add to packages/tui/.env.example:
   GITLAB_BASE_URL=http://gitlab.corp.local
   GITLAB_ACCESS_TOKEN=     # Generate in GitLab -> User Settings -> Access Tokens (read_api scope)
```

### Testing & Validation — Priority 5

| Action | Expected Result |
|--------|----------------|
| `grep -r "api.github.com\|octokit\|github.com" packages/plugin/src packages/core/src .opencode` | Zero matches |
| **Unit test** `gitlab-repo-search.test.ts`: mock fetch → assert correct URL built, correct JSON parse | Test passes |
| **Unit test** `gitlab-mr-read.test.ts`: mock fetch → assert `PRIVATE-TOKEN` header present, correct fields returned | Test passes |
| **Unit test** `gitlab-mr-list.test.ts`: mock fetch returning three open MRs → assert all three returned | Test passes |
| Ask TUI agent "List open MRs for project X" while GitLab access logs are tailing | GitLab log shows the inbound request; no DNS lookups for `api.github.com` |

---

## Priority 6 — Rebranding

**Objective:** Remove all upstream opencode identity from every user-visible surface.

### AI Prompt 6: Brand Replacement

```
Context: The product will be rebranded for internal enterprise use. All references to
"OpenCode", "opencode.ai", and the opencode logo must be replaced before distribution.

Task:
1. Grep packages/tui/src/ for OpenCode, opencode, opencode.ai in:
   - Terminal banner / splash text
   - Help strings and --help output
   - --version output
   - Error messages
   List every match with file and line number.

2. Replace all matches with [YOUR_ENTERPRISE_NAME] as a placeholder.

3. In packages/identity/, replace mark.svg, mark-light.svg, and all PNG variants
   with placeholder files containing: <!-- Replace with enterprise logo -->

4. Update root package.json: set name, description, homepage to internal values.
   Remove opencode-ai from any npm package name.

5. Delete all localized README.*.md files from the repo root (18+ files matching
   README.??.md and README.???.md). Rewrite README.md for an internal audience.

6. Delete CONTRIBUTING.md, STATS.md, AGENTS.md, CONTEXT.md.
   Create INTERNAL.md with: "See [internal wiki link] for documentation."

7. Decide on packages/slack/:
   - Delete entirely if not used.
   - Adapt for Mattermost or Teams if applicable.
```

### Testing & Validation — Priority 6

| Action | Expected Result |
|--------|----------------|
| Start TUI, read startup banner | Zero occurrences of "OpenCode" or "opencode.ai" |
| Run `./opencora --version` | Enterprise name and version; no upstream branding |
| `grep -ri "opencode" packages/tui/src` | Zero matches outside internal path strings |
| `ls README.*.md` at repo root | No localized README files; only README.md present |
| `ls packages/identity/` | Only placeholder SVG/PNG files; no original opencode marks |

---

## Priority 7 — Standalone Binary Distribution

**Objective:** Compile the TUI into a single static binary for internal distribution to machines with no Bun, Node, or npm installed.

### AI Prompt 7: Binary Compilation & Hardening

```
Context: The refactor is complete. Entry point: packages/tui/src/index.ts.
Target: Linux x64 (add macOS arm64 / Windows x64 variants as needed).
The binary must run on machines with no Bun or Node installed.

Task:
1. Add a build:binary script to packages/tui/package.json:
   bun build --compile --minify --target=bun-linux-x64 ./src/index.ts --outfile ../../dist/opencora

2. If the TUI references static assets (prompt templates, .txt configs, TOML defaults),
   provide configuration to embed them via Bun asset bundling or document them as
   required co-located files in the dist/ layout.

3. After build, run:
   strings dist/opencora | grep -E 'https?://'
   List every URL. Remove or stub any that is not an internal hostname.

4. Sign the binary with an internal GPG key:
   gpg --detach-sign --armor dist/opencora

5. Write the content of the internal install script hosted at
   http://files.corp.local/opencora/install:
   - Download binary from internal file server
   - chmod +x
   - Move to /usr/local/bin/opencora
   - Print: "opencora installed. Set OPENCORA_API_KEY in your shell profile to get started."

6. Run `bun audit` from repo root. Fix or document any high/critical findings
   in the pruned dependency tree.
```

### Testing & Validation — Priority 7

| Action | Expected Result |
|--------|----------------|
| `bun run build:binary` from `packages/tui` | Single file `dist/opencora` produced; no build errors |
| `strings dist/opencora \| grep -E 'https?://'` | Only internal URLs; zero matches for `github.com`, `npmjs.org`, `opencode.ai` |
| Copy `dist/opencora` to clean container (no Bun/Node); run `./opencora` | Boots to TUI prompt without runtime errors |
| In clean container: set `OPENCORA_API_KEY` + `OPENWEBUI_BASE_URL`; run `./opencora` | Full auth + model list flow completes; TUI is fully usable |
| Run `bun test` from `packages/tui` | All unit and integration tests from Priorities 3, 4, and 5 pass |
| `bun audit` from repo root | No high or critical severity vulnerabilities |
| Run internal install one-liner from clean machine | Binary at `/usr/local/bin/opencora`; `opencora --version` prints correctly |

---

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENCORA_API_KEY` | **Yes** | OpenWebUI API key. Generate in OpenWebUI → Account → API Keys. |
| `OPENWEBUI_BASE_URL` | No | Defaults to `http://openwebui.corp.local`. Override if your URL differs. |
| `GITLAB_BASE_URL` | No | Defaults to `http://gitlab.corp.local`. Override if your URL differs. |
| `GITLAB_ACCESS_TOKEN` | Yes (git tools) | GitLab personal access token with `read_api` scope. Generate in GitLab → User Settings → Access Tokens. |
| `TURBO_TELEMETRY_DISABLED` | Build-time | Set to `1` in `.env.local`. Prevents Turborepo phone-home during builds. |

---

*This document is for internal use only. Do not publish externally.*

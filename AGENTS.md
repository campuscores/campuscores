# Working on Thaparlympics

Build a comfortable, responsive product for phone users. Support phone users (the main userbase) tablets, desktops and larger screens. Preserve approved behavior as teams add features.

## Read and coordinate first

Use the existing checkout the user designates. Do not create or switch to a separate worktree unless the user requests it. Confirm the working folder before edits.

**AGENTS.md is the entry point for every agent.** Before changing code, assets or shared contracts, read this file and every shared document in the table below in full. A summary, search snippet or folder map does not replace reading the documents. Follow their links to requirements, contracts, source files, tests, skills and external references that affect the task. Read those linked resources before implementing dependent behavior. If a required resource is unavailable, report the gap and stop dependent work; independent work may continue. Inspect current source and tests; a plan is not proof of implementation.

Keep one current entry per task in `doc/tasks.md`: owner, scope/files, dependencies, state and branch/PR. Add concise final checks when ready. Replace stale entries instead of appending a running log. One owner edits each shared file at a time. Agree on shared routes, props, fields and event contracts before independent teams depend on them. Respect uncommitted edits; never reset or overwrite another team's work.

Git shares these records across machines. Other teams see an edit only after its branch is pushed and pulled. Check the remote register and coordinate claims with the team. Markdown is not an automatic distributed lock.

## Git naming and authorship

Use descriptive branch names, such as `integration/matchscorer-scoring`, without tool or agent prefixes. Keep commit subjects and bodies focused on the change and its checks, without tool or agent attribution. Use the requesting contributor's verified Git author and committer identity. Do not add extra author or co-author trailers. Preserve each teammate's existing authorship.

## Keep local output out of GitHub

**Local logs, generated output and agent scratch work must never enter a commit or push.** Keep them outside the checkout. If a tool needs a local output folder, use the ignored root `output/` folder or its ignored tool folder.

- Commit only required source, approved assets and licenses, manifests, the lockfile, configuration, CI, reproducible tests and existing canonical docs.
- Keep dependencies, builds, caches, browser snapshots, screenshots, traces, recordings, reports, personal explainers, temporary scripts, abandoned previews and credentials out of Git. Test source and approved fixtures belong in Git; generated test results do not.
- Add scoped `.gitignore` rules before using a new output location. Check the path with `git check-ignore -v -- <path>`. Do not ignore all Markdown, HTML or image files; the app and shared docs need those formats.
- Stage explicit reviewed paths. Before any authorized commit or push, inspect `git status --short`, `git diff --cached --name-only` and `git diff --cached`. Do not use `git add .`, `git add -A` or `git add -f` to bypass file review.
- `.gitignore` does not exclude files already tracked or staged. Check `git ls-files -ci --exclude-standard`. Remove any local output from the proposed commit before proceeding. Preserve local files and teammates' changes; do not reset the checkout.

Do not commit or push until the staged files contain only the intended shared project changes. Keep raw verification evidence local; record only concise results and relevant limits in the existing docs.

## Confirm decisions before dependent work

Confirmed user instructions override older plans. A proposal does not override a confirmed decision. Preserve tested features and contracts. Change them only for an authorized bug fix or confirmed requirement; update callers, tests and docs together.

Mark unclear requirements **Open** in `doc/memory.md`. Record the question, decision owner, affected tasks and acceptance criteria. Mark dependent tasks **Blocked** in `doc/tasks.md`. Obtain the user or authorized product owner's decision before building that behavior. Independent work may continue. Sample scores and professional sport rules do not decide event rules.

Current code includes the React + Vite **JavaScript** frontend and Hono Worker, Neon database integration, Clerk authentication and live delivery. Check `doc/tasks.md` for implemented and published scope. Create folders only for actual implementation.

## Code technique: Ponytail

Use the installed **Ponytail** skill : challenge unnecessary scope, then make the smallest complete change.

- Read affected callers, tests, fixtures, config and exports.
- Reuse existing components and platform features. Add a dependency or abstraction only for a current need.
- Fix a shared cause once. Preserve validation, error handling, security and accessibility.
- Add a focused regression for a bug. Test behavior, not a copy of the implementation.
- Keep readable JavaScript. Do not add TypeScript, unused scaffolding or future options.
- State actual checks, skipped checks and remaining risks. Never invent results.

If a teammate lacks the skill, follow these rules and report the missing skill. Do not assume a personal skill path exists on another machine.

## Skills, CLI tools and MCP tools

Read the current `SKILL.md` before using a skill. Check installed commands and tool APIs. A CLI runs in the terminal. MCP lets an agent call an installed connector. Neither replaces repository tests.

| Need | Skill or tool | Shared rule |
| --- | --- | --- |
| Code and review | `ponytail`; `ponytail-audit` or `ponytail-review` when needed | Use minimal complete fixes. Audit permission alone does not authorize edits. |
| Repeatable frontend checks | npm, ESLint, Vite, repository `@playwright/test` | Use root scripts and a current production build. Keep 4175 free; do not reuse another checkout's server. |
| Browser investigation | `playwright-cli` skill and installed CLI | Use fresh snapshots for element references. Inspect real rendering, console and requests. Recheck after navigation. |
| Browser MCP fallback | An available browser MCP, such as `mcp__cua_repl` | Follow its documented API. Name the actual browser/tool used and any missing checks. |
| Architecture visuals | `archify` when useful or requested | Derive connections from source. Validate and inspect output. Keep generated reports outside the repository. |
| Git and integration | Git; GitHub MCP or `gh` if available | Inspect diffs/conflicts. Commit, push, merge and messaging need task authorization. |
| Future database work | Neon, `dbmate` and the agreed CI workflow | Resolve contracts first. Keep secrets server-side. Change a hosted schema only through a CI migration, never through the Neon console. |

Node/npm and Git are setup requirements. App/test dependencies are pinned by `package-lock.json`. Skills, optional CLIs and MCP connectors depend on each machine; they are not app dependencies. Use a documented equivalent if unavailable and state the limit. Do not add every optional tool to `package.json`.

## Preserve the homepage contracts

- Keep the full-width top header, heavy Helvetica/Arial wordmark, icon-only phone menu, six-athlete gallery and original hero dot matrix.
- Reuse the approved colors, typography, shapes, spacing and breakpoints in `doc/design.md`. No pause control, scrolling arrows or View All controls.
- Homepage sport tiles filter live matches in place. Header Sports links navigate. Register routes in `frontend/src/app/App.jsx`.
- Keep native horizontal rails and partial-card emphasis. Card detail fields are temporary; approved shells stay fixed.
- Sport routes use the shared sport page with display fixtures.
- Keep portable local assets, originals, responsive variants and license/source records. Never put clipboard or agent-runtime paths in app/test code.

## Verify before marking complete

Define acceptance cases first. Cover normal, boundary, invalid and failure cases that apply. For UI, check widths/overflow, readable text, touch/keyboard/focus, reduced motion, route entry/refresh/back and feature integration. Future services also need permission, transaction, retry, stale-state and concurrency cases.

For frontend changes, run `npm run lint`, `npm run build` and `npm test`. Use focused checks while debugging, then required integration checks after changes settle. Review phone and desktop captures. Desktop automation does not prove physical-device behavior or every possible case.

Extend tests in the same change as each feature or bug fix. Add applicable acceptance, edge, failure and integration cases. Preserve existing regression coverage unless a confirmed requirement changes the behavior. Add frontend browser specs to `frontend/tests/`; `npm test` discovers them automatically. CI runs Chromium and an emulated Pixel on Ubuntu, Windows and macOS, plus Firefox, WebKit and emulated iPhone and iPad on Ubuntu and macOS. WebKit is the engine behind Safari, not branded Safari, and emulation does not replace physical-device checks.

GitHub Actions runs the backend and frontend CI matrix on release pull requests to `main` and on manual dispatch (`workflow_dispatch`). It does not run on each push. The repository is public, so standard GitHub-hosted runners are free. Add every required check that has not passed yet, in CI or locally, to [doc/deferred-tests.md](doc/deferred-tests.md). Do not mark a feature Verified while a row there covers it.

Development flow (confirmed by Arnav, 20 October 2026; [decision](doc/memory.md#public-repository-and-ci--20-october-2026)):

1. Before each push to `develop`, run locally `npm run lint`, `npm run build` and focused tests for the changed area. Run `npm test` when shared UI or contracts change. Run the backend tests when the backend changes. Review phone and desktop rendering with the `playwright-cli` skill.
2. Push directly to `develop`. The `deploy.yml` gate (lint, backend database tests, Chromium and Pixel tests, migrations, build, deploy, smoke) deploys staging.
3. Record each required check that did not run in [doc/deferred-tests.md](doc/deferred-tests.md).
4. The full backend and frontend matrix runs once on the `develop` → `main` release pull request, or manually through `workflow_dispatch`. A feature is Verified only after the release pull request checks pass.

When a new application layer needs other checks, add its test commands, dependencies, CI jobs and path triggers in the same change. Cover implemented behavior; do not add empty jobs for planned services. Record new coverage and remaining gaps in `doc/tasks.md` before marking the feature Verified.

Use **Implemented, not verified** while checks are incomplete and **Locally verified, unpublished** after local checks pass. A shared completed-feature record needs applicable checks and a confirmed pushed commit or PR reference. A pushed branch is not a merged release; state which branch contains it. Never infer publication from a local commit or planned push. Keep any current failed or unavailable required check as a brief blocker, not a history of failed runs.

## Docs are the shared coordination system

Use ASD-STE100-inspired prose, about 80% as a readability aim, not formal compliance. Use short active sentences, one idea at a time, consistent names and defined technical terms. Keep confirmed requirements and open decisions separate from implemented features. Preserve exact commands, identifiers and safeguards.

Document the final accepted behavior, integration contract, relevant source location and current limits. A completed task needs only the final result, verification date/revision, checks with coverage/results, remaining gaps and remote commit/PR reference. Do not copy code when a source link is enough. Update the authoritative section; link to it elsewhere.

Do not record failed approaches, iteration diaries, prompts, conversations, per-agent execution logs, routine cleanup or intermediate measurements. Keep a short rationale only when the next team needs it for a current tradeoff, compatibility rule, security constraint or unresolved risk. Remove an old completion entry when the final record replaces it; Git retains change history.

During work, keep only the ownership/dependency/status entry and decisions that affect other teams. Personal HTML explainers, Markdown notes, plans, scratch scripts, generated reports, screenshots and traces stay outside the repository or in ignored output. Do not link shared docs to those local files or to personal machine paths. Commit only existing canonical docs, required source/assets/config and reproducible tests.

| Existing file | Purpose and future updates |
| --- | --- |
| [README.md](README.md) | Project entry point and guide links. |
| [doc/local-development.md](doc/local-development.md) | Prerequisites, install/run/test commands and troubleshooting. |
| [doc/prd.md](doc/prd.md) | Product scope, requirements and acceptance criteria. |
| [doc/architecture.md](doc/architecture.md) | Components, shared data/API contracts and deployment boundaries. |
| [doc/design.md](doc/design.md) | Approved homepage design language for future pages. |
| [doc/rules.md](doc/rules.md) | Sport configuration, scoring constraints and open event rules. |
| [doc/memory.md](doc/memory.md) | Current durable decisions, necessary rationale and open questions. |
| [doc/tasks.md](doc/tasks.md) | Current task ownership/state and concise final verification/publication evidence. |
| [doc/handoff.md](doc/handoff.md) | Current integration points and boundaries for the next team. |
| [doc/deferred-tests.md](doc/deferred-tests.md) | Required checks that have not passed yet. Remove a row when its check passes. |
| [doc/asset-sources.md](doc/asset-sources.md) | Asset mapping, derived variants, sources and licenses. |
| `AGENTS.md` | Shared agent workflow and tool policy. |

Update these files. Do not create per-agent, per-feature, phase, review or handoff docs by default. Add sections to the relevant existing file. A new canonical document needs explicit user approval. Keep each contract authoritative in one place and link to it elsewhere. Keep generated evidence outside source or in ignored test output.

Record shared decisions before dependent code. Prepare final doc updates with verified code/assets/tests in the same change; keep local work labelled unpublished until a push is confirmed. Update the handoff only when integration points change. Before an authorized push, remove abandoned approaches, duplicate summaries and scratch references from the diff. Reconcile teammates' changes before integration.

Never commit dependencies, build/test output, secrets, screenshots, abandoned previews or scratch reports. Use the documented CI migration policy when database work starts.

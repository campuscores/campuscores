# Thaparlympics

A mobile-first sports homepage built with React, Vite and JavaScript. It includes the header, responsive athlete gallery and dot animation, live-match sport filters, native horizontal scorecards and tournament cards. All artwork is local.

The Hono Worker, Neon database, Clerk sign-in, operator assignments and live delivery are implemented. With `VITE_API_BASE`, homepage and sport pages show accepted live scores and final results. Without it, they use display fixtures. Public tournament pages, the Tournament Manager console and Super Admin staff management are implemented. Validated rosters, bracket advancement and standings remain planned. See [tasks](doc/tasks.md) for publication and verification status.

## Start locally

Install Node.js **22.22 or newer** with npm. At the repository root:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:4174/](http://127.0.0.1:4174/) and keep the command running.

[Local development](doc/local-development.md) has prerequisites, dependencies, production preview, browser setup, checks and troubleshooting. It also explains GitHub Actions and CI-only database migrations.

## Work with the team

- [AGENTS.md](AGENTS.md): shared skill/tool policy, file ownership, decision gates, code technique and documentation style.
- [Handoff](doc/handoff.md): the implemented homepage's integration points and fixed boundaries.
- [Tasks](doc/tasks.md): claimed work, dependencies, state and actual verification.
- [Deferred checks](doc/deferred-tests.md): required checks that have not passed yet in CI or a full local run.
- [Memory](doc/memory.md): confirmed decisions, changes and open questions.
- [Requirements](doc/prd.md), [architecture](doc/architecture.md), [design language](doc/design.md) and [sport rules](doc/rules.md): agreed product and implementation contracts.
- [Asset sources](doc/asset-sources.md): local artwork, responsive variants and license records.

Read these before extending a feature. Update the relevant existing file; do not create separate per-agent plans or status documents.

## Project layout

```text
frontend/
  public/                 favicon and approved local artwork
  src/
    app/                  central route registrations
    components/           shared header, sport icons and horizontal rail
    data/                 stable sport keys and labels
    features/
      home/               homepage, hero, matrix and sport filters
      matches/            match section, card and sample data
      tournaments/        tournament section, card and sample data
      sports/             shared sport page, cards and detail dialog
        <sport>/          display fixtures for one sport
    styles/               shared visual tokens and base styles
  tests/                  browser integration and responsive checks
doc/                      shared requirements, decisions, tasks and guides
```

Keep generated dependencies/build/test output out of Git. Deployment needs SPA route fallback. The planned host is Cloudflare; the backend stack is in [architecture](doc/architecture.md). GitHub Actions runs the checks and deploys (`develop` → staging, `main` → production). The repository is public, so its standard GitHub-hosted runners are free. Checks that have not passed yet are in [deferred checks](doc/deferred-tests.md).

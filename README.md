# Thaparlympics

A mobile-first sports homepage built with React, Vite and JavaScript. It includes the header, responsive athlete gallery and dot animation, live-match sport filters, native horizontal scorecards and tournament cards. All artwork is local.

Names, scores, clocks, breakdowns and tournament dates are display fixtures. The six sport pages use display fixtures. Tournament detail routes are reserved, with no page UI yet. Backend, database, authentication and live score delivery are planned.

## Start locally

Install Node.js **22.22 or newer** with npm. At the repository root:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:4174/](http://127.0.0.1:4174/) and keep the command running.

[Local development](doc/local-development.md) has prerequisites, dependencies, production preview, browser setup, checks and troubleshooting. It also explains GitHub Actions and Docker.

## Work with the team

- [AGENTS.md](AGENTS.md): shared skill/tool policy, file ownership, decision gates, code technique and documentation style.
- [Handoff](doc/handoff.md): the implemented homepage's integration points and fixed boundaries.
- [Tasks](doc/tasks.md): claimed work, dependencies, state and actual verification.
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

Keep generated dependencies/build/test output out of Git. Future deployment needs SPA route fallback; hosting is not selected. The existing GitHub Actions workflow checks the frontend and does not deploy it.

# ECG BIM Department Management Portal

Web platform for the ECG BIM Management Department: organization chart, project portfolio, teams & assignments,
workload analysis, weekly BIM Reels plan and an executive dashboard — all on one persistent database.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Recharts · PostgreSQL (Supabase) · server-side
role-based access · deployable on Vercel. Source code lives on GitHub.

> **Keep the GitHub repository PRIVATE.** `data/source/` and `db/seed.sql` contain the department's real project and
> employee data.

## Verification status — read this first

This code was written in an environment where the npm registry was blocked, so **`npm install` and `next build` have never
been run on it**. What *was* verified:

| Check | Result |
|---|---|
| Calculation library (`lib/metrics.ts`, `lib/importer.ts`, `lib/orgLayout.ts`) — 23 unit tests | Pass (`npm test`, needs only Node 22) |
| `db/schema.sql` + `db/seed.sql` on PostgreSQL 16 | Loads cleanly; counts match the workbook (21 employees, 119 projects, 263 assignments, 16 reels) |
| Key SQL used by the API run directly in `psql` | Pass |
| Real data pushed through the metrics library | Sensible results (per-manager counts match the workbook) |
| TypeScript check of all app code against stubbed external packages | No errors in the project's own types |
| **Not verified:** `next build`, rendering in a browser, API routes with a live database, exports, PDF generation | **Do this first** |

First run on your machine: `npm install && npm run typecheck && npm run build`. If anything fails, send the error output
and it will be fixed — expect a few small issues (typings of third-party packages, Tailwind class typos, etc.).

## Quick start (local)

```bash
npm install
cp .env.example .env            # set DATABASE_URL and SESSION_SECRET
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql      # once, on an empty database
npm run dev                      # http://localhost:3000  → /setup creates the first administrator
```

Deployment on Supabase + Vercel: see [docs/SETUP.md](docs/SETUP.md). Day-to-day use: [docs/USER_GUIDE.md](docs/USER_GUIDE.md).
Assumptions and open data questions: [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md). What the import found in your files:
[db/reconciliation.md](db/reconciliation.md).

## Project layout

```
app/(app)/            pages: dashboard, org, projects, teams, workload, reels, admin
app/api/              route handlers (all authorisation is enforced here)
components/           shell, filter bar, charts, project detail, assignment + import dialogs
lib/metrics.ts        every KPI / workload / alert / simulation calculation (unit tested)
lib/perm.ts           server-side project scope rules      lib/can.ts  UI mirror of the same rules
lib/importer.ts       Excel/CSV parsing helpers (unit tested)
db/schema.sql         tables, constraints, row-level security
db/seed.sql           data loaded from the supplied org chart, workbook and Reel Plan
scripts/              build_seed.py / build_seed_sql.py — regenerate the seed from data/source
data/source/          the original files you supplied
tests/                node --test unit tests
```

## Regenerating the seed

`npm run seed:build` re-reads `data/source/*` (needs Python 3 with `openpyxl`) and rewrites `db/seed.json`,
`db/seed.sql` and `db/reconciliation.md`. Only needed if the source files change before the first load.

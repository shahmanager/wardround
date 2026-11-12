# WardRound

A ward rounds and discharge tracker for a virus quarantine and treatment centre: a shared ward board that tells nurses who still needs a temperature today, tells doctors who is ready to see, and tells admin who can go home. Built as a Technical Product Manager assessment prototype — all data is fictional, all patients are synthetic.

## What it is

- One reading per patient per day, one visit after it, a computed fever-free streak, automatic eligibility, doctor approval, admin completion. The bed frees the moment the discharge completes.
- Real server-side RBAC (nurse, doctor, head doctor, admin), real sessions, an append-only audit log, and a per-visitor demo sandbox.
- The product thinking lives inside the app on the About page: the brief, the rules, the architecture, the decisions, the roadmap. The rules table and the permission matrix there are generated from the code, so documentation cannot drift from the implementation.

## Stack

- **Frontend:** React + TypeScript (strict) + Vite, Tailwind with design tokens, React Router, TanStack Query, hand-written inline SVG charts.
- **Backend:** Cloudflare Worker (Hono) serving `/api/*` and the single-page app; Cloudflare D1 (SQLite) with composite keys, partial unique indexes and CHECK constraints.
- **Shared domain:** `src/domain` — pure rule functions imported by both the Worker and the UI, covered by 152 unit and property tests named by rule id.

## Demo accounts

Sign in from the landing screen; each visitor gets an isolated copy of the ward.

| Role | Person |
|---|---|
| Nurse | Nurse Asha Nair, Nurse Imran Sheikh, Nurse Kavya Reddy |
| Doctor | Dr. Vikram Rao |
| Head doctor | Dr. Neha Kulkarni |
| Admin | Priya Menon |

Demo menu (available to everyone): **Advance to next day** and **Reset demo data**.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Build once, then serve locally with `wrangler dev` (Worker + SPA on one port). |
| `npm run dev:ui` | Vite dev server for fast UI iteration; proxies `/api` to `127.0.0.1:8787`. |
| `npm run build` | Build the SPA into `dist/`. |
| `npm run typecheck` | TypeScript strict check (`tsc --noEmit`). |
| `npm run lint` | ESLint over `src` and `scripts`. |
| `npm test` | Vitest: domain unit and property tests. |
| `npm run deploy` | Deploy the Worker + assets to Cloudflare. |
| `npm run db:migrate:local` / `:remote` | Apply D1 migrations locally / to the remote database. |
| `npm run db:seed:template` / `:remote` | Generate and load the deterministic template workspace (local / remote). |
| `npm run check:placeholders` | Fails if builder placeholders remain in `src` (run in `release`, not `test`). |
| `npm run release` | typecheck + lint + test + build + placeholder check. |

Exact deployment steps are in [DEPLOY.md](DEPLOY.md); every non-obvious product and engineering call is recorded in [DECISIONS.md](DECISIONS.md).

## Where the product thinking lives

Open **About** from the header on any screen. It contains the product brief (problem, personas, metrics, user stories, risks, rollout), how the rules work, the architecture and permission matrix, the decisions with their rejected alternatives, the roadmap, the open questions for the head doctor, the production path, and a step-by-step demo guide.

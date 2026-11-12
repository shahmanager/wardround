# Deploying WardRound to Cloudflare

These commands, in order, take a fresh machine to a live URL. The D1 database is already created — its id is in `wrangler.jsonc` — so there is no `d1 create` step.

## Prerequisites

- Node 20 or later and npm.
- A Cloudflare account.

## Deploy

```powershell
# 1. Authenticate Wrangler (opens a browser)
npx wrangler login

# 2. Install dependencies
npm install

# 3. The D1 database already exists (id in wrangler.jsonc) — no d1 create needed.

# 4. Apply the schema to the remote database
npm run db:migrate:remote

# 5. Generate the deterministic template workspace, then load it to the remote database
npx tsx scripts/seed-template.ts
npm run db:seed:template:remote

# 6. (Optional) set the session secret. If skipped, the app bootstraps a
#    generated secret into the D1 meta table and signs cookies with it.
#    Setting a real Wrangler secret replaces the bootstrap (see About > Production path).
npx wrangler secret put SESSION_SECRET

# 7. Build and deploy
npm run build
npm run deploy
```

`npm run deploy` prints the public URL. First deploy may ask to create the Worker — answer yes.

## Verify

1. `GET https://<your-worker>/api/health` returns JSON (not HTML).
2. Open the URL, sign in as a demo person (say, Nurse Asha) — the ward loads populated.
3. Copy a deep link (for example `/patient/<id>`), open it in a new tab and refresh: the single-page fallback must serve the app, not a 404.

## Local development

```powershell
npm install
npm run db:migrate:local      # apply migrations to the local D1
npm run db:seed:template      # generate + load the template workspace locally
npm run dev                   # build once, then serve with wrangler dev
#   or: npm run dev:ui        # Vite dev server; proxies /api to 127.0.0.1:8787
#   or: npm run build && npx wrangler dev
```

`.dev.vars` is gitignored and is for local only — put local overrides (for example `SESSION_SECRET`) there, never in the repo.

## Before shipping

```powershell
npm run release   # typecheck + lint + test + build + placeholder check
```

The placeholder check fails while the About page still contains the three builder fields — fill them in `src/web/content/about.ts` first.

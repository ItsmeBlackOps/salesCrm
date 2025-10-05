# Safe Dev & Test Setup — No Real Database URI
This document explains how the team can **build, run, and test** the frontend and its API integrations **without** knowing or using the real production database URI. It keeps current access rules intact and uses **synthetic data** only.

---

## Goals
- Developers **never** see real DB URIs or real data.
- All tests (lint/type/unit/component/E2E smoke) pass against **local or ephemeral** databases seeded with **fake data**.
- Production/staging secrets live only in **secret stores** and CI, never in source code or `.env` files shared with vendors.

---

## Environments
| Env | Purpose | DB | Secrets |
|---|---|---|---|
| **local** | Dev on laptops | Docker Postgres on `localhost:5438` | `.env.local` (fake URI) |
| **test** | CI & integration tests | Docker Postgres on `localhost:5439` | CI secret for ephemeral DB password only |
| **staging** | Internal only | Managed DB (masked/synthetic data) | Secret manager (org-only) |
| **production** | Real users | Managed DB | Secret manager (org-only) |

> Vendors/new devs **only** use `local` and `test`.

---

## Do Not Share
- Real database URIs or passwords
- Production/staging dumps
- Any PII or customer data
- Screenshots or logs containing real connection strings

---

## Source Control Rules
- Commit **`.env.example`** (placeholders), but **do not commit** any `.env*` with real values.
- Add secret scanners (pre-commit and CI) to block accidental commits of URIs/keys.
- Code must read the database URI from an **environment variable**, not hard-coded constants.

---

## Files in this bundle
- `.env.example` — placeholders only
 - `seed/docker-compose.test.yml` — local containers for **dev** and **test** DBs
 - `seed/seed.sql` — small synthetic dataset (roles/users/leads/clients) to support UI tests
- `SAFE_DEV_TEST.md` (this guide)

---

## Quick Start (devs)
```bash
# 1) Copy example envs and fill local-only values (no real URIs)
cp .env.example .env.local

# 2) Start local Postgres (dev on 5438, test on 5439)
docker compose -f seed/docker-compose.test.yml up -d db_dev db_test

# 3) Create & migrate databases (choose your ORM/SQL migration tool)
# Example (generic CLI):
npm run db:migrate

# 4) Seed synthetic data
npm run db:seed

# 5) Run checks and tests
npm run lint
npm run typecheck
npm run test                 # all unit/component (Vitest via jest alias)
npm run e2e                  # optional smoke
```

### One-command setup
Alternatively, run the helper script from `pulseCrm` to do all steps:

```bash
cd pulseCrm
# For dev DB on 5438
npm run setup:safe -- dev
# Or test DB on 5439
npm run setup:safe -- test
```

This will:
- Start the docker databases
- Create `.env.local` with fake URIs if missing
- Export `DATABASE_URL` and run `db:migrate` + `db:seed`

---

## NPM Scripts (suggested)
Add these to your `package.json`:
```json
{
  "scripts": {
    "lint": "eslint --max-warnings 0 'src/**/*.{ts,tsx}'",
    "typecheck": "tsc --noEmit",
    "db:migrate": "node scripts/migrate.js",
    "db:seed": "psql $DATABASE_URL -f seed/seed.sql",
    "test": "jest --runInBand",
    "e2e": "playwright test",

    "test:task01": "jest SignInSafeguards.test.tsx",
    "test:task02": "jest LogoutFlow.test.tsx",
    "test:task03": "jest Profile.test.tsx",
    "test:task04": "jest UsersList.test.tsx",
    "test:task05": "jest UserDetail.test.tsx",
    "test:task06": "jest RolesPermissions.test.tsx",
    "test:task07": "jest RoleAccess.test.tsx",
    "test:task08": "jest LeadsList.test.tsx",
    "test:task09": "jest LeadDetails.test.tsx",
    "test:task10": "jest Clients.test.tsx",
    "test:task11": "jest ColumnsDrawer.test.tsx",
    "test:task12": "jest SystemLogs.test.tsx",
    "test:task13": "jest DepartmentsProvider.test.tsx",
    "test:task14": "jest DiagnosticsLink.test.tsx"
  }
}
```

**Run per-task tests like:**
```bash
npm run test:task01
npm run test:task02
# ...
```

---

## .env Management
- Keep **real** URIs only in secret stores (org-only).
- Provide **fake** URIs for dev/test. Example:
  - `DATABASE_URL_DEV=postgres://dev:dev@localhost:5438/app_dev`
  - `DATABASE_URL_TEST=postgres://test:test@localhost:5439/app_test`
- App selects URL by `NODE_ENV` or a dedicated `DB_ENV` switch.

**Sample `.env.local` (do not commit):**
```env
# Choose which DB to use locally (dev/test)
DB_ENV=dev

# Local-only URIs (fake)
DATABASE_URL_DEV=postgres://dev:dev@localhost:5438/app_dev
DATABASE_URL_TEST=postgres://test:test@localhost:5439/app_test

# Feature flags
FEATURE_DIAGNOSTICS=false
```

If using the one-command setup, `.env.local` is created automatically.

**Sample `.env.example` (committed):**
- See file in this bundle.

---

## Docker Services (local only)
Use the provided `seed/docker-compose.test.yml` to spin up 2 Postgres containers with **known fake credentials**:

- `db_dev`: `postgres://dev:dev@localhost:5438/app_dev`
- `db_test`: `postgres://test:test@localhost:5439/app_test`

> These are for synthetic data only. No production data is ever imported.

---

## Synthetic Data Seeding
The `seed/seed.sql` creates minimal rows required by the UI:
- Roles: Super Admin, Admin, Manager, Agent, Lead
- Users: one per role (emails like `sa@example.test`, password hashes **fake**)
- Departments: sample set
- Leads/Clients: a handful with owner assignments across roles

**Run:**
```bash
npm run db:seed
```

---

## CI Rules (test env)
- CI spins up `db_test` from the same compose, or uses a container service.
- Use a **short‑lived password** from CI secrets (not in repo).  
- Run `db:migrate`, then `db:seed`, then `npm test` and `npm run e2e` (optional).  
- **Block** merges if any secret scanner detects a URI/credential in diffs.

---

## Hard Guards (app-level)
- Fail fast if `DATABASE_URL` host matches a production domain pattern (to avoid accidental local connects).
- Never log connection strings.
- Feature flags should not leak via DOM when disabled.
- RBAC gating: buttons **not rendered** for unauthorized roles.

**Example runtime check (pseudo):**
```ts
if (process.env.DATABASE_URL?.includes('prod-db.mycorp.com')) {
  throw new Error('Refusing to run with a production DB URL in non-prod app.');
}
```

---

## Acceptance Criteria (security)
- No real DB URIs are shared in code, docs, or `.env*` files.
- Local and CI tests pass using **only** the provided containers + synthetic data.
- Secret scanners in pre-commit and CI block accidental secret commits.
- Attempting to use a production-like URI locally triggers a startup error.
- Logs/toasts never display connection strings or secrets.

---

## Troubleshooting
- **Connection refused** → Ensure ports 5438/5439 free; `docker ps` to check.
- **Tests flaky** → Wait for DB ready; consider retries in `db:migrate` script.
- **Seed errors** → Drop and recreate DBs, then re-run seed.

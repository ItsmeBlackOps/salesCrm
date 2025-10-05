Safe Dev/Test Seed

This folder contains tooling to run the app locally against synthetic data only. No real DB URIs or data are used.

Contents
- seed/seed.sql: Minimal fake dataset (roles, users, departments, leads, clients)
- seed/docker-compose.test.yml: Postgres containers for dev/test
- seed/SAFE_DEV_TEST.md: Full guide and policies

Quick Start
1) docker compose -f seed/docker-compose.test.yml up -d db_dev db_test
2) Set DATABASE_URL in your shell to the chosen DB (e.g., postgres://dev:dev@localhost:5438/app_dev)
3) npm run db:migrate
4) npm run db:seed

Notes
- Never commit real connection strings. Use only the fake URIs listed in SAFE_DEV_TEST.md.
- The root package.json exposes `db:migrate` (placeholder) and `db:seed` scripts.


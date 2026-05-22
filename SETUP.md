# AI Report Generator Setup

This project is built on AnythingLLM, but the public AI Report Generator configuration is seeded from code so a fresh clone does not depend on one developer's local database.

## Fresh Clone Setup

```powershell
git clone <repo>
cd AI-Report-Genrator
copy .env.example .env
copy server\.env.example server\.env
copy server\.env.example server\.env.development
copy frontend\.env.example frontend\.env
copy collector\.env.example collector\.env
yarn install
yarn setup:dev
yarn dev:all
```

Then open:

```text
http://localhost:3000/
```

The public report generator should show `Detailed Energy Audit Report` as `Available`.

## After Git Pull

```powershell
git pull origin main
yarn install
yarn setup:dev
yarn dev:all
```

## What Gets Seeded

`yarn setup:dev` runs Prisma migrations and `prisma db seed`. The seed creates or updates:

- `system_settings.onboarding_complete=true`, so the default AnythingLLM first setup page is skipped in development.
- `system_settings.multi_user_mode=false`.
- The `Commercial Building Energy Audit` workspace with slug `commercial-building-energy-audit`.
- The public report template with slug `commercial-building-energy-audit`.
- Template name `Detailed Energy Audit Report`.
- Status `active`, `showInPublic=true`, and public badge `Available`.
- Component path `frontend/src/components/templates/commercial-building-energy-audit/CommercialBuildingEnergyAuditTemplate.tsx`.
- Allowed upload types: `xlsx`, `xls`, `pdf`, `docx`, `pptx`, `jpg`, `jpeg`, `png`.
- The active template version in `report_template_versions`.
- Default extraction, JSON generation, and validation prompts.
- Coming soon template records for `boiler-audit`, `motor-retrofit`, `apfc-report`, `solar-report`, and `hvac-report`.
- `useAnythingLLM=false` by default unless LLM/API environment variables are configured.

## Where Local Customization Lives

Do not commit local runtime state. AnythingLLM and the report generator store runtime customization in:

- `server/storage/anythingllm.db`, the SQLite Prisma database.
- `report_templates` and `report_template_versions`.
- `system_settings`, including onboarding state and AnythingLLM settings.
- `workspaces`, including workspace slug and prompt settings.
- `.env`, `server/.env.development`, `frontend/.env`, and `collector/.env`.
- Runtime storage folders such as `storage/`, `documents/`, `hotdir/`, and `vector-cache/`.

The seed script recreates the required public report setup without committing the local database.

## Safe Environment Files

Use the example files as templates:

- `.env.example`
- `server/.env.example`
- `frontend/.env.example`
- `collector/.env.example`

Never commit real API keys, JWT secrets, uploaded files, vector caches, or SQLite database files.

## Requirements

- Node.js 20 or newer.
- Yarn 1.22 or newer.
- Do not commit `.env`, `server/.env`, `server/.env.development`, uploaded files, vector cache, or SQLite DB files.

## Troubleshooting

- If port `3001` is busy, stop the old Node/server process and run `yarn dev:all` again.
- If the database is fresh, `yarn setup:dev` runs migrations and seeds the templates automatically.
- If the public page says no templates are configured, run `yarn setup:dev` again and check the server output for Prisma errors.

## Reset Local Seeded State

To test a clean database without deleting your working database, rename it first:

```powershell
ren server\storage\anythingllm.db anythingllm.db.backup
yarn setup:dev
yarn dev:all
```

If you need your previous local data again, stop the app and rename the backup back to `anythingllm.db`.

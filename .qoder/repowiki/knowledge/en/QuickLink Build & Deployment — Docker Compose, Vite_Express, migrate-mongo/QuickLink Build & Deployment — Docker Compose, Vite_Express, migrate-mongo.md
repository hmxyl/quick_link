---
kind: build_system
name: QuickLink Build & Deployment — Docker Compose, Vite/Express, migrate-mongo
category: build_system
scope:
    - '**'
source_files:
    - doc/BUILD.md
---

## Build System Overview

This repository is a **documentation-only snapshot** of the QuickLink project. The only file present is `doc/BUILD.md`, which describes a monorepo layout with separate `client/` (React + TypeScript + Vite) and `server/` (Node.js + Express + TypeScript) subprojects, plus Docker-based deployment. No executable build scripts, CI pipelines, or version manifests are included in this branch.

## What the documented build system uses

- **Frontend build**: Vite (`vite.config.ts`) producing a static SPA; development server on port 5173.
- **Backend build**: Node.js + TypeScript compiled via `ts-node-dev` for dev; Jest for backend unit tests; Vitest for frontend tests.
- **Database migrations**: `migrate-mongo` with scripts under `server/src/migrations/`, configured via `migrate-mongo-config.js`; migration files follow a `YYYYMMDDHHMMSS-description.js` naming convention and run against MongoDB 7.
- **Environment configuration**: `.env.example` at repo root defines `PORT`, `NODE_ENV`, `MONGODB_URI`, `MONGODB_DB_NAME`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ENCRYPTION_SALT`, and `VITE_API_BASE_URL`.
- **Containerization**: Two multi-stage images referenced from `docker-compose.yml` — `Dockerfile.server` builds the Express API, `Dockerfile.client` builds the React SPA and serves it via Nginx on port 80 (exposed as 5173). `docker-compose.yml` orchestrates three services: `mongodb` (image `mongo:7`), `server`, and `client`, with `depends_on` ensuring startup order and a named volume `mongo_data` for persistence.
- **Local development flow** (per the doc): install deps in both `server/` and `client/`, start MongoDB via `docker-compose up -d mongodb`, run `npx migrate-mongo up` inside `server/`, then launch backend with `npm run dev` and frontend with `npm run dev` in `client/`.

## Key files (as described by the documentation)

- `doc/BUILD.md` — single source of truth for the build/deploy process in this snapshot.
- `docker-compose.yml` — composes MongoDB, server, and client containers.
- `Dockerfile.server` — builds the Express/TypeScript backend image.
- `Dockerfile.client` — builds the React/Vite frontend image.
- `server/package.json` — declares Express, Mongoose, migrate-mongo, JWT, bcrypt, express-validator, express-rate-limit, cors, helmet, dotenv, plus Jest/ts-node-dev dev dependencies.
- `client/package.json` — declares React 18, Ant Design 5, Axios, Zustand, Vite, Vitest, and related tooling.
- `server/src/migrations/migrate-mongo-config.js` — points migrate-mongo at the MongoDB URI/database and sets `moduleSystem: "commonjs"`.
- `.env.example` — template for all runtime environment variables.

## Architecture & conventions observed in the docs

- **Monorepo structure**: `client/` and `server/` are independent npm projects sharing a top-level `docker-compose.yml`. Each has its own `package.json`, `tsconfig.json`, and dependency graph — there is no shared workspace manager (e.g., pnpm/npm workspaces) referenced.
- **Separation of concerns per layer**: Frontend (Vite + React + Ant Design), Backend (Express + Mongoose + JWT), Database (MongoDB 7), Migration (migrate-mongo), Container orchestration (Docker Compose).
- **Migration-first data evolution**: Schema changes are always expressed as ordered JS migration scripts under `server/src/migrations/`, never ad-hoc schema mutations in application code.
- **Environment-driven config**: All secrets and endpoints come from `.env` (loaded via `dotenv` on the server, `VITE_`-prefixed vars consumed by Vite on the client); nothing is hardcoded.
- **Containerized deployment**: Production runs three containers with explicit service dependencies; MongoDB data persists to a named volume.

## Conventions & constraints

- Migration filenames must match `YYYYMMDDHHMMSS-<description>.js` so they execute in chronological order.
- Each migration script exports an object with `async up(db, client)` and `async down(db, client)` functions.
- The `migrate-mongo` changelog is stored in a `migrations` collection in the target database.
- The frontend dev server listens on port 5173; the backend on port 3000; the production client container exposes port 80 mapped to host 5173.
- The documented security posture requires HTTPS, rate limiting, input validation, CORS whitelisting, audit logging, and password strength checks — these are listed as checklist items rather than implemented code in this snapshot.

## Gaps in this snapshot

- No Makefile, shell build scripts, GitHub Actions/GitLab CI, or release automation are present in this branch.
- No actual `client/`, `server/`, `docker-compose.yml`, or `Dockerfile.*` source files are included — only their descriptions in `BUILD.md`.
- Version pinning is shown only as caret ranges in the documented `package.json` snippets; no lockfiles or tag/release strategy are documented here.

In short, the build system for QuickLink is a **Vite + Express monorepo orchestrated by Docker Compose**, with `migrate-mongo` handling schema evolution. This branch contains only the build/deployment specification, not the executable artifacts.
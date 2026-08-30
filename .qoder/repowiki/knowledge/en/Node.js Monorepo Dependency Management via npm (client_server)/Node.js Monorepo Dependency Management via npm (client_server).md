---
kind: dependency_management
name: Node.js Monorepo Dependency Management via npm (client/server)
category: dependency_management
scope:
    - '**'
source_files:
    - doc/BUILD.md
---

## What system/approach is used

This repository is a Node.js monorepo with two separate npm workspaces — `client/` (React + Vite + TypeScript) and `server/` (Express + TypeScript). Dependencies are declared per workspace using standard `package.json` files under each subdirectory. There is no shared root `package.json`, no lockfiles committed to the repo, and no vendoring strategy. The project uses Docker Compose for runtime orchestration but does not pin dependency versions in a lockfile.

## Key files and packages

- `doc/BUILD.md` — Contains the authoritative dependency manifest as embedded JSON snippets for both `server/package.json` and `client/package.json`. This document lists every runtime and dev dependency along with their version ranges (caret `^` ranges).
- `server/package.json` (referenced by BUILD.md) — Declares backend dependencies: `express`, `mongoose`, `migrate-mongo`, `jsonwebtoken`, `bcrypt`, `express-validator`, `express-rate-limit`, `cors`, `helmet`, `dotenv`, plus TypeScript/Jest tooling.
- `client/package.json` (referenced by BUILD.md) — Declares frontend dependencies: `react`, `react-dom`, `react-router-dom`, `antd`, `@ant-design/icons`, `axios`, `zustand`, `dayjs`, plus Vite/Vitest/TypeScript tooling.
- `docker-compose.yml`, `Dockerfile.client`, `Dockerfile.server` — Define how the built images consume these dependencies at runtime; they do not pin npm versions themselves.

## Architecture and conventions

- **Per-workspace manifests**: Each of the two projects (`client/`, `server/`) maintains its own `package.json`, keeping frontend and backend dependency sets isolated.
- **Caret version ranges**: All dependencies use `^` ranges (e.g. `"express": "^4.18.0"`, `"react": "^18.2.0"`), allowing minor/patch updates automatically during `npm install`.
- **No lockfiles committed**: The repository contains no `package-lock.json` or `pnpm-lock.yaml`; reproducible installs rely on environment setup rather than checked-in resolution graphs.
- **No private registry / vendor directory**: No `.npmrc`, `GOPRIVATE`, `vendor/`, or private registry configuration is present. Dependencies are resolved from the public npm registry.
- **Dev vs runtime separation**: Both workspaces split dependencies into `dependencies` and `devDependencies`, following standard npm convention.
- **External services as dependencies**: MongoDB is treated as an external service (via `docker-compose.yml`) rather than a package dependency; database migrations are managed through the `migrate-mongo` npm package.

## Conventions and constraints

- **Version pinning style**: All third-party packages use caret (`^`) semver ranges, which permit non-breaking updates. This is observed in the dependency list embedded in `doc/BUILD.md`.
- **Single source of truth for manifests**: The `doc/BUILD.md` file documents the complete dependency set for both client and server; actual `package.json` files are expected to mirror this list.
- **No transitive dependency management policy**: The repo does not enforce tools like `npm audit`, `yarn dedupe`, or `depcheck`; there is no documented process for auditing or updating dependencies beyond running `npm install`.
- **Environment-driven configuration**: Runtime configuration (MongoDB URI, JWT secret, encryption salt, API base URL) is loaded via `dotenv` and environment variables (see `.env.example` referenced in BUILD.md); secrets are never baked into dependencies.
- **Docker-based deployment**: While containers are defined, they do not pin the underlying Node.js image version nor the npm version inside the Dockerfiles shown in the documentation.
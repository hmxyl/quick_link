# Architecture Documentation

<cite>
**Referenced Files in This Document**
- [BUILD.md](file://doc/BUILD.md)
</cite>

## Table of Contents
1. Introduction
2. Project Structure
3. Core Components
4. Architecture Overview
5. Detailed Component Analysis
6. Dependency Analysis
7. Performance Considerations
8. Troubleshooting Guide
9. Conclusion

## Introduction
QuickLink is a full-stack monorepo that provides a personal knowledge management tool for bookmarking links and securely storing account credentials. The system separates the frontend (React + TypeScript + Vite) from the backend (Node.js + Express + TypeScript), with MongoDB as the data store. It implements an MVC-style backend, robust security using JWT, bcrypt, and AES-256-GCM encryption, and supports schema migrations via migrate-mongo. Deployment is containerized with Docker Compose to run client, server, and database together.

## Project Structure
The repository follows a monorepo layout with distinct client and server directories, shared configuration files, and Docker artifacts at the root level. The documentation describes:
- Client: React 18, TypeScript, Vite, Ant Design 5, Zustand for state management, Axios for HTTP calls.
- Server: Express, TypeScript, Mongoose, migrate-mongo, JWT, bcrypt, express-validator, rate limiting, CORS, Helmet.
- Database: MongoDB 7 with collections for users, links, accounts, tags, and migration tracking.
- DevOps: Docker Compose orchestrates MongoDB, server, and client containers; environment variables are managed via .env.

```mermaid
graph TB
subgraph "Client"
C_UI["React UI"]
C_API["Axios API Layer"]
end
subgraph "Server"
S_ROUTES["Express Routes"]
S_CTRL["Controllers"]
S_SVC["Services"]
S_MW["Middleware (Auth/Validation)"]
S_CFG["Config (DB/Crypto/Env)"]
end
subgraph "Data"
D_DB["MongoDB"]
end
C_UI --> C_API
C_API --> S_ROUTES
S_ROUTES --> S_MW
S_MW --> S_CTRL
S_CTRL --> S_SVC
S_SVC --> D_DB
S_SVC --> S_CFG
```

**Diagram sources**
- [BUILD.md:33-92](file://doc/BUILD.md#L33-L92)
- [BUILD.md:285-337](file://doc/BUILD.md#L285-L337)

**Section sources**
- [BUILD.md:33-92](file://doc/BUILD.md#L33-L92)

## Core Components
- Frontend (client): Pages for Dashboard, Links, Accounts, Settings, Auth; services encapsulate API calls; stores manage global state; hooks and utils support reusable logic.
- Backend (server): Controllers handle HTTP requests; services implement business logic; models define Mongoose schemas; routes map endpoints; middleware enforces authentication and validation; config centralizes DB, crypto, and env settings.
- Database: Collections include users, links, accounts, tags, and migrations; indexes optimize queries and searches.
- Security: JWT-based session management; bcrypt for password hashing; AES-256-GCM for encrypting sensitive fields derived from a master key.

**Section sources**
- [BUILD.md:17-30](file://doc/BUILD.md#L17-L30)
- [BUILD.md:33-92](file://doc/BUILD.md#L33-L92)
- [BUILD.md:96-198](file://doc/BUILD.md#L96-L198)
- [BUILD.md:339-391](file://doc/BUILD.md#L339-L391)

## Architecture Overview
The system uses a layered architecture:
- Presentation layer (React SPA) renders views and collects user input.
- API layer (Express routes) validates inputs and delegates to controllers.
- Business layer (services) performs domain operations, including encryption/decryption and data transformations.
- Data access layer (Mongoose models) interacts with MongoDB.
- Middleware handles cross-cutting concerns like authentication, rate limiting, and error handling.

```mermaid
sequenceDiagram
participant FE as "Frontend (React)"
participant API as "Express Routes"
participant MW as "Auth/Validation Middleware"
participant CTRL as "Controllers"
participant SVC as "Services"
participant DB as "MongoDB"
FE->>API : "HTTP request (e.g., GET /api/links)"
API->>MW : "Invoke auth/validation"
MW-->>API : "Proceed or reject"
API->>CTRL : "Dispatch to controller"
CTRL->>SVC : "Call service method"
SVC->>DB : "Query/update documents"
DB-->>SVC : "Return data"
SVC-->>CTRL : "Business result"
CTRL-->>API : "Response payload"
API-->>FE : "JSON response"
```

**Diagram sources**
- [BUILD.md:285-337](file://doc/BUILD.md#L285-L337)
- [BUILD.md:339-391](file://doc/BUILD.md#L339-L391)

## Detailed Component Analysis

### Backend MVC Pattern
- Controllers: Handle HTTP request/response mapping, parameter extraction, and delegation to services.
- Services: Encapsulate business rules, orchestrate encryption/decryption, and coordinate data operations.
- Models: Define Mongoose schemas for users, links, accounts, and tags with field types, constraints, and timestamps.

```mermaid
classDiagram
class LinkController {
+list()
+get(id)
+create()
+update(id)
+delete(id)
}
class AccountController {
+list()
+get(id)
+create()
+update(id)
+delete(id)
+decryptPassword(id)
+generatePassword(id)
}
class AuthController {
+register()
+login()
+logout()
+me()
+changePassword()
}
class TagController {
+list()
+create()
+update(id)
+delete(id)
}
class LinkService
class AccountService
class CryptoService
class LinkModel
class AccountModel
class UserModel
class TagModel
LinkController --> LinkService : "delegates"
AccountController --> AccountService : "delegates"
AuthController --> UserModel : "uses"
LinkService --> LinkModel : "queries"
AccountService --> AccountModel : "queries"
AccountService --> CryptoService : "encrypts/decrypts"
```

**Diagram sources**
- [BUILD.md:59-86](file://doc/BUILD.md#L59-L86)
- [BUILD.md:285-337](file://doc/BUILD.md#L285-L337)

**Section sources**
- [BUILD.md:59-86](file://doc/BUILD.md#L59-L86)
- [BUILD.md:285-337](file://doc/BUILD.md#L285-L337)

### Database Schema and Indexing
Collections:
- users: identity and authentication data, includes password hash and encrypted master key.
- links: bookmarks with metadata, categorization, favorites, archive flags, visit counters, and timestamps.
- accounts: secure credential storage with platform identifiers, optional link associations, and encrypted sensitive fields.
- tags: user-scoped tags with optional color metadata.
- migrations: tracks applied migration scripts.

Indexing strategy:
- Composite indexes on userId with createdAt, tags, category, and favorite flags to optimize listing and filtering.
- Text index on title and description for full-text search.
- Unique composite index on userId and tag name to prevent duplicates per user.

```mermaid
erDiagram
USERS {
objectId _id PK
string username UK
string email UK
string passwordHash
string masterKey
datetime createdAt
datetime updatedAt
}
LINKS {
objectId _id PK
objectId userId FK
string url
string title
string description
string icon
string screenshot
string[] tags
string category
boolean isFavorite
boolean isArchived
number clickCount
datetime lastVisitedAt
datetime createdAt
datetime updatedAt
}
ACCOUNTS {
objectId _id PK
objectId userId FK
string platform
objectId linkId FK
string usernameEnc
string emailEnc
string passwordEnc
string notesEnc
string totpSecretEnc
string[] tags
string category
datetime lastUsedAt
datetime passwordUpdatedAt
datetime createdAt
datetime updatedAt
}
TAGS {
objectId _id PK
objectId userId FK
string name
string color
datetime createdAt
}
USERS ||--o{ LINKS : "owns"
USERS ||--o{ ACCOUNTS : "owns"
USERS ||--o{ TAGS : "owns"
LINKS ||--o{ ACCOUNTS : "optional association"
```

**Diagram sources**
- [BUILD.md:96-198](file://doc/BUILD.md#L96-L198)

**Section sources**
- [BUILD.md:96-198](file://doc/BUILD.md#L96-L198)

### Security Architecture
- Authentication: JWT tokens issued upon login, validated by middleware for protected routes.
- Password Hashing: bcrypt used to store password hashes for user authentication.
- Encryption: AES-256-GCM encrypts sensitive fields (passwords, emails, notes, TOTP secrets) using keys derived from the user’s master password via PBKDF2.
- Operational Security: HTTPS enforcement, token expiration, rate limiting, input validation, CORS whitelisting, audit logging, strong password policies, and environment-based secrets.

```mermaid
flowchart TD
Start(["User Action"]) --> CheckAuth["JWT Validation"]
CheckAuth --> |Valid| Proceed["Proceed to Controller"]
CheckAuth --> |Invalid| Deny["Reject Request"]
Proceed --> EncryptSensitive{"Encrypt Sensitive Fields?"}
EncryptSensitive --> |Yes| DeriveKey["Derive Key from Master Password"]
DeriveKey --> AESEncrypt["AES-256-GCM Encrypt"]
AESEncrypt --> Persist["Persist to MongoDB"]
EncryptSensitive --> |No| Persist
Persist --> ReturnResp["Return Response"]
Deny --> End(["End"])
ReturnResp --> End
```

**Diagram sources**
- [BUILD.md:339-391](file://doc/BUILD.md#L339-L391)

**Section sources**
- [BUILD.md:339-391](file://doc/BUILD.md#L339-L391)

### API Endpoints and Data Flow
Endpoints cover authentication, links, accounts, and tags with standard CRUD operations, batch import/export, search, and specialized actions like password decryption and generation.

```mermaid
sequenceDiagram
participant FE as "Frontend"
participant API as "Express API"
participant AUTH as "Auth Middleware"
participant CTRL as "Controller"
participant SVC as "Service"
participant DB as "MongoDB"
FE->>API : "POST /api/auth/login"
API->>AUTH : "Validate credentials"
AUTH-->>API : "Success/Failure"
API->>CTRL : "Handle login"
CTRL->>DB : "Find user, verify password"
DB-->>CTRL : "User record"
CTRL-->>FE : "JWT token"
FE->>API : "GET /api/links?page=1&limit=20&search=..."
API->>AUTH : "Verify JWT"
AUTH-->>API : "Authorized"
API->>CTRL : "List links"
CTRL->>SVC : "Build query, apply filters"
SVC->>DB : "Aggregate/find with indexes"
DB-->>SVC : "Results"
SVC-->>CTRL : "Formatted data"
CTRL-->>FE : "Paginated links"
```

**Diagram sources**
- [BUILD.md:285-337](file://doc/BUILD.md#L285-L337)
- [BUILD.md:96-198](file://doc/BUILD.md#L96-L198)

**Section sources**
- [BUILD.md:285-337](file://doc/BUILD.md#L285-L337)

### Migration Strategy
- Tool: migrate-mongo manages versioned schema changes.
- Configuration: Centralized config points to MongoDB URI and database name, with migration directory and changelog collection.
- Scripts: Timestamped filenames ensure ordering; each script defines up/down functions to apply or revert changes.
- Commands: Status checks, apply migrations, rollback, and create new scripts.

```mermaid
flowchart TD
Init["Start Migration Process"] --> ReadCfg["Read migrate-mongo config"]
ReadCfg --> ListScripts["List pending scripts"]
ListScripts --> ApplyUp{"Apply 'up'?"}
ApplyUp --> |Yes| ExecUp["Execute up(db, client)"]
ExecUp --> Record["Record in migrations collection"]
Record --> NextScript["Next script"]
ApplyUp --> |No| Done["Done"]
NextScript --> ListScripts
```

**Diagram sources**
- [BUILD.md:201-282](file://doc/BUILD.md#L201-L282)

**Section sources**
- [BUILD.md:201-282](file://doc/BUILD.md#L201-L282)

### Deployment Topology
Docker Compose defines three services:
- mongodb: persistent volume for data, exposed port 27017.
- server: builds from Dockerfile.server, exposes port 3000, depends on mongodb.
- client: builds from Dockerfile.client, exposes port 5173 mapped to container port 80, depends on server.

```mermaid
graph TB
subgraph "Docker Network"
MONGO["mongodb:7"]
SRV["quicklink-server"]
CLI["quicklink-client"]
end
CLI --> SRV
SRV --> MONGO
```

**Diagram sources**
- [BUILD.md:418-459](file://doc/BUILD.md#L418-L459)

**Section sources**
- [BUILD.md:418-459](file://doc/BUILD.md#L418-L459)

## Dependency Analysis
- Frontend dependencies: React ecosystem, Ant Design, Axios, Zustand, Day.js, Vite toolchain.
- Backend dependencies: Express, Mongoose, migrate-mongo, JWT, bcrypt, validators, rate limiter, CORS, Helmet, dotenv.
- External integrations: MongoDB as the sole data store; no additional microservices in this design.

```mermaid
graph LR
FE["Frontend Dependencies"] --> |"HTTP"| BE["Backend Dependencies"]
BE --> |"Mongoose"| DB["MongoDB"]
BE --> |"migrate-mongo"| SCHEMA["Schema Migrations"]
BE --> |"bcrypt/jwt"| SEC["Security Utilities"]
```

**Diagram sources**
- [BUILD.md:540-594](file://doc/BUILD.md#L540-L594)

**Section sources**
- [BUILD.md:540-594](file://doc/BUILD.md#L540-L594)

## Performance Considerations
- Query Optimization: Use composite indexes on frequently filtered fields (userId, tags, category, favorite flags) and text indexes for search.
- Pagination and Filtering: Implement server-side pagination and filtering to reduce payload sizes.
- Caching: Consider in-memory caching for read-heavy endpoints if needed.
- Rate Limiting: Protect endpoints against abuse and brute-force attempts.
- Encryption Overhead: Decrypt only when necessary; avoid exposing sensitive fields in list responses.
- Connection Pooling: Tune Mongoose connection pool settings for high concurrency.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Authentication Issues: Verify JWT secret and expiration settings; ensure middleware is applied to protected routes.
- Encryption Errors: Confirm master key derivation parameters and IV/tag handling; validate stored payloads format.
- Database Connectivity: Check MongoDB URI, database name, and network reachability within Docker network.
- Migration Failures: Inspect migration logs; use status commands to identify pending or failed scripts; roll back if necessary.
- Input Validation: Ensure express-validator rules match expected payloads; review error responses for clues.

**Section sources**
- [BUILD.md:339-391](file://doc/BUILD.md#L339-L391)
- [BUILD.md:201-282](file://doc/BUILD.md#L201-L282)

## Conclusion
QuickLink’s architecture cleanly separates client and server concerns while enforcing strong security practices and scalable data access patterns. The MVC backend organizes responsibilities across controllers, services, and models, backed by a well-indexed MongoDB schema. Containerized deployment simplifies local development and production-like environments. With clear migration strategies and comprehensive security controls, the system is positioned for maintainable growth and reliable operation.
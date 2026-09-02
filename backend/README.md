# Shirone Backend

The backend is the provider-neutral runtime for Shirone's dynamic edition. It will own content, authentication, permissions, comments, media, and administration while Astro remains the shared presentation layer.

## Local SQLite smoke test

```powershell
go run ./cmd/server
```

The default server listens on `http://localhost:8080` and uses `./data/shirone.db`.

## PostgreSQL

```powershell
$env:DB_DRIVER = "postgres"
$env:DATABASE_URL = "postgres://shirone:shirone@localhost:5432/shirone?sslmode=disable"
go run ./cmd/server
```

The server creates the development schema on startup. The initial schema covers users, sessions, documents, and comments. Authentication endpoints are available under `/api/v1/auth`; versioned production migrations and CMS endpoints will be added in subsequent phases.

Session tokens are sent only through an HttpOnly, SameSite=Lax cookie and are stored as SHA-256 hashes. Passwords are stored with Argon2id. Set `AUTH_COOKIE_SECURE=true` behind production HTTPS.

The first registered account is assigned the `admin` role so a fresh self-hosted instance can be initialized. Later registrations receive the `member` role. Published content is publicly readable under `/api/v1/content`; mutations under `/api/v1/admin/content` require an `editor` or `admin` session.

Approved comments are publicly readable below each published content item. Authenticated users can submit comments and replies; new comments start as `pending`. Editors and administrators can review and change moderation status under `/api/v1/admin/comments`.

Administrators can list accounts and change roles or account status under `/api/v1/admin/users`. The API prevents changing the last active administrator.

## PostgreSQL with Compose

```powershell
docker compose -f docker-compose.yml up -d postgres
$env:DB_DRIVER = "postgres"
$env:DATABASE_URL = "postgres://shirone:shirone@localhost:5432/shirone?sslmode=disable"
go run ./cmd/server
```

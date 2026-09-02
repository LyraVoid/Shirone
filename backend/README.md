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

The server creates the development schema on startup. The initial schema covers users, sessions, documents, and comments; versioned production migrations, authentication, and CMS endpoints will be added in subsequent phases.

## PostgreSQL with Compose

```powershell
docker compose -f docker-compose.yml up -d postgres
$env:DB_DRIVER = "postgres"
$env:DATABASE_URL = "postgres://shirone:shirone@localhost:5432/shirone?sslmode=disable"
go run ./cmd/server
```

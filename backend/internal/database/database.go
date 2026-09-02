package database

import (
	"database/sql"
	"fmt"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"

	"github.com/shirone-platform/backend/ent"
)

func Open(driver, dataSource string) (*sql.DB, *ent.Client, error) {
	sqlDriver, entDialect, err := resolveDriver(driver)
	if err != nil {
		return nil, nil, err
	}
	db, err := sql.Open(sqlDriver, dataSource)
	if err != nil {
		return nil, nil, fmt.Errorf("open database: %w", err)
	}
	client := ent.NewClient(ent.Driver(entsql.OpenDB(entDialect, db)))
	return db, client, nil
}

func resolveDriver(driver string) (string, string, error) {
	switch driver {
	case "sqlite":
		return "sqlite", dialect.SQLite, nil
	case "postgres":
		return "pgx", dialect.Postgres, nil
	default:
		return "", "", fmt.Errorf("unsupported database driver %q", driver)
	}
}

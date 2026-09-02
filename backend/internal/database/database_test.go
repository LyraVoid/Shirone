package database

import (
	"context"
	"os"
	"testing"
)

func TestOpenSQLite(t *testing.T) {
	db, client, err := Open("sqlite", "file:database_test?mode=memory&cache=shared&_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	if err := client.Schema.Create(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := db.PingContext(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestOpenPostgres(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_URL")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_URL is not configured")
	}
	db, client, err := Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	if err := client.Schema.Create(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := db.PingContext(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestRejectsUnsupportedDriver(t *testing.T) {
	if _, _, err := Open("mysql", "unused"); err == nil {
		t.Fatal("expected unsupported driver error")
	}
}

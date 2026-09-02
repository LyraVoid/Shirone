package database

import (
	"context"
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

func TestRejectsUnsupportedDriver(t *testing.T) {
	if _, _, err := Open("mysql", "unused"); err == nil {
		t.Fatal("expected unsupported driver error")
	}
}

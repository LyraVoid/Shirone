package config

import "testing"

func TestLoadDefaultsToSQLite(t *testing.T) {
	t.Setenv("DB_DRIVER", "")
	t.Setenv("DATABASE_URL", "")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Database.Driver != "sqlite" {
		t.Fatalf("driver = %q, want sqlite", cfg.Database.Driver)
	}
}

func TestLoadRejectsUnknownDriver(t *testing.T) {
	t.Setenv("DB_DRIVER", "mysql")
	if _, err := Load(); err == nil {
		t.Fatal("expected unknown driver error")
	}
}

func TestLoadAllowedOrigins(t *testing.T) {
	t.Setenv("HTTP_ALLOWED_ORIGINS", "https://site.example, https://admin.example")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.HTTP.AllowedOrigins) != 2 || cfg.HTTP.AllowedOrigins[1] != "https://admin.example" {
		t.Fatalf("origins = %#v", cfg.HTTP.AllowedOrigins)
	}
}

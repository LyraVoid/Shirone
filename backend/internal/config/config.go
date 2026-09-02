package config

import (
	"errors"
	"fmt"
	"os"
)

type Config struct {
	HTTP     HTTPConfig
	Database DatabaseConfig
}

type HTTPConfig struct{ Address string }

type DatabaseConfig struct {
	Driver string
	URL    string
}

func Load() (Config, error) {
	cfg := Config{
		HTTP: HTTPConfig{Address: env("HTTP_ADDRESS", ":8080")},
		Database: DatabaseConfig{
			Driver: env("DB_DRIVER", "sqlite"),
			URL:    env("DATABASE_URL", "file:./data/shirone.db?_fk=1"),
		},
	}
	if cfg.Database.Driver != "sqlite" && cfg.Database.Driver != "postgres" {
		return Config{}, fmt.Errorf("DB_DRIVER must be sqlite or postgres, got %q", cfg.Database.Driver)
	}
	if cfg.Database.URL == "" {
		return Config{}, errors.New("DATABASE_URL cannot be empty")
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

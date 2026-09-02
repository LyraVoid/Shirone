package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTP     HTTPConfig
	Database DatabaseConfig
	Auth     AuthConfig
	Storage  StorageConfig
}

type HTTPConfig struct {
	Address        string
	AllowedOrigins []string
}

type DatabaseConfig struct {
	Driver string
	URL    string
}

type AuthConfig struct {
	CookieName   string
	CookieSecure bool
	SessionTTL   time.Duration
}

type StorageConfig struct {
	LocalDirectory string
	MaxUploadBytes int64
}

func Load() (Config, error) {
	cfg := Config{
		HTTP: HTTPConfig{Address: env("HTTP_ADDRESS", ":8080"), AllowedOrigins: envList("HTTP_ALLOWED_ORIGINS")},
		Database: DatabaseConfig{
			Driver: env("DB_DRIVER", "sqlite"),
			URL:    env("DATABASE_URL", "file:./data/shirone.db?_pragma=foreign_keys(1)"),
		},
		Auth: AuthConfig{
			CookieName:   env("AUTH_COOKIE_NAME", "shirone_session"),
			CookieSecure: envBool("AUTH_COOKIE_SECURE", false),
			SessionTTL:   30 * 24 * time.Hour,
		},
		Storage: StorageConfig{
			LocalDirectory: env("STORAGE_LOCAL_DIR", "./data/media"),
			MaxUploadBytes: 20 << 20,
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

func envList(key string) []string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if value := strings.TrimSpace(part); value != "" {
			result = append(result, value)
		}
	}
	return result
}

func envBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

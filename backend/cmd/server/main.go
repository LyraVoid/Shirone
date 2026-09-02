package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/shirone-platform/backend/internal/config"
	"github.com/shirone-platform/backend/internal/database"
	"github.com/shirone-platform/backend/internal/httpapi"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("load configuration", "error", err)
		os.Exit(1)
	}
	if cfg.Database.Driver == "sqlite" {
		if err := os.MkdirAll("data", 0o755); err != nil {
			logger.Error("create sqlite directory", "error", err)
			os.Exit(1)
		}
	}

	db, entClient, err := database.Open(cfg.Database.Driver, cfg.Database.URL)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.PingContext(context.Background()); err != nil {
		logger.Error("connect database", "error", err)
		os.Exit(1)
	}
	defer entClient.Close()
	if err := entClient.Schema.Create(context.Background()); err != nil {
		logger.Error("apply schema", "error", err)
		os.Exit(1)
	}

	r := httpapi.NewRouter(db, entClient, httpapi.Options{CookieName: cfg.Auth.CookieName, CookieSecure: cfg.Auth.CookieSecure, SessionTTL: cfg.Auth.SessionTTL})

	server := &http.Server{Addr: cfg.HTTP.Address, Handler: r, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		logger.Info("shirone backend listening", "address", cfg.HTTP.Address, "database", cfg.Database.Driver)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server stopped", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("shutdown server", "error", err)
	}
}

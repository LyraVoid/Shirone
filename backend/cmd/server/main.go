package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"

	"github.com/shirone-platform/backend/ent"
	"github.com/shirone-platform/backend/internal/config"
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

	driver := cfg.Database.Driver
	if driver == "postgres" {
		driver = "pgx"
	}
	db, err := sql.Open(driver, cfg.Database.URL)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.PingContext(context.Background()); err != nil {
		logger.Error("connect database", "error", err)
		os.Exit(1)
	}
	entClient, err := ent.Open(driver, cfg.Database.URL)
	if err != nil {
		logger.Error("open ent client", "error", err)
		os.Exit(1)
	}
	defer entClient.Close()
	if err := entClient.Schema.Create(context.Background()); err != nil {
		logger.Error("apply schema", "error", err)
		os.Exit(1)
	}

	r := chi.NewRouter()
	r.Get("/api/v1/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	r.Get("/api/v1/ready", func(w http.ResponseWriter, r *http.Request) {
		if err := db.PingContext(r.Context()); err != nil {
			http.Error(w, `{"status":"not_ready"}`, http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	})

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

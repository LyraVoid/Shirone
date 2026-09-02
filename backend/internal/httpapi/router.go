package httpapi

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/shirone-platform/backend/ent"
	"github.com/shirone-platform/backend/internal/auth"
)

type Options struct {
	CookieName   string
	CookieSecure bool
	SessionTTL   time.Duration
}

func NewRouter(db *sql.DB, client *ent.Client, options Options) http.Handler {
	r := chi.NewRouter()
	r.Get("/api/v1/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Get("/api/v1/ready", func(w http.ResponseWriter, req *http.Request) {
		if err := db.PingContext(req.Context()); err != nil {
			writeError(w, http.StatusServiceUnavailable, "not_ready", "database is unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})

	authHandler := newAuthHandler(auth.NewService(client, options.SessionTTL), options)
	contentHandler := &contentHandler{client: client}
	commentHandler := &commentHandler{client: client}
	r.Route("/api/v1/auth", func(r chi.Router) {
		r.Post("/register", authHandler.register)
		r.Post("/login", authHandler.login)
		r.Post("/logout", authHandler.logout)
		r.Get("/me", authHandler.me)
	})
	r.Route("/api/v1/content", func(r chi.Router) {
		r.Get("/", contentHandler.list)
		r.Get("/{slug}", contentHandler.get)
		r.Get("/{slug}/comments", commentHandler.listPublic)
		r.With(authHandler.requireUser).Post("/{slug}/comments", commentHandler.create)
	})
	r.Route("/api/v1/admin/comments", func(r chi.Router) {
		r.Use(authHandler.requireUser)
		r.Use(requireEditor)
		r.Get("/", commentHandler.adminList)
		r.Put("/{id}", commentHandler.moderate)
	})
	r.Route("/api/v1/admin/content", func(r chi.Router) {
		r.Use(authHandler.requireUser)
		r.Use(requireEditor)
		r.Get("/", contentHandler.adminList)
		r.Get("/{id}", contentHandler.adminGet)
		r.Post("/", contentHandler.create)
		r.Put("/{id}", contentHandler.update)
		r.Delete("/{id}", contentHandler.delete)
	})
	return r
}

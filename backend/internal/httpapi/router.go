package httpapi

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/shirone-platform/backend/ent"
	"github.com/shirone-platform/backend/internal/auth"
	"github.com/shirone-platform/backend/internal/storage"
)

type Options struct {
	CookieName     string
	CookieSecure   bool
	SessionTTL     time.Duration
	AllowedOrigins []string
	MediaStore     storage.Store
	MaxUploadBytes int64
}

func NewRouter(db *sql.DB, client *ent.Client, options Options) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(securityHeaders)
	r.Use(originPolicy(options.AllowedOrigins))
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
	userHandler := &userHandler{client: client}
	taxonomyHandler := &taxonomyHandler{client: client}
	mediaHandler := &mediaHandler{client: client, store: options.MediaStore, maxUploadBytes: options.MaxUploadBytes}
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
	r.Route("/api/v1/admin/users", func(r chi.Router) {
		r.Use(authHandler.requireUser)
		r.Use(requireAdmin)
		r.Get("/", userHandler.list)
		r.Put("/{id}", userHandler.update)
	})
	r.Get("/api/v1/taxonomies", taxonomyHandler.list)
	r.Route("/api/v1/admin/taxonomies", func(r chi.Router) {
		r.Use(authHandler.requireUser)
		r.Use(requireEditor)
		r.Post("/", taxonomyHandler.createTaxonomy)
		r.Post("/{id}/terms", taxonomyHandler.createTerm)
	})
	r.Route("/api/v1/admin/content", func(r chi.Router) {
		r.Use(authHandler.requireUser)
		r.Use(requireEditor)
		r.Get("/", contentHandler.adminList)
		r.Get("/{id}", contentHandler.adminGet)
		r.Get("/{id}/revisions", contentHandler.revisions)
		r.Post("/", contentHandler.create)
		r.Put("/{id}", contentHandler.update)
		r.Delete("/{id}", contentHandler.delete)
	})
	if options.MediaStore != nil {
		r.Get("/api/v1/media/{key}", mediaHandler.serve)
		r.Route("/api/v1/admin/media", func(r chi.Router) {
			r.Use(authHandler.requireUser)
			r.Use(requireEditor)
			r.Get("/", mediaHandler.list)
			r.Post("/", mediaHandler.upload)
		})
	}
	return r
}

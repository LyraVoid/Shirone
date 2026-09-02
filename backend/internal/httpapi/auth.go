package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/shirone-platform/backend/ent"
	userent "github.com/shirone-platform/backend/ent/user"
	"github.com/shirone-platform/backend/internal/auth"
)

type authHandler struct {
	service *auth.Service
	options Options
}

type authRequest struct {
	Email       string `json:"email"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Identity    string `json:"identity"`
	Password    string `json:"password"`
}

func newAuthHandler(service *auth.Service, options Options) *authHandler {
	return &authHandler{service: service, options: options}
}

func (h *authHandler) register(w http.ResponseWriter, r *http.Request) {
	var input authRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	u, token, err := h.service.Register(r.Context(), input.Email, input.Username, input.DisplayName, input.Password)
	if err != nil {
		if errors.Is(err, auth.ErrIdentityExists) {
			writeError(w, http.StatusConflict, "identity_exists", err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, "registration_failed", err.Error())
		return
	}
	h.setCookie(w, token)
	writeJSON(w, http.StatusCreated, userResponse(u))
}

func (h *authHandler) login(w http.ResponseWriter, r *http.Request) {
	var input authRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	u, token, err := h.service.Login(r.Context(), input.Identity, input.Password)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "identity or password is incorrect")
		return
	}
	h.setCookie(w, token)
	writeJSON(w, http.StatusOK, userResponse(u))
}

func (h *authHandler) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(h.options.CookieName); err == nil {
		_ = h.service.Logout(r.Context(), cookie.Value)
	}
	h.clearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (h *authHandler) me(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.options.CookieName)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "authentication is required")
		return
	}
	u, err := h.service.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "authentication is required")
		return
	}
	writeJSON(w, http.StatusOK, userResponse(u))
}

type currentUserKey struct{}

func (h *authHandler) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(h.options.CookieName)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthenticated", "authentication is required")
			return
		}
		u, err := h.service.Authenticate(r.Context(), cookie.Value)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthenticated", "authentication is required")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), currentUserKey{}, u)))
	})
}

func requireEditor(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := r.Context().Value(currentUserKey{}).(*ent.User)
		if !ok || (u.Role != userent.RoleAdmin && u.Role != userent.RoleEditor) {
			writeError(w, http.StatusForbidden, "forbidden", "editor access is required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := r.Context().Value(currentUserKey{}).(*ent.User)
		if !ok || u.Role != userent.RoleAdmin {
			writeError(w, http.StatusForbidden, "forbidden", "administrator access is required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *authHandler) setCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{Name: h.options.CookieName, Value: token, Path: "/", HttpOnly: true, Secure: h.options.CookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: int(h.options.SessionTTL.Seconds())})
}

func (h *authHandler) clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: h.options.CookieName, Path: "/", HttpOnly: true, Secure: h.options.CookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: -1, Expires: time.Unix(1, 0)})
}

func userResponse(u *ent.User) map[string]any {
	return map[string]any{"id": u.ID, "email": u.Email, "username": u.Username, "displayName": u.DisplayName, "role": u.Role, "status": u.Status}
}

package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/shirone-platform/backend/ent"
	userent "github.com/shirone-platform/backend/ent/user"
)

type userHandler struct{ client *ent.Client }

type userUpdateInput struct {
	Role   string `json:"role"`
	Status string `json:"status"`
}

func (h *userHandler) list(w http.ResponseWriter, r *http.Request) {
	users, err := h.client.User.Query().Order(ent.Asc(userent.FieldCreatedAt)).Limit(queryLimit(r, 100)).All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user_query_failed", "users could not be loaded")
		return
	}
	items := make([]any, 0, len(users))
	for _, u := range users {
		items = append(items, userResponse(u))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *userHandler) update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid_id", "user id is invalid")
		return
	}
	var input userUpdateInput
	if !decodeJSON(w, r, &input) {
		return
	}
	role := userent.Role(input.Role)
	status := userent.Status(input.Status)
	if userent.RoleValidator(role) != nil || userent.StatusValidator(status) != nil {
		writeError(w, http.StatusBadRequest, "invalid_user_state", "role or status is invalid")
		return
	}
	target, err := h.client.User.Get(r.Context(), id)
	if err != nil {
		if ent.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "user_not_found", "user was not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "user_query_failed", "user could not be loaded")
		return
	}
	if target.Role == userent.RoleAdmin && target.Status == userent.StatusActive && (role != userent.RoleAdmin || status != userent.StatusActive) {
		activeAdmins, err := h.client.User.Query().Where(userent.RoleEQ(userent.RoleAdmin), userent.StatusEQ(userent.StatusActive)).Count(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "user_query_failed", "administrator count could not be checked")
			return
		}
		if activeAdmins == 1 {
			writeError(w, http.StatusConflict, "last_admin", "the last active administrator cannot be changed")
			return
		}
	}
	updated, err := target.Update().SetRole(role).SetStatus(status).SetUpdatedAt(time.Now().UTC()).Save(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user_update_failed", "user could not be updated")
		return
	}
	writeJSON(w, http.StatusOK, userResponse(updated))
}

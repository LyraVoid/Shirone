package httpapi

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/shirone-platform/backend/ent"
	"github.com/shirone-platform/backend/ent/document"
	"github.com/shirone-platform/backend/ent/documentrevision"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type contentHandler struct{ client *ent.Client }

type contentInput struct {
	Slug    string `json:"slug"`
	Title   string `json:"title"`
	Body    string `json:"body"`
	Excerpt string `json:"excerpt"`
	Status  string `json:"status"`
}

func (h *contentHandler) adminList(w http.ResponseWriter, r *http.Request) {
	documents, err := h.client.Document.Query().Order(ent.Desc(document.FieldUpdatedAt)).Limit(queryLimit(r, 50)).All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "content_query_failed", "content could not be loaded")
		return
	}
	items := make([]any, 0, len(documents))
	for _, doc := range documents {
		items = append(items, documentResponse(doc))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *contentHandler) adminGet(w http.ResponseWriter, r *http.Request) {
	id, ok := contentID(w, r)
	if !ok {
		return
	}
	doc, err := h.client.Document.Get(r.Context(), id)
	if err != nil {
		if ent.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "content_not_found", "content was not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "content_query_failed", "content could not be loaded")
		return
	}
	writeJSON(w, http.StatusOK, documentResponse(doc))
}

func (h *contentHandler) revisions(w http.ResponseWriter, r *http.Request) {
	id, ok := contentID(w, r)
	if !ok {
		return
	}
	if _, err := h.client.Document.Get(r.Context(), id); err != nil {
		if ent.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "content_not_found", "content was not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "content_query_failed", "content could not be loaded")
		return
	}
	revisions, err := h.client.DocumentRevision.Query().Where(documentrevision.HasDocumentWith(document.IDEQ(id))).WithEditor().Order(ent.Desc(documentrevision.FieldVersion)).All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "revision_query_failed", "revisions could not be loaded")
		return
	}
	items := make([]any, 0, len(revisions))
	for _, revision := range revisions {
		item := map[string]any{"id": revision.ID, "version": revision.Version, "slug": revision.Slug, "title": revision.Title, "body": revision.Body, "excerpt": revision.Excerpt, "status": revision.Status, "createdAt": revision.CreatedAt}
		if revision.Edges.Editor != nil {
			item["editor"] = map[string]any{"id": revision.Edges.Editor.ID, "username": revision.Edges.Editor.Username, "displayName": revision.Edges.Editor.DisplayName}
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *contentHandler) list(w http.ResponseWriter, r *http.Request) {
	limit := queryLimit(r, 20)
	documents, err := h.client.Document.Query().Where(document.StatusEQ(document.StatusPublished)).Order(ent.Desc(document.FieldPublishedAt)).Limit(limit).All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "content_query_failed", "content could not be loaded")
		return
	}
	items := make([]any, 0, len(documents))
	for _, doc := range documents {
		items = append(items, documentResponse(doc))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *contentHandler) get(w http.ResponseWriter, r *http.Request) {
	doc, err := h.client.Document.Query().Where(document.SlugEQ(chi.URLParam(r, "slug")), document.StatusEQ(document.StatusPublished)).Only(r.Context())
	if err != nil {
		if ent.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "content_not_found", "content was not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "content_query_failed", "content could not be loaded")
		return
	}
	writeJSON(w, http.StatusOK, documentResponse(doc))
}

func (h *contentHandler) create(w http.ResponseWriter, r *http.Request) {
	var input contentInput
	if !decodeJSON(w, r, &input) || !validateContentInput(w, input) {
		return
	}
	status := document.Status(input.Status)
	now := time.Now().UTC()
	u := r.Context().Value(currentUserKey{}).(*ent.User)
	tx, err := h.client.Tx(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction_failed", "content could not be created")
		return
	}
	create := tx.Document.Create().SetSlug(input.Slug).SetTitle(strings.TrimSpace(input.Title)).SetBody(input.Body).SetExcerpt(strings.TrimSpace(input.Excerpt)).SetStatus(status).SetAuthorID(u.ID).SetCreatedAt(now).SetUpdatedAt(now)
	if status == document.StatusPublished {
		create.SetPublishedAt(now)
	}
	doc, err := create.Save(r.Context())
	if err != nil {
		_ = tx.Rollback()
		if ent.IsConstraintError(err) {
			writeError(w, http.StatusConflict, "slug_exists", "slug already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "content_create_failed", "content could not be created")
		return
	}
	_, err = tx.DocumentRevision.Create().SetVersion(1).SetSlug(doc.Slug).SetTitle(doc.Title).SetBody(doc.Body).SetExcerpt(doc.Excerpt).SetStatus(documentrevision.Status(doc.Status)).SetCreatedAt(now).SetDocumentID(doc.ID).SetEditorID(u.ID).Save(r.Context())
	if err != nil {
		_ = tx.Rollback()
		writeError(w, http.StatusInternalServerError, "revision_create_failed", "content revision could not be created")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "transaction_failed", "content could not be created")
		return
	}
	writeJSON(w, http.StatusCreated, documentResponse(doc))
}

func (h *contentHandler) update(w http.ResponseWriter, r *http.Request) {
	id, ok := contentID(w, r)
	if !ok {
		return
	}
	var input contentInput
	if !decodeJSON(w, r, &input) || !validateContentInput(w, input) {
		return
	}
	tx, err := h.client.Tx(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction_failed", "content could not be updated")
		return
	}
	current, err := tx.Document.Get(r.Context(), id)
	if err != nil {
		_ = tx.Rollback()
		if ent.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "content_not_found", "content was not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "content_query_failed", "content could not be loaded")
		return
	}
	status := document.Status(input.Status)
	update := current.Update().SetSlug(input.Slug).SetTitle(strings.TrimSpace(input.Title)).SetBody(input.Body).SetExcerpt(strings.TrimSpace(input.Excerpt)).SetStatus(status).SetUpdatedAt(time.Now().UTC())
	if status == document.StatusPublished && current.PublishedAt == nil {
		update.SetPublishedAt(time.Now().UTC())
	}
	if status != document.StatusPublished {
		update.ClearPublishedAt()
	}
	doc, err := update.Save(r.Context())
	if err != nil {
		_ = tx.Rollback()
		if ent.IsConstraintError(err) {
			writeError(w, http.StatusConflict, "slug_exists", "slug already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "content_update_failed", "content could not be updated")
		return
	}
	version, err := tx.DocumentRevision.Query().Where(documentrevision.HasDocumentWith(document.IDEQ(id))).Count(r.Context())
	if err == nil {
		u := r.Context().Value(currentUserKey{}).(*ent.User)
		_, err = tx.DocumentRevision.Create().SetVersion(version + 1).SetSlug(doc.Slug).SetTitle(doc.Title).SetBody(doc.Body).SetExcerpt(doc.Excerpt).SetStatus(documentrevision.Status(doc.Status)).SetCreatedAt(time.Now().UTC()).SetDocumentID(doc.ID).SetEditorID(u.ID).Save(r.Context())
	}
	if err != nil {
		_ = tx.Rollback()
		writeError(w, http.StatusInternalServerError, "revision_create_failed", "content revision could not be created")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "transaction_failed", "content could not be updated")
		return
	}
	writeJSON(w, http.StatusOK, documentResponse(doc))
}

func (h *contentHandler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := contentID(w, r)
	if !ok {
		return
	}
	tx, err := h.client.Tx(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction_failed", "content could not be archived")
		return
	}
	current, err := tx.Document.Get(r.Context(), id)
	if err != nil {
		_ = tx.Rollback()
		if ent.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "content_not_found", "content was not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "content_query_failed", "content could not be loaded")
		return
	}
	now := time.Now().UTC()
	archived, err := current.Update().SetStatus(document.StatusArchived).ClearPublishedAt().SetUpdatedAt(now).Save(r.Context())
	if err != nil {
		_ = tx.Rollback()
		writeError(w, http.StatusInternalServerError, "content_archive_failed", "content could not be archived")
		return
	}
	version, err := tx.DocumentRevision.Query().Where(documentrevision.HasDocumentWith(document.IDEQ(id))).Count(r.Context())
	if err == nil {
		u := r.Context().Value(currentUserKey{}).(*ent.User)
		_, err = tx.DocumentRevision.Create().SetVersion(version + 1).SetSlug(archived.Slug).SetTitle(archived.Title).SetBody(archived.Body).SetExcerpt(archived.Excerpt).SetStatus(documentrevision.StatusArchived).SetCreatedAt(now).SetDocumentID(archived.ID).SetEditorID(u.ID).Save(r.Context())
	}
	if err != nil {
		_ = tx.Rollback()
		writeError(w, http.StatusInternalServerError, "revision_create_failed", "archive revision could not be created")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "transaction_failed", "content could not be archived")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func contentID(w http.ResponseWriter, r *http.Request) (int, bool) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid_id", "content id is invalid")
		return 0, false
	}
	return id, true
}

func validateContentInput(w http.ResponseWriter, input contentInput) bool {
	if !slugPattern.MatchString(input.Slug) || strings.TrimSpace(input.Title) == "" || strings.TrimSpace(input.Body) == "" {
		writeError(w, http.StatusBadRequest, "invalid_content", "slug, title, and body are required")
		return false
	}
	if err := document.StatusValidator(document.Status(input.Status)); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_status", "status must be draft, published, or archived")
		return false
	}
	return true
}

func documentResponse(doc *ent.Document) map[string]any {
	return map[string]any{"id": doc.ID, "slug": doc.Slug, "title": doc.Title, "body": doc.Body, "excerpt": doc.Excerpt, "status": doc.Status, "publishedAt": doc.PublishedAt, "createdAt": doc.CreatedAt, "updatedAt": doc.UpdatedAt}
}

func queryLimit(r *http.Request, fallback int) int {
	limit, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil || limit < 1 {
		return fallback
	}
	if limit > 100 {
		return 100
	}
	return limit
}

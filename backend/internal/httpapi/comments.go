package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/shirone-platform/backend/ent"
	commentent "github.com/shirone-platform/backend/ent/comment"
	"github.com/shirone-platform/backend/ent/document"
)

type commentHandler struct{ client *ent.Client }

type commentInput struct {
	Body     string `json:"body"`
	ParentID *int   `json:"parentId"`
}

type moderationInput struct {
	Status string `json:"status"`
}

func (h *commentHandler) listPublic(w http.ResponseWriter, r *http.Request) {
	doc, err := h.publishedDocument(r)
	if err != nil {
		writeError(w, http.StatusNotFound, "content_not_found", "content was not found")
		return
	}
	comments, err := h.client.Comment.Query().
		Where(commentent.StatusEQ(commentent.StatusApproved), commentent.HasDocumentWith(document.IDEQ(doc.ID))).
		WithAuthor().WithParent().Order(ent.Asc(commentent.FieldCreatedAt)).Limit(queryLimit(r, 100)).All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "comment_query_failed", "comments could not be loaded")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": commentResponses(comments)})
}

func (h *commentHandler) create(w http.ResponseWriter, r *http.Request) {
	doc, err := h.publishedDocument(r)
	if err != nil {
		writeError(w, http.StatusNotFound, "content_not_found", "content was not found")
		return
	}
	var input commentInput
	if !decodeJSON(w, r, &input) {
		return
	}
	body := strings.TrimSpace(input.Body)
	if body == "" || len([]rune(body)) > 5000 {
		writeError(w, http.StatusBadRequest, "invalid_comment", "comment body must contain 1 to 5000 characters")
		return
	}
	create := h.client.Comment.Create().SetBody(body).SetAuthor(r.Context().Value(currentUserKey{}).(*ent.User)).SetDocument(doc)
	if input.ParentID != nil {
		parent, err := h.client.Comment.Query().Where(commentent.IDEQ(*input.ParentID), commentent.HasDocumentWith(document.IDEQ(doc.ID))).Only(r.Context())
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_parent", "parent comment does not belong to this content")
			return
		}
		create.SetParent(parent)
	}
	now := time.Now().UTC()
	created, err := create.SetCreatedAt(now).SetUpdatedAt(now).Save(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "comment_create_failed", "comment could not be created")
		return
	}
	created, err = h.client.Comment.Query().Where(commentent.IDEQ(created.ID)).WithAuthor().WithParent().Only(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "comment_query_failed", "comment could not be loaded")
		return
	}
	writeJSON(w, http.StatusCreated, commentResponse(created))
}

func (h *commentHandler) adminList(w http.ResponseWriter, r *http.Request) {
	status := commentent.Status(r.URL.Query().Get("status"))
	query := h.client.Comment.Query().WithAuthor().WithParent().WithDocument().Order(ent.Desc(commentent.FieldCreatedAt)).Limit(queryLimit(r, 100))
	if status != "" {
		if err := commentent.StatusValidator(status); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_status", "comment status is invalid")
			return
		}
		query.Where(commentent.StatusEQ(status))
	}
	comments, err := query.All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "comment_query_failed", "comments could not be loaded")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": commentResponses(comments)})
}

func (h *commentHandler) moderate(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid_id", "comment id is invalid")
		return
	}
	var input moderationInput
	if !decodeJSON(w, r, &input) {
		return
	}
	status := commentent.Status(input.Status)
	if err := commentent.StatusValidator(status); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_status", "comment status is invalid")
		return
	}
	updated, err := h.client.Comment.UpdateOneID(id).SetStatus(status).SetUpdatedAt(time.Now().UTC()).Save(r.Context())
	if err != nil {
		if ent.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "comment_not_found", "comment was not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "comment_update_failed", "comment could not be updated")
		return
	}
	writeJSON(w, http.StatusOK, commentResponse(updated))
}

func (h *commentHandler) publishedDocument(r *http.Request) (*ent.Document, error) {
	return h.client.Document.Query().Where(document.SlugEQ(chi.URLParam(r, "slug")), document.StatusEQ(document.StatusPublished)).Only(r.Context())
}

func commentResponses(comments []*ent.Comment) []any {
	items := make([]any, 0, len(comments))
	for _, item := range comments {
		items = append(items, commentResponse(item))
	}
	return items
}

func commentResponse(item *ent.Comment) map[string]any {
	result := map[string]any{"id": item.ID, "body": item.Body, "status": item.Status, "createdAt": item.CreatedAt, "updatedAt": item.UpdatedAt}
	if item.Edges.Author != nil {
		result["author"] = map[string]any{"id": item.Edges.Author.ID, "username": item.Edges.Author.Username, "displayName": item.Edges.Author.DisplayName}
	}
	if item.Edges.Parent != nil {
		result["parentId"] = item.Edges.Parent.ID
	}
	if item.Edges.Document != nil {
		result["document"] = map[string]any{"id": item.Edges.Document.ID, "slug": item.Edges.Document.Slug, "title": item.Edges.Document.Title}
	}
	return result
}

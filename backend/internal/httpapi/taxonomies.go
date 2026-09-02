package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/shirone-platform/backend/ent"
	"github.com/shirone-platform/backend/ent/taxonomy"
)

type taxonomyHandler struct{ client *ent.Client }

type taxonomyInput struct {
	Key         string `json:"key"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type termInput struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

func (h *taxonomyHandler) list(w http.ResponseWriter, r *http.Request) {
	items, err := h.client.Taxonomy.Query().WithTerms().Order(ent.Asc(taxonomy.FieldName)).All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "taxonomy_query_failed", "taxonomies could not be loaded")
		return
	}
	result := make([]any, 0, len(items))
	for _, item := range items {
		terms := make([]any, 0, len(item.Edges.Terms))
		for _, child := range item.Edges.Terms {
			terms = append(terms, termResponse(child))
		}
		result = append(result, map[string]any{"id": item.ID, "key": item.Key, "name": item.Name, "description": item.Description, "terms": terms})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": result})
}

func (h *taxonomyHandler) createTaxonomy(w http.ResponseWriter, r *http.Request) {
	var input taxonomyInput
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Key = strings.ToLower(strings.TrimSpace(input.Key))
	if !slugPattern.MatchString(input.Key) || strings.TrimSpace(input.Name) == "" {
		writeError(w, http.StatusBadRequest, "invalid_taxonomy", "key and name are required")
		return
	}
	now := time.Now().UTC()
	created, err := h.client.Taxonomy.Create().SetKey(input.Key).SetName(strings.TrimSpace(input.Name)).SetDescription(strings.TrimSpace(input.Description)).SetCreatedAt(now).SetUpdatedAt(now).Save(r.Context())
	if err != nil {
		if ent.IsConstraintError(err) {
			writeError(w, http.StatusConflict, "taxonomy_exists", "taxonomy key already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "taxonomy_create_failed", "taxonomy could not be created")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": created.ID, "key": created.Key, "name": created.Name, "description": created.Description})
}

func (h *taxonomyHandler) createTerm(w http.ResponseWriter, r *http.Request) {
	taxonomyID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || taxonomyID < 1 {
		writeError(w, http.StatusBadRequest, "invalid_id", "taxonomy id is invalid")
		return
	}
	parent, err := h.client.Taxonomy.Get(r.Context(), taxonomyID)
	if err != nil {
		if ent.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "taxonomy_not_found", "taxonomy was not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "taxonomy_query_failed", "taxonomy could not be loaded")
		return
	}
	var input termInput
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Slug = strings.ToLower(strings.TrimSpace(input.Slug))
	if !slugPattern.MatchString(input.Slug) || strings.TrimSpace(input.Name) == "" {
		writeError(w, http.StatusBadRequest, "invalid_term", "slug and name are required")
		return
	}
	now := time.Now().UTC()
	created, err := h.client.Term.Create().SetSlug(input.Slug).SetName(strings.TrimSpace(input.Name)).SetDescription(strings.TrimSpace(input.Description)).SetTaxonomy(parent).SetCreatedAt(now).SetUpdatedAt(now).Save(r.Context())
	if err != nil {
		if ent.IsConstraintError(err) {
			writeError(w, http.StatusConflict, "term_exists", "term slug already exists in this taxonomy")
			return
		}
		writeError(w, http.StatusInternalServerError, "term_create_failed", "term could not be created")
		return
	}
	writeJSON(w, http.StatusCreated, termResponse(created))
}

func termResponse(item *ent.Term) map[string]any {
	return map[string]any{"id": item.ID, "slug": item.Slug, "name": item.Name, "description": item.Description}
}

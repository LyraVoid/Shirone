package httpapi

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTaxonomyTermsAttachToContent(t *testing.T) {
	router := testRouter(t)
	admin := registerAccount(t, router, "admin@example.com", "admin")

	createTaxonomy := httptest.NewRequest(http.MethodPost, "/api/v1/admin/taxonomies/", bytes.NewBufferString(`{"key":"topics","name":"Topics"}`))
	createTaxonomy.AddCookie(admin)
	taxonomyResponse := httptest.NewRecorder()
	router.ServeHTTP(taxonomyResponse, createTaxonomy)
	if taxonomyResponse.Code != http.StatusCreated {
		t.Fatalf("taxonomy status = %d, body = %s", taxonomyResponse.Code, taxonomyResponse.Body.String())
	}

	createTerm := httptest.NewRequest(http.MethodPost, "/api/v1/admin/taxonomies/1/terms", bytes.NewBufferString(`{"slug":"engineering","name":"Engineering"}`))
	createTerm.AddCookie(admin)
	termResponse := httptest.NewRecorder()
	router.ServeHTTP(termResponse, createTerm)
	if termResponse.Code != http.StatusCreated {
		t.Fatalf("term status = %d, body = %s", termResponse.Code, termResponse.Body.String())
	}

	createContent := httptest.NewRequest(http.MethodPost, "/api/v1/admin/content/", bytes.NewBufferString(`{"slug":"typed-content","title":"Typed","body":"Body","status":"published","termIds":[1]}`))
	createContent.AddCookie(admin)
	contentResponse := httptest.NewRecorder()
	router.ServeHTTP(contentResponse, createContent)
	if contentResponse.Code != http.StatusCreated || !bytes.Contains(contentResponse.Body.Bytes(), []byte(`"slug":"engineering"`)) {
		t.Fatalf("content status = %d, body = %s", contentResponse.Code, contentResponse.Body.String())
	}

	publicTaxonomies := httptest.NewRecorder()
	router.ServeHTTP(publicTaxonomies, httptest.NewRequest(http.MethodGet, "/api/v1/taxonomies", nil))
	if publicTaxonomies.Code != http.StatusOK || !bytes.Contains(publicTaxonomies.Body.Bytes(), []byte(`"key":"topics"`)) {
		t.Fatalf("taxonomy list status = %d, body = %s", publicTaxonomies.Code, publicTaxonomies.Body.String())
	}
}

func TestContentRejectsUnknownTerms(t *testing.T) {
	router := testRouter(t)
	admin := registerAccount(t, router, "admin@example.com", "admin")
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/content/", bytes.NewBufferString(`{"slug":"bad-term","title":"Bad","body":"Body","status":"published","termIds":[999]}`))
	request.AddCookie(admin)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("unknown term status = %d, body = %s", response.Code, response.Body.String())
	}
}

package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPublishedContentLifecycle(t *testing.T) {
	router := testRouter(t)
	cookie := registerAccount(t, router, "admin@example.com", "admin")

	create := httptest.NewRequest(http.MethodPost, "/api/v1/admin/content/", bytes.NewBufferString(`{"kind":"post","slug":"hello-world","title":"Hello World","body":"First version","excerpt":"Intro","status":"published","metadata":{"lang":"en","image":"/cover.webp"}}`))
	create.AddCookie(cookie)
	created := httptest.NewRecorder()
	router.ServeHTTP(created, create)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", created.Code, created.Body.String())
	}

	get := httptest.NewRequest(http.MethodGet, "/api/v1/content/hello-world", nil)
	got := httptest.NewRecorder()
	router.ServeHTTP(got, get)
	if got.Code != http.StatusOK || !bytes.Contains(got.Body.Bytes(), []byte(`"body":"First version"`)) || !bytes.Contains(got.Body.Bytes(), []byte(`"lang":"en"`)) {
		t.Fatalf("get status = %d, body = %s", got.Code, got.Body.String())
	}

	list := httptest.NewRequest(http.MethodGet, "/api/v1/content/", nil)
	listed := httptest.NewRecorder()
	router.ServeHTTP(listed, list)
	if listed.Code != http.StatusOK || !bytes.Contains(listed.Body.Bytes(), []byte(`"slug":"hello-world"`)) {
		t.Fatalf("list status = %d, body = %s", listed.Code, listed.Body.String())
	}

	update := httptest.NewRequest(http.MethodPut, "/api/v1/admin/content/1", bytes.NewBufferString(`{"slug":"hello-world","title":"Hello World","body":"Draft version","excerpt":"Intro","status":"draft"}`))
	update.AddCookie(cookie)
	updated := httptest.NewRecorder()
	router.ServeHTTP(updated, update)
	if updated.Code != http.StatusOK {
		t.Fatalf("update status = %d, body = %s", updated.Code, updated.Body.String())
	}

	hidden := httptest.NewRecorder()
	router.ServeHTTP(hidden, get)
	if hidden.Code != http.StatusNotFound {
		t.Fatalf("draft public status = %d", hidden.Code)
	}

	adminList := httptest.NewRequest(http.MethodGet, "/api/v1/admin/content/", nil)
	adminList.AddCookie(cookie)
	adminListed := httptest.NewRecorder()
	router.ServeHTTP(adminListed, adminList)
	if adminListed.Code != http.StatusOK || !bytes.Contains(adminListed.Body.Bytes(), []byte(`"status":"draft"`)) {
		t.Fatalf("admin list status = %d, body = %s", adminListed.Code, adminListed.Body.String())
	}

	revisions := httptest.NewRequest(http.MethodGet, "/api/v1/admin/content/1/revisions", nil)
	revisions.AddCookie(cookie)
	revisionList := httptest.NewRecorder()
	router.ServeHTTP(revisionList, revisions)
	if revisionList.Code != http.StatusOK || !bytes.Contains(revisionList.Body.Bytes(), []byte(`"version":2`)) || !bytes.Contains(revisionList.Body.Bytes(), []byte(`"version":1`)) {
		t.Fatalf("revisions status = %d, body = %s", revisionList.Code, revisionList.Body.String())
	}

	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/content/1", nil)
	deleteRequest.AddCookie(cookie)
	deleted := httptest.NewRecorder()
	router.ServeHTTP(deleted, deleteRequest)
	if deleted.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d, body = %s", deleted.Code, deleted.Body.String())
	}
}

func TestMemberCannotCreateContent(t *testing.T) {
	router := testRouter(t)
	_ = registerAccount(t, router, "admin@example.com", "admin")
	memberCookie := registerAccount(t, router, "member@example.com", "member")
	create := httptest.NewRequest(http.MethodPost, "/api/v1/admin/content/", bytes.NewBufferString(`{"slug":"blocked","title":"Blocked","body":"No access","status":"published"}`))
	create.AddCookie(memberCookie)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, create)
	if response.Code != http.StatusForbidden {
		t.Fatalf("member create status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestPublishedContentListSupportsKindPagination(t *testing.T) {
	router := testRouter(t)
	cookie := registerAccount(t, router, "admin@example.com", "admin")
	for _, body := range []string{
		`{"kind":"post","slug":"first-post","title":"First","body":"First body","status":"published"}`,
		`{"kind":"page","slug":"about-page","title":"About","body":"About body","status":"published"}`,
		`{"kind":"post","slug":"second-post","title":"Second","body":"Second body","status":"published"}`,
	} {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/content/", bytes.NewBufferString(body))
		request.AddCookie(cookie)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != http.StatusCreated {
			t.Fatalf("create status = %d, body = %s", response.Code, response.Body.String())
		}
	}

	request := httptest.NewRequest(http.MethodGet, "/api/v1/content/?kind=post&limit=1&offset=1", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", response.Code, response.Body.String())
	}
	var payload struct {
		Items  []map[string]any `json:"items"`
		Limit  int              `json:"limit"`
		Offset int              `json:"offset"`
		Total  int              `json:"total"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(payload.Items) != 1 || payload.Items[0]["kind"] != "post" {
		t.Fatalf("items = %#v", payload.Items)
	}
	if payload.Limit != 1 || payload.Offset != 1 || payload.Total != 2 {
		t.Fatalf("pagination = limit %d, offset %d, total %d", payload.Limit, payload.Offset, payload.Total)
	}
}

func registerAccount(t *testing.T, router http.Handler, email, username string) *http.Cookie {
	t.Helper()
	body := []byte(`{"email":"` + email + `","username":"` + username + `","displayName":"Test User","password":"long-enough-password"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(body))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("register status = %d, body = %s", response.Code, response.Body.String())
	}
	return response.Result().Cookies()[0]
}

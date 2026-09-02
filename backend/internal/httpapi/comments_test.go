package httpapi

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCommentModerationLifecycle(t *testing.T) {
	router := testRouter(t)
	admin := registerAccount(t, router, "admin@example.com", "admin")
	member := registerAccount(t, router, "member@example.com", "member")
	createPublishedContent(t, router, admin, "commented-post")

	create := httptest.NewRequest(http.MethodPost, "/api/v1/content/commented-post/comments", bytes.NewBufferString(`{"body":"Awaiting review"}`))
	create.AddCookie(member)
	created := httptest.NewRecorder()
	router.ServeHTTP(created, create)
	if created.Code != http.StatusCreated || !bytes.Contains(created.Body.Bytes(), []byte(`"status":"pending"`)) {
		t.Fatalf("create comment status = %d, body = %s", created.Code, created.Body.String())
	}

	publicBefore := httptest.NewRecorder()
	router.ServeHTTP(publicBefore, httptest.NewRequest(http.MethodGet, "/api/v1/content/commented-post/comments", nil))
	if publicBefore.Code != http.StatusOK || bytes.Contains(publicBefore.Body.Bytes(), []byte("Awaiting review")) {
		t.Fatalf("pending comment leaked publicly: %s", publicBefore.Body.String())
	}

	moderate := httptest.NewRequest(http.MethodPut, "/api/v1/admin/comments/1", bytes.NewBufferString(`{"status":"approved"}`))
	moderate.AddCookie(admin)
	moderated := httptest.NewRecorder()
	router.ServeHTTP(moderated, moderate)
	if moderated.Code != http.StatusOK {
		t.Fatalf("moderate status = %d, body = %s", moderated.Code, moderated.Body.String())
	}

	publicAfter := httptest.NewRecorder()
	router.ServeHTTP(publicAfter, httptest.NewRequest(http.MethodGet, "/api/v1/content/commented-post/comments", nil))
	if publicAfter.Code != http.StatusOK || !bytes.Contains(publicAfter.Body.Bytes(), []byte("Awaiting review")) {
		t.Fatalf("approved comment missing: %s", publicAfter.Body.String())
	}
}

func TestReplyMustBelongToSameDocument(t *testing.T) {
	router := testRouter(t)
	admin := registerAccount(t, router, "admin@example.com", "admin")
	member := registerAccount(t, router, "member@example.com", "member")
	createPublishedContent(t, router, admin, "first-post")
	createPublishedContent(t, router, admin, "second-post")

	parent := httptest.NewRequest(http.MethodPost, "/api/v1/content/first-post/comments", bytes.NewBufferString(`{"body":"Parent"}`))
	parent.AddCookie(member)
	router.ServeHTTP(httptest.NewRecorder(), parent)

	reply := httptest.NewRequest(http.MethodPost, "/api/v1/content/second-post/comments", bytes.NewBufferString(`{"body":"Wrong document","parentId":1}`))
	reply.AddCookie(member)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, reply)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("cross-document reply status = %d, body = %s", response.Code, response.Body.String())
	}
}

func createPublishedContent(t *testing.T, router http.Handler, cookie *http.Cookie, slug string) {
	t.Helper()
	body := []byte(`{"slug":"` + slug + `","title":"Test","body":"Body","status":"published"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/content/", bytes.NewReader(body))
	request.AddCookie(cookie)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("create content status = %d, body = %s", response.Code, response.Body.String())
	}
}

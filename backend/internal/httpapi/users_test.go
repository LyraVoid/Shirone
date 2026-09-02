package httpapi

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdminManagesUsers(t *testing.T) {
	router := testRouter(t)
	admin := registerAccount(t, router, "admin@example.com", "admin")
	member := registerAccount(t, router, "member@example.com", "member")

	list := httptest.NewRequest(http.MethodGet, "/api/v1/admin/users/", nil)
	list.AddCookie(admin)
	listed := httptest.NewRecorder()
	router.ServeHTTP(listed, list)
	if listed.Code != http.StatusOK || !bytes.Contains(listed.Body.Bytes(), []byte("member@example.com")) {
		t.Fatalf("user list status = %d, body = %s", listed.Code, listed.Body.String())
	}

	promote := httptest.NewRequest(http.MethodPut, "/api/v1/admin/users/2", bytes.NewBufferString(`{"role":"editor","status":"active"}`))
	promote.AddCookie(admin)
	promoted := httptest.NewRecorder()
	router.ServeHTTP(promoted, promote)
	if promoted.Code != http.StatusOK || !bytes.Contains(promoted.Body.Bytes(), []byte(`"role":"editor"`)) {
		t.Fatalf("promote status = %d, body = %s", promoted.Code, promoted.Body.String())
	}

	memberList := httptest.NewRequest(http.MethodGet, "/api/v1/admin/users/", nil)
	memberList.AddCookie(member)
	forbidden := httptest.NewRecorder()
	router.ServeHTTP(forbidden, memberList)
	if forbidden.Code != http.StatusForbidden {
		t.Fatalf("member list status = %d", forbidden.Code)
	}
}

func TestCannotDemoteLastActiveAdmin(t *testing.T) {
	router := testRouter(t)
	admin := registerAccount(t, router, "admin@example.com", "admin")
	demote := httptest.NewRequest(http.MethodPut, "/api/v1/admin/users/1", bytes.NewBufferString(`{"role":"member","status":"active"}`))
	demote.AddCookie(admin)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, demote)
	if response.Code != http.StatusConflict || !bytes.Contains(response.Body.Bytes(), []byte("last_admin")) {
		t.Fatalf("demote status = %d, body = %s", response.Code, response.Body.String())
	}
}

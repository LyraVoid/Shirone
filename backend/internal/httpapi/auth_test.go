package httpapi

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/shirone-platform/backend/internal/database"
)

func TestAuthLifecycle(t *testing.T) {
	router := testRouter(t)

	register := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewBufferString(`{"email":"Reader@Example.com","username":"Reader","displayName":"Reader One","password":"long-enough-password"}`))
	register.Header.Set("Content-Type", "application/json")
	registered := httptest.NewRecorder()
	router.ServeHTTP(registered, register)
	if registered.Code != http.StatusCreated {
		t.Fatalf("register status = %d, body = %s", registered.Code, registered.Body.String())
	}
	cookies := registered.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatalf("unexpected session cookie: %#v", cookies)
	}

	me := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	me.AddCookie(cookies[0])
	current := httptest.NewRecorder()
	router.ServeHTTP(current, me)
	if current.Code != http.StatusOK || !bytes.Contains(current.Body.Bytes(), []byte(`"username":"reader"`)) {
		t.Fatalf("me status = %d, body = %s", current.Code, current.Body.String())
	}

	logout := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	logout.AddCookie(cookies[0])
	loggedOut := httptest.NewRecorder()
	router.ServeHTTP(loggedOut, logout)
	if loggedOut.Code != http.StatusNoContent {
		t.Fatalf("logout status = %d", loggedOut.Code)
	}

	meAgain := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	meAgain.AddCookie(cookies[0])
	unauthorized := httptest.NewRecorder()
	router.ServeHTTP(unauthorized, meAgain)
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("me after logout status = %d", unauthorized.Code)
	}
}

func TestLoginRejectsWrongPassword(t *testing.T) {
	router := testRouter(t)
	register := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewBufferString(`{"email":"reader@example.com","username":"reader","displayName":"Reader","password":"long-enough-password"}`))
	router.ServeHTTP(httptest.NewRecorder(), register)

	login := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString(`{"identity":"reader","password":"incorrect-password"}`))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, login)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("login status = %d, body = %s", response.Code, response.Body.String())
	}
}

func testRouter(t *testing.T) http.Handler {
	t.Helper()
	dsn := "file:" + t.Name() + "?mode=memory&cache=shared&_pragma=foreign_keys(1)"
	db, client, err := database.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := client.Schema.Create(context.Background()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = client.Close()
		_ = db.Close()
	})
	return NewRouter(db, client, Options{CookieName: "shirone_session", SessionTTL: time.Hour})
}

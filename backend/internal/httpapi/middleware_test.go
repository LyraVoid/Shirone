package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOriginPolicy(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	handler := originPolicy([]string{"https://admin.example.com"})(next)

	allowed := httptest.NewRequest(http.MethodPost, "http://api.example.com/resource", nil)
	allowed.Header.Set("Origin", "https://admin.example.com")
	allowedResponse := httptest.NewRecorder()
	handler.ServeHTTP(allowedResponse, allowed)
	if allowedResponse.Code != http.StatusOK || allowedResponse.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatalf("allowed origin status = %d", allowedResponse.Code)
	}

	blocked := httptest.NewRequest(http.MethodPost, "http://api.example.com/resource", nil)
	blocked.Header.Set("Origin", "https://attacker.example")
	blockedResponse := httptest.NewRecorder()
	handler.ServeHTTP(blockedResponse, blocked)
	if blockedResponse.Code != http.StatusForbidden {
		t.Fatalf("blocked origin status = %d", blockedResponse.Code)
	}
}

func TestSameOriginAllowedByDefault(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	handler := originPolicy(nil)(next)
	request := httptest.NewRequest(http.MethodPost, "https://site.example/resource", nil)
	request.Header.Set("Origin", "https://site.example")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("same origin status = %d", response.Code)
	}
}

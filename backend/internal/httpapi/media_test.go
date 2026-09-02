package httpapi

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMediaUploadAndServe(t *testing.T) {
	router := testRouter(t)
	admin := registerAccount(t, router, "admin@example.com", "admin")
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "pixel.png")
	if err != nil {
		t.Fatal(err)
	}
	png := append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 504)...)
	if _, err := part.Write(png); err != nil {
		t.Fatal(err)
	}
	_ = writer.WriteField("altText", "Pixel")
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/media/", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.AddCookie(admin)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("upload status = %d, body = %s", response.Code, response.Body.String())
	}
	var payload struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil || payload.URL == "" {
		t.Fatalf("upload response = %s, err = %v", response.Body.String(), err)
	}

	served := httptest.NewRecorder()
	router.ServeHTTP(served, httptest.NewRequest(http.MethodGet, payload.URL, nil))
	if served.Code != http.StatusOK || served.Header().Get("Content-Type") != "image/png" || !bytes.Equal(served.Body.Bytes(), png) {
		t.Fatalf("serve status = %d, type = %s, size = %d", served.Code, served.Header().Get("Content-Type"), served.Body.Len())
	}
}

func TestMediaUploadRejectsUnsupportedType(t *testing.T) {
	router := testRouter(t)
	admin := registerAccount(t, router, "admin@example.com", "admin")
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, _ := writer.CreateFormFile("file", "page.html")
	_, _ = part.Write([]byte("<!doctype html><script>alert(1)</script>"))
	_ = writer.Close()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/media/", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.AddCookie(admin)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("unsupported upload status = %d, body = %s", response.Code, response.Body.String())
	}
}

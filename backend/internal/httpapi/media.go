package httpapi

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/shirone-platform/backend/ent"
	"github.com/shirone-platform/backend/ent/mediaasset"
	"github.com/shirone-platform/backend/internal/storage"
)

type mediaHandler struct {
	client         *ent.Client
	store          storage.Store
	maxUploadBytes int64
}

var allowedMediaTypes = map[string]struct{}{
	"image/jpeg": {}, "image/png": {}, "image/gif": {}, "image/webp": {},
	"application/pdf": {}, "text/plain; charset=utf-8": {},
}

func (h *mediaHandler) upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, h.maxUploadBytes+(1<<20))
	if err := r.ParseMultipartForm(h.maxUploadBytes); err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "upload_too_large", "uploaded file is too large")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file_required", "multipart field file is required")
		return
	}
	defer file.Close()
	prefix, source, mimeType, ok := inspectUpload(w, file)
	if !ok {
		return
	}
	hash := sha256.New()
	object, err := h.store.Put(r.Context(), strings.ToLower(filepath.Ext(header.Filename)), io.TeeReader(io.MultiReader(bytes.NewReader(prefix), source), hash))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "upload_failed", "file could not be stored")
		return
	}
	owner := r.Context().Value(currentUserKey{}).(*ent.User)
	asset, err := h.client.MediaAsset.Create().SetKey(object.Key).SetOriginalName(filepath.Base(header.Filename)).SetMimeType(mimeType).SetSize(object.Size).SetChecksum(hex.EncodeToString(hash.Sum(nil))).SetAltText(strings.TrimSpace(r.FormValue("altText"))).SetCreatedAt(time.Now().UTC()).SetOwner(owner).Save(r.Context())
	if err != nil {
		_ = h.store.Delete(r.Context(), object.Key)
		writeError(w, http.StatusInternalServerError, "media_create_failed", "media metadata could not be saved")
		return
	}
	writeJSON(w, http.StatusCreated, mediaResponse(asset))
}

func inspectUpload(w http.ResponseWriter, file multipart.File) ([]byte, io.Reader, string, bool) {
	prefix := make([]byte, 512)
	count, err := file.Read(prefix)
	if err != nil && err != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid_file", "uploaded file could not be read")
		return nil, nil, "", false
	}
	prefix = prefix[:count]
	mimeType := http.DetectContentType(prefix)
	if _, allowed := allowedMediaTypes[mimeType]; !allowed {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "uploaded file type is not supported")
		return nil, nil, "", false
	}
	return prefix, file, mimeType, true
}

func (h *mediaHandler) list(w http.ResponseWriter, r *http.Request) {
	assets, err := h.client.MediaAsset.Query().WithOwner().Order(ent.Desc(mediaasset.FieldCreatedAt)).Limit(queryLimit(r, 100)).All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "media_query_failed", "media could not be loaded")
		return
	}
	items := make([]any, 0, len(assets))
	for _, asset := range assets {
		items = append(items, mediaResponse(asset))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *mediaHandler) serve(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")
	asset, err := h.client.MediaAsset.Query().Where(mediaasset.KeyEQ(key)).Only(r.Context())
	if err != nil {
		writeError(w, http.StatusNotFound, "media_not_found", "media was not found")
		return
	}
	reader, err := h.store.Open(r.Context(), key)
	if err != nil {
		writeError(w, http.StatusNotFound, "media_not_found", "media was not found")
		return
	}
	defer reader.Close()
	w.Header().Set("Content-Type", asset.MimeType)
	w.Header().Set("Content-Length", strconv.FormatInt(asset.Size, 10))
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, reader)
}

func mediaResponse(asset *ent.MediaAsset) map[string]any {
	return map[string]any{"id": asset.ID, "key": asset.Key, "url": "/api/v1/media/" + asset.Key, "originalName": asset.OriginalName, "mimeType": asset.MimeType, "size": asset.Size, "checksum": asset.Checksum, "altText": asset.AltText, "createdAt": asset.CreatedAt}
}

package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var safeExtension = regexp.MustCompile(`^\.[a-z0-9]{1,10}$`)

type Local struct{ root string }

func NewLocal(root string) (*Local, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve storage root: %w", err)
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, fmt.Errorf("create storage root: %w", err)
	}
	return &Local{root: root}, nil
}

func (s *Local) Put(ctx context.Context, extension string, source io.Reader) (Object, error) {
	extension = strings.ToLower(extension)
	if extension != "" && !safeExtension.MatchString(extension) {
		return Object{}, errors.New("invalid file extension")
	}
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return Object{}, fmt.Errorf("generate object key: %w", err)
	}
	key := hex.EncodeToString(random) + extension
	path, err := s.resolve(key)
	if err != nil {
		return Object{}, err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return Object{}, fmt.Errorf("create object: %w", err)
	}
	size, copyErr := copyContext(ctx, file, source)
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(path)
		if copyErr != nil {
			return Object{}, copyErr
		}
		return Object{}, closeErr
	}
	return Object{Key: key, Size: size}, nil
}

func (s *Local) Open(_ context.Context, key string) (io.ReadCloser, error) {
	path, err := s.resolve(key)
	if err != nil {
		return nil, err
	}
	return os.Open(path)
}

func (s *Local) Delete(_ context.Context, key string) error {
	path, err := s.resolve(key)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (s *Local) resolve(key string) (string, error) {
	if key == "" || filepath.Base(key) != key {
		return "", errors.New("invalid object key")
	}
	path := filepath.Join(s.root, key)
	if filepath.Dir(path) != s.root {
		return "", errors.New("object key escapes storage root")
	}
	return path, nil
}

func copyContext(ctx context.Context, destination io.Writer, source io.Reader) (int64, error) {
	buffer := make([]byte, 32*1024)
	var written int64
	for {
		if err := ctx.Err(); err != nil {
			return written, err
		}
		count, readErr := source.Read(buffer)
		if count > 0 {
			output, writeErr := destination.Write(buffer[:count])
			written += int64(output)
			if writeErr != nil {
				return written, writeErr
			}
		}
		if errors.Is(readErr, io.EOF) {
			return written, nil
		}
		if readErr != nil {
			return written, readErr
		}
	}
}

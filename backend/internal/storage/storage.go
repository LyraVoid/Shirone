package storage

import (
	"context"
	"io"
)

type Object struct {
	Key  string
	Size int64
}

type Store interface {
	Put(ctx context.Context, extension string, source io.Reader) (Object, error)
	Open(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
}

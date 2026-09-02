package storage

import (
	"context"
	"io"
	"strings"
	"testing"
)

func TestLocalObjectLifecycle(t *testing.T) {
	store, err := NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	object, err := store.Put(context.Background(), ".txt", strings.NewReader("hello"))
	if err != nil {
		t.Fatal(err)
	}
	if object.Size != 5 || !strings.HasSuffix(object.Key, ".txt") {
		t.Fatalf("object = %#v", object)
	}
	reader, err := store.Open(context.Background(), object.Key)
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(reader)
	_ = reader.Close()
	if err != nil || string(data) != "hello" {
		t.Fatalf("data = %q, err = %v", data, err)
	}
	if err := store.Delete(context.Background(), object.Key); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Open(context.Background(), object.Key); err == nil {
		t.Fatal("deleted object should not open")
	}
}

func TestLocalRejectsTraversal(t *testing.T) {
	store, err := NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Open(context.Background(), "../secret"); err == nil {
		t.Fatal("expected traversal key rejection")
	}
	if _, err := store.Put(context.Background(), ".tar.gz", strings.NewReader("bad")); err == nil {
		t.Fatal("expected compound extension rejection")
	}
}

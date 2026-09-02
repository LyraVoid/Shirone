package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/shirone-platform/backend/ent"
	"github.com/shirone-platform/backend/ent/session"
	"github.com/shirone-platform/backend/ent/user"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidSession     = errors.New("invalid session")
	ErrIdentityExists     = errors.New("email or username already exists")
)

type Service struct {
	client     *ent.Client
	sessionTTL time.Duration
	now        func() time.Time
}

func NewService(client *ent.Client, sessionTTL time.Duration) *Service {
	return &Service{client: client, sessionTTL: sessionTTL, now: time.Now}
}

func (s *Service) Register(ctx context.Context, email, username, displayName, password string) (*ent.User, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	username = strings.ToLower(strings.TrimSpace(username))
	displayName = strings.TrimSpace(displayName)
	if email == "" || username == "" || displayName == "" {
		return nil, "", errors.New("email, username, and display name are required")
	}
	hash, err := HashPassword(password)
	if err != nil {
		return nil, "", err
	}
	createdAt := s.now().UTC()
	u, err := s.client.User.Create().
		SetEmail(email).
		SetUsername(username).
		SetDisplayName(displayName).
		SetPasswordHash(hash).
		SetCreatedAt(createdAt).
		SetUpdatedAt(createdAt).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			return nil, "", ErrIdentityExists
		}
		return nil, "", err
	}
	token, err := s.createSession(ctx, u)
	return u, token, err
}

func (s *Service) Login(ctx context.Context, identity, password string) (*ent.User, string, error) {
	identity = strings.ToLower(strings.TrimSpace(identity))
	u, err := s.client.User.Query().Where(user.Or(user.EmailEQ(identity), user.UsernameEQ(identity))).Only(ctx)
	if err != nil || u.Status != user.StatusActive || !VerifyPassword(u.PasswordHash, password) {
		return nil, "", ErrInvalidCredentials
	}
	token, err := s.createSession(ctx, u)
	return u, token, err
}

func (s *Service) Authenticate(ctx context.Context, token string) (*ent.User, error) {
	if token == "" {
		return nil, ErrInvalidSession
	}
	sess, err := s.client.Session.Query().Where(session.TokenHashEQ(hashToken(token)), session.ExpiresAtGT(s.now().UTC())).Only(ctx)
	if err != nil {
		return nil, ErrInvalidSession
	}
	u, err := sess.QueryUser().Only(ctx)
	if err != nil || u.Status != user.StatusActive {
		return nil, ErrInvalidSession
	}
	return u, nil
}

func (s *Service) Logout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	_, err := s.client.Session.Delete().Where(session.TokenHashEQ(hashToken(token))).Exec(ctx)
	return err
}

func (s *Service) createSession(ctx context.Context, u *ent.User) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	now := s.now().UTC()
	_, err := s.client.Session.Create().SetTokenHash(hashToken(token)).SetUser(u).SetCreatedAt(now).SetExpiresAt(now.Add(s.sessionTTL)).Save(ctx)
	return token, err
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

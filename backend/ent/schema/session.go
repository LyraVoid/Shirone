package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

type Session struct{ ent.Schema }

func (Session) Fields() []ent.Field {
	return []ent.Field{
		field.String("token_hash").Unique(),
		field.Time("expires_at"),
		field.Time("created_at"),
	}
}

func (Session) Edges() []ent.Edge {
	return []ent.Edge{edge.From("user", User.Type).Ref("sessions").Unique().Required()}
}

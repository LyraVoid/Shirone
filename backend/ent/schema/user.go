package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type User struct{ ent.Schema }

func (User) Fields() []ent.Field {
	return []ent.Field{
		field.String("email").Unique(),
		field.String("username").Unique(),
		field.String("password_hash").Sensitive(),
		field.String("display_name"),
		field.Enum("role").Values("member", "editor", "admin").Default("member"),
		field.Enum("status").Values("active", "disabled", "pending").Default("active"),
		field.Time("created_at"),
		field.Time("updated_at"),
	}
}

func (User) Indexes() []ent.Index {
	return []ent.Index{index.Fields("status")}
}

func (User) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("sessions", Session.Type),
		edge.To("documents", Document.Type),
		edge.To("comments", Comment.Type),
		edge.To("revisions", DocumentRevision.Type),
		edge.To("media_assets", MediaAsset.Type),
	}
}

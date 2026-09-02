package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type DocumentRevision struct{ ent.Schema }

func (DocumentRevision) Fields() []ent.Field {
	return []ent.Field{
		field.Int("version").Positive(),
		field.String("slug"),
		field.String("title"),
		field.Text("body"),
		field.String("excerpt").Optional(),
		field.Enum("status").Values("draft", "published", "archived"),
		field.Time("created_at"),
	}
}

func (DocumentRevision) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("document", Document.Type).Ref("revisions").Unique().Required(),
		edge.From("editor", User.Type).Ref("revisions").Unique().Required(),
	}
}

func (DocumentRevision) Indexes() []ent.Index {
	return []ent.Index{index.Fields("version").Edges("document").Unique()}
}

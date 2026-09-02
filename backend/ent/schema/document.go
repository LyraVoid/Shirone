package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type Document struct{ ent.Schema }

func (Document) Fields() []ent.Field {
	return []ent.Field{
		field.String("kind").Default("post"),
		field.String("slug"),
		field.String("title"),
		field.Text("body"),
		field.Enum("status").Values("draft", "published", "archived").Default("draft"),
		field.String("excerpt").Optional(),
		field.JSON("metadata", map[string]any{}).Default(map[string]any{}),
		field.Time("published_at").Optional().Nillable(),
		field.Time("created_at"),
		field.Time("updated_at"),
	}
}

func (Document) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("author", User.Type).Ref("documents").Unique().Required(),
		edge.To("comments", Comment.Type),
		edge.To("revisions", DocumentRevision.Type),
		edge.To("terms", Term.Type),
	}
}

func (Document) Indexes() []ent.Index {
	return []ent.Index{index.Fields("slug").Unique(), index.Fields("status")}
}

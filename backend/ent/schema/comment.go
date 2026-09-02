package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

type Comment struct{ ent.Schema }

func (Comment) Fields() []ent.Field {
	return []ent.Field{
		field.Text("body"),
		field.Enum("status").Values("pending", "approved", "rejected").Default("pending"),
		field.Time("created_at"),
		field.Time("updated_at"),
	}
}

func (Comment) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("author", User.Type).Ref("comments").Unique().Required(),
		edge.From("document", Document.Type).Ref("comments").Unique().Required(),
		edge.From("parent", Comment.Type).Ref("replies").Unique(),
		edge.To("replies", Comment.Type),
	}
}

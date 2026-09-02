package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type Term struct{ ent.Schema }

func (Term) Fields() []ent.Field {
	return []ent.Field{
		field.String("slug"),
		field.String("name"),
		field.String("description").Optional(),
		field.Time("created_at"),
		field.Time("updated_at"),
	}
}

func (Term) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("taxonomy", Taxonomy.Type).Ref("terms").Unique().Required(),
		edge.From("documents", Document.Type).Ref("terms"),
	}
}

func (Term) Indexes() []ent.Index {
	return []ent.Index{index.Fields("slug").Edges("taxonomy").Unique()}
}

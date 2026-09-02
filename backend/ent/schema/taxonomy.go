package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

type Taxonomy struct{ ent.Schema }

func (Taxonomy) Fields() []ent.Field {
	return []ent.Field{
		field.String("key").Unique(),
		field.String("name"),
		field.String("description").Optional(),
		field.Time("created_at"),
		field.Time("updated_at"),
	}
}

func (Taxonomy) Edges() []ent.Edge {
	return []ent.Edge{edge.To("terms", Term.Type)}
}

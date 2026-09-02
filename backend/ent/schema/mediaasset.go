package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

type MediaAsset struct{ ent.Schema }

func (MediaAsset) Fields() []ent.Field {
	return []ent.Field{
		field.String("key").Unique(),
		field.String("original_name"),
		field.String("mime_type"),
		field.Int64("size").NonNegative(),
		field.String("checksum"),
		field.String("alt_text").Optional(),
		field.Time("created_at"),
	}
}

func (MediaAsset) Edges() []ent.Edge {
	return []ent.Edge{edge.From("owner", User.Type).Ref("media_assets").Unique().Required()}
}

-- Vistas guardadas (presets) por usuario y vista. Aditivo, no destructivo.
-- Aplicar en la BD del app tras el deploy:
--   psql "$DATABASE_URL" -f drizzle/0006_saved_views.sql
CREATE TABLE IF NOT EXISTS "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"view_key" text NOT NULL,
	"name" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_views_user_key_name_unique" UNIQUE("user_id","view_key","name")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

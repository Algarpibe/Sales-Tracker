-- Favoritos de clientes por usuario (estrella en la vista Clientes).
-- Cambio aditivo, no destructivo. Aplicar en la BD del app tras el deploy:
--   psql "$DATABASE_URL" -f drizzle/0005_favorites.sql
CREATE TABLE IF NOT EXISTS "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"customer_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_customer_unique" UNIQUE("user_id","customer_name")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "categories" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "category_groups" ALTER COLUMN "sort_order" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "category_groups" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "category_groups" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "is_rejected" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_records" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_company_name_unique" UNIQUE("company_id","name");--> statement-breakpoint
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_company_id_name_key" UNIQUE("company_id","name");--> statement-breakpoint
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_unique_period" UNIQUE("company_id","category_id","record_type","record_month","record_year");
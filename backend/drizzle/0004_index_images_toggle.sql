ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "index_images" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_sections" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "manuals" ADD COLUMN IF NOT EXISTS "index_images" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "manuals" ADD COLUMN IF NOT EXISTS "available_images" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "notion_resources" ADD COLUMN IF NOT EXISTS "index_images" boolean DEFAULT true NOT NULL;

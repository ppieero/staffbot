CREATE TYPE "public"."notion_object_type" AS ENUM('database', 'page');--> statement-breakpoint
CREATE TYPE "public"."notion_resource_category" AS ENUM('agenda', 'document', 'custom');--> statement-breakpoint
CREATE TYPE "public"."notion_sync_status" AS ENUM('pending', 'syncing', 'synced', 'error');--> statement-breakpoint
CREATE TABLE "notion_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"workspace_id" varchar(255) NOT NULL,
	"workspace_name" varchar(255) NOT NULL,
	"workspace_icon" text,
	"bot_id" varchar(255) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notion_resource_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notion_resource_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notion_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"notion_object_id" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"object_type" "notion_object_type" NOT NULL,
	"resource_category" "notion_resource_category" DEFAULT 'document' NOT NULL,
	"sync_status" "notion_sync_status" DEFAULT 'pending' NOT NULL,
	"chunk_count" integer DEFAULT 0,
	"last_synced_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "profile_ids" uuid[] DEFAULT '{}'::uuid[];--> statement-breakpoint
ALTER TABLE "manuals" ADD COLUMN "source_type" varchar(16) DEFAULT 'document';--> statement-breakpoint
ALTER TABLE "manuals" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "manuals" ADD COLUMN "video_duration" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "manuals" ADD COLUMN "transcription" text;--> statement-breakpoint
ALTER TABLE "manuals" ADD COLUMN "rag_indexed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "manuals" ADD COLUMN "rag_chunks" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "manuals" ADD COLUMN "tenant_slug" varchar(255);--> statement-breakpoint
ALTER TABLE "notion_connections" ADD CONSTRAINT "notion_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_resource_profiles" ADD CONSTRAINT "notion_resource_profiles_notion_resource_id_notion_resources_id_fk" FOREIGN KEY ("notion_resource_id") REFERENCES "public"."notion_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_resource_profiles" ADD CONSTRAINT "notion_resource_profiles_profile_id_position_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."position_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_resources" ADD CONSTRAINT "notion_resources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_resources" ADD CONSTRAINT "notion_resources_connection_id_notion_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."notion_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notion_connections_tenant_idx" ON "notion_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "nrp_resource_idx" ON "notion_resource_profiles" USING btree ("notion_resource_id");--> statement-breakpoint
CREATE INDEX "nrp_profile_idx" ON "notion_resource_profiles" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nrp_resource_profile_unique" ON "notion_resource_profiles" USING btree ("notion_resource_id","profile_id");--> statement-breakpoint
CREATE INDEX "notion_resources_tenant_idx" ON "notion_resources" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notion_resources_connection_idx" ON "notion_resources" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notion_resources_object_idx" ON "notion_resources" USING btree ("tenant_id","notion_object_id");
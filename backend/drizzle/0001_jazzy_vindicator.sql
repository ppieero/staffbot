CREATE TABLE "employee_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"wa_group_jid" varchar(64),
	"wa_group_name" varchar(255),
	"telegram_group_id" bigint,
	"telegram_group_name" varchar(255),
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manual_id" uuid NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"title" varchar(255) NOT NULL,
	"content_html" text DEFAULT '' NOT NULL,
	"section_type" varchar(32) DEFAULT 'content',
	"images" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"language" varchar(8) DEFAULT 'es',
	"source_file_url" text,
	"source_file_name" varchar(255),
	"profile_ids" text[] DEFAULT '{}',
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" varchar(100) DEFAULT 'claude-sonnet-4-6' NOT NULL,
	"input_price_per_1m" double precision DEFAULT 3 NOT NULL,
	"output_price_per_1m" double precision DEFAULT 15 NOT NULL,
	"margin_pct" double precision DEFAULT 30 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "telegram_link_code" varchar(12);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "telegram_link_expires" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "telegram_linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "preferred_channel" varchar(16) DEFAULT 'whatsapp' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "whatsapp_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "whatsapp_verification_code" varchar(6);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "whatsapp_verification_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tokens_input" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tokens_output" integer;--> statement-breakpoint
ALTER TABLE "position_profiles" ADD COLUMN "custom_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_whatsapp" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_id" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "language_pref" varchar(4) DEFAULT 'es';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" varchar(64) DEFAULT 'America/Lima';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_whatsapp" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_telegram" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_escalations" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_new_employees" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_profile_id_position_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."position_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_sections" ADD CONSTRAINT "manual_sections_manual_id_manuals_id_fk" FOREIGN KEY ("manual_id") REFERENCES "public"."manuals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manuals" ADD CONSTRAINT "manuals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ep_employee_idx" ON "employee_profiles" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "ep_profile_idx" ON "employee_profiles" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ep_employee_profile_unique" ON "employee_profiles" USING btree ("employee_id","profile_id");
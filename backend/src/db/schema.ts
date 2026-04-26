import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  doublePrecision,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const tenantStatusEnum = pgEnum("tenant_status", [
  "active",
  "suspended",
  "trial",
]);

export const tenantPlanEnum = pgEnum("tenant_plan", [
  "starter",
  "professional",
  "enterprise",
]);

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "company_admin",
  "company_viewer",
]);

export const profileStatusEnum = pgEnum("profile_status", [
  "active",
  "inactive",
]);

export const fileTypeEnum = pgEnum("file_type", [
  "pdf",
  "docx",
  "txt",
  "url",
  "xlsx",
]);

export const indexingStatusEnum = pgEnum("indexing_status", [
  "pending",
  "processing",
  "indexed",
  "error",
]);

export const employeeStatusEnum = pgEnum("employee_status", [
  "active",
  "inactive",
  "onboarding",
]);

export const channelEnum = pgEnum("channel", ["whatsapp", "telegram"]);

export const conversationStatusEnum = pgEnum("conversation_status", [
  "open",
  "closed",
  "escalated",
]);

export const messageRoleEnum = pgEnum("message_role", [
  "user",
  "assistant",
  "system",
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    status: tenantStatusEnum("status").notNull().default("trial"),
    plan: tenantPlanEnum("plan").notNull().default("starter"),
    // WhatsApp
    whatsappNumber: varchar("whatsapp_number", { length: 30 }),
    whatsappToken: text("whatsapp_token"),
    whatsappPhoneNumberId: varchar("whatsapp_phone_number_id", { length: 100 }),
    // Telegram
    telegramBotToken: text("telegram_bot_token"),
    // AI
    aiModelOverride: varchar("ai_model_override", { length: 100 }),
    // Limits
    maxEmployees: integer("max_employees").notNull().default(50),
    maxDocuments: integer("max_documents").notNull().default(100),
    maxMessagesPerMonth: integer("max_messages_per_month").notNull().default(10000),
    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("tenants_slug_idx").on(t.slug),
  })
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // null tenant_id = super admin
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    phoneWhatsapp:      varchar("phone_whatsapp", { length: 32 }),
    telegramId:         varchar("telegram_id", { length: 64 }),
    languagePref:       varchar("language_pref", { length: 4 }).default("es"),
    timezone:           varchar("timezone", { length: 64 }).default("America/Lima"),
    notifyWhatsapp:     boolean("notify_whatsapp").default(false),
    notifyTelegram:     boolean("notify_telegram").default(false),
    notifyEscalations:  boolean("notify_escalations").default(true),
    notifyNewEmployees: boolean("notify_new_employees").default(false),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    tenantIdx: index("users_tenant_idx").on(t.tenantId),
  })
);

export const positionProfiles = pgTable(
  "position_profiles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    systemPrompt: text("system_prompt"),
    language: varchar("language", { length: 10 }).notNull().default("es"),
    escalationContact: varchar("escalation_contact", { length: 255 }),
    status: profileStatusEnum("status").notNull().default("active"),
    customFields: jsonb("custom_fields").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("profiles_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("profiles_tenant_status_idx").on(t.tenantId, t.status),
  })
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").notNull().references(() => positionProfiles.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    fileName: varchar("file_name", { length: 500 }).notNull(),
    fileUrl: text("file_url").notNull(),
    fileType: fileTypeEnum("file_type").notNull(),
    fileSizeBytes: integer("file_size_bytes"),
    indexingStatus: indexingStatusEnum("indexing_status").notNull().default("pending"),
    errorMessage: text("error_message"),
    chunkCount: integer("chunk_count"),
    version: integer("version").notNull().default(1),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("documents_tenant_idx").on(t.tenantId),
    profileIdx: index("documents_profile_idx").on(t.profileId),
    statusIdx: index("documents_status_idx").on(t.indexingStatus),
  })
);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").notNull().references(() => positionProfiles.id, { onDelete: "restrict" }),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    phoneWhatsapp: varchar("phone_whatsapp", { length: 30 }),
    telegramLinkCode:    varchar("telegram_link_code", { length: 12 }),
    telegramLinkExpires: timestamp("telegram_link_expires", { withTimezone: true }),
    telegramLinkedAt:    timestamp("telegram_linked_at", { withTimezone: true }),
    telegramUserId: varchar("telegram_user_id", { length: 100 }),
    email: varchar("email", { length: 255 }),
    department: varchar("department", { length: 150 }),
    status: employeeStatusEnum("status").notNull().default("onboarding"),
    languagePref: varchar("language_pref", { length: 10 }).notNull().default("es"),
    preferredChannel: varchar("preferred_channel", { length: 16 }).notNull().default("whatsapp"),
    whatsappVerified: boolean("whatsapp_verified").notNull().default(false),
    whatsappVerificationCode: varchar("whatsapp_verification_code", { length: 6 }),
    whatsappVerificationSentAt: timestamp("whatsapp_verification_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    whatsappIdx: uniqueIndex("employees_whatsapp_idx").on(t.phoneWhatsapp),
    tenantIdx: index("employees_tenant_idx").on(t.tenantId),
    profileIdx: index("employees_profile_idx").on(t.profileId),
  })
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull(),
    status: conversationStatusEnum("status").notNull().default("open"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("conversations_tenant_idx").on(t.tenantId),
    employeeIdx: index("conversations_employee_idx").on(t.employeeId),
    statusIdx: index("conversations_status_idx").on(t.status),
    lastMessageIdx: index("conversations_last_message_idx").on(t.lastMessageAt),
  })
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    // Array of {document_id, chunk_id, score, excerpt} objects
    sources: jsonb("sources"),
    tokensUsed: integer("tokens_used"),
    tokensInput: integer("tokens_input"),
    tokensOutput: integer("tokens_output"),
    latencyMs: integer("latency_ms"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index("messages_conversation_idx").on(t.conversationId),
    sentAtIdx: index("messages_sent_at_idx").on(t.sentAt),
  })
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }),
    entityId: varchar("entity_id", { length: 255 }),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("audit_logs_tenant_idx").on(t.tenantId),
    userIdx: index("audit_logs_user_idx").on(t.userId),
    entityIdx: index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  positionProfiles: many(positionProfiles),
  documents: many(documents),
  employees: many(employees),
  conversations: many(conversations),
  auditLogs: many(auditLogs),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  uploadedDocuments: many(documents),
  auditLogs: many(auditLogs),
}));

export const positionProfilesRelations = relations(positionProfiles, ({ one, many }) => ({
  tenant: one(tenants, { fields: [positionProfiles.tenantId], references: [tenants.id] }),
  documents: many(documents),
  employees: many(employees),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  tenant: one(tenants, { fields: [documents.tenantId], references: [tenants.id] }),
  profile: one(positionProfiles, { fields: [documents.profileId], references: [positionProfiles.id] }),
  uploadedBy: one(users, { fields: [documents.uploadedBy], references: [users.id] }),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  tenant: one(tenants, { fields: [employees.tenantId], references: [tenants.id] }),
  profile: one(positionProfiles, { fields: [employees.profileId], references: [positionProfiles.id] }),
  conversations: many(conversations),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [conversations.tenantId], references: [tenants.id] }),
  employee: one(employees, { fields: [conversations.employeeId], references: [employees.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, { fields: [auditLogs.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export const employeeProfiles = pgTable(
  "employee_profiles",
  {
    id:                uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    employeeId:        uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    profileId:         uuid("profile_id").notNull().references(() => positionProfiles.id, { onDelete: "cascade" }),
    isPrimary:         boolean("is_primary").notNull().default(false),
    waGroupJid:        varchar("wa_group_jid", { length: 64 }),
    waGroupName:       varchar("wa_group_name", { length: 255 }),
    telegramGroupId:   bigint("telegram_group_id", { mode: "number" }),
    telegramGroupName: varchar("telegram_group_name", { length: 255 }),
    assignedAt:        timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    epEmployeeIdx: index("ep_employee_idx").on(t.employeeId),
    epProfileIdx:  index("ep_profile_idx").on(t.profileId),
    epUnique:      uniqueIndex("ep_employee_profile_unique").on(t.employeeId, t.profileId),
  })
);

export const employeeProfilesRelations = relations(employeeProfiles, ({ one }) => ({
  employee: one(employees, { fields: [employeeProfiles.employeeId], references: [employees.id] }),
  profile:  one(positionProfiles, { fields: [employeeProfiles.profileId], references: [positionProfiles.id] }),
}));

export const pricingConfig = pgTable("pricing_config", {
  id:               uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  model:            varchar("model", { length: 100 }).notNull().default("claude-sonnet-4-6"),
  inputPricePer1m:  doublePrecision("input_price_per_1m").notNull().default(3.0),
  outputPricePer1m: doublePrecision("output_price_per_1m").notNull().default(15.0),
  marginPct:        doublePrecision("margin_pct").notNull().default(30.0),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const manuals = pgTable("manuals", {
  id:             uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId:       uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  title:          varchar("title", { length: 255 }).notNull(),
  slug:           varchar("slug", { length: 255 }).notNull(),
  status:         varchar("status", { length: 32 }).notNull().default("draft"),
  language:       varchar("language", { length: 8 }).default("es"),
  sourceFileUrl:  text("source_file_url"),
  sourceFileName: varchar("source_file_name", { length: 255 }),
  profileIds:     text("profile_ids").array().default([]),
  generatedAt:    timestamp("generated_at", { withTimezone: true }),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const manualSections = pgTable("manual_sections", {
  id:          uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  manualId:    uuid("manual_id").notNull().references(() => manuals.id, { onDelete: "cascade" }),
  orderIndex:  integer("order_index").notNull().default(0),
  title:       varchar("title", { length: 255 }).notNull(),
  contentHtml: text("content_html").notNull().default(""),
  sectionType: varchar("section_type", { length: 32 }).default("content"),
  images:      jsonb("images").default([]),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

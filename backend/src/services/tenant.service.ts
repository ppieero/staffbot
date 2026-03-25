import { and, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  conversations,
  documents,
  employees,
  messages,
  tenants,
  users,
} from "../db/schema";
import { hashPassword } from "./auth.service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateTenantInput {
  name: string;
  slug: string;
  plan?: "starter" | "professional" | "enterprise";
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
  maxEmployees?: number;
  maxDocuments?: number;
  maxMessagesPerMonth?: number;
}

export interface UpdateTenantInput {
  name?: string;
  plan?: "starter" | "professional" | "enterprise";
  status?: "active" | "suspended" | "trial";
  maxEmployees?: number;
  maxDocuments?: number;
  maxMessagesPerMonth?: number;
  whatsappNumber?: string;
  whatsappToken?: string;
  whatsappPhoneNumberId?: string;
  telegramBotToken?: string;
  aiModelOverride?: string;
}

export interface PaginationInput {
  page?: number;
  limit?: number;
  search?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function createTenant(data: CreateTenantInput) {
  const passwordHash = await hashPassword(data.adminPassword);

  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: data.name,
        slug: data.slug.toLowerCase(),
        plan: data.plan ?? "starter",
        status: "trial",
        maxEmployees: data.maxEmployees ?? 50,
        maxDocuments: data.maxDocuments ?? 100,
        maxMessagesPerMonth: data.maxMessagesPerMonth ?? 10000,
      })
      .returning();

    const [adminUser] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: data.adminEmail.toLowerCase(),
        passwordHash,
        role: "company_admin",
        firstName: data.adminFirstName,
        lastName: data.adminLastName,
        isActive: true,
      })
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
      });

    return { tenant, adminUser };
  });
}

export async function getTenants({ page = 1, limit = 20, search }: PaginationInput) {
  const offset = (page - 1) * limit;

  const where = search
    ? or(
        ilike(tenants.name, `%${search}%`),
        ilike(tenants.slug, `%${search}%`)
      )
    : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(tenants)
      .where(where)
      .orderBy(desc(tenants.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(tenants)
      .where(where),
  ]);

  return {
    data: rows,
    meta: {
      page,
      limit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
    },
  };
}

export async function getTenantById(id: string) {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  return tenant ?? null;
}

export async function updateTenant(id: string, data: UpdateTenantInput) {
  const [updated] = await db
    .update(tenants)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tenants.id, id))
    .returning();
  return updated ?? null;
}

export async function suspendTenant(id: string) {
  const [updated] = await db
    .update(tenants)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(eq(tenants.id, id))
    .returning();
  return updated ?? null;
}

// Soft delete: suspend rather than cascade-delete all data
export async function deleteTenant(id: string) {
  return suspendTenant(id);
}

export async function getTenantStats(id: string) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    [{ employeeCount }],
    [{ documentCount }],
    [{ messageCount }],
    [{ conversationCount }],
  ] = await Promise.all([
    db
      .select({ employeeCount: count() })
      .from(employees)
      .where(eq(employees.tenantId, id)),
    db
      .select({ documentCount: count() })
      .from(documents)
      .where(eq(documents.tenantId, id)),
    db
      .select({ messageCount: count() })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.tenantId, id),
          gte(messages.sentAt, startOfMonth)
        )
      ),
    db
      .select({ conversationCount: count() })
      .from(conversations)
      .where(eq(conversations.tenantId, id)),
  ]);

  return {
    employeeCount: Number(employeeCount),
    documentCount: Number(documentCount),
    messagesThisMonth: Number(messageCount),
    conversationCount: Number(conversationCount),
  };
}

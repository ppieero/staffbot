import { and, count, desc, eq, ilike, or, sql, SQL } from "drizzle-orm";
import { db } from "../db";
import { conversations, documents, employees, positionProfiles, tenants } from "../db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CustomField {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "date" | "boolean";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface CreateProfileInput {
  name: string;
  description?: string;
  systemPrompt?: string;
  language?: string;
  escalationContact?: string;
  customFields?: CustomField[];
}

export interface UpdateProfileInput {
  name?: string;
  description?: string;
  systemPrompt?: string;
  language?: string;
  escalationContact?: string;
  customFields?: CustomField[];
}

export interface ProfilePaginationInput {
  page?: number;
  limit?: number;
  search?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** null = super_admin bypasses tenant filter */
function tenantEq(tenantId: string | null): SQL | undefined {
  if (!tenantId) return undefined;
  return eq(positionProfiles.tenantId, tenantId);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function createProfile(tenantId: string, data: CreateProfileInput) {
  const [profile] = await db
    .insert(positionProfiles)
    .values({
      tenantId,
      name: data.name,
      description: data.description,
      systemPrompt: data.systemPrompt,
      language: data.language ?? "es",
      escalationContact: data.escalationContact,
      status: "active",
      customFields: (data.customFields ?? []) as any,
    })
    .returning();
  return profile;
}

export async function getProfiles(
  tenantId: string | null,
  { page = 1, limit = 20, search }: ProfilePaginationInput
) {
  const offset = (page - 1) * limit;
  const scope = tenantEq(tenantId);

  const where: SQL | undefined = search
    ? scope
      ? and(
          scope,
          or(
            ilike(positionProfiles.name, `%${search}%`),
            ilike(positionProfiles.description, `%${search}%`)
          )
        )
      : or(
          ilike(positionProfiles.name, `%${search}%`),
          ilike(positionProfiles.description, `%${search}%`)
        )
    : scope;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id:               positionProfiles.id,
        tenantId:         positionProfiles.tenantId,
        name:             positionProfiles.name,
        description:      positionProfiles.description,
        systemPrompt:     positionProfiles.systemPrompt,
        language:         positionProfiles.language,
        escalationContact: positionProfiles.escalationContact,
        status:           positionProfiles.status,
        customFields:     positionProfiles.customFields,
        createdAt:        positionProfiles.createdAt,
        updatedAt:        positionProfiles.updatedAt,
        tenantName:       tenants.name,
        tenantSlug:       tenants.slug,
        employeeCount:    sql<number>`(SELECT COUNT(*) FROM employees WHERE employees.profile_id = ${positionProfiles.id})::int`,
        documentCount:    sql<number>`(SELECT COUNT(*) FROM documents WHERE documents.profile_id = ${positionProfiles.id})::int`,
      })
      .from(positionProfiles)
      .leftJoin(tenants, eq(positionProfiles.tenantId, tenants.id))
      .where(where)
      .orderBy(desc(positionProfiles.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(positionProfiles).where(where),
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

export async function getProfileById(tenantId: string | null, id: string) {
  const where = tenantId
    ? and(eq(positionProfiles.id, id), eq(positionProfiles.tenantId, tenantId))
    : eq(positionProfiles.id, id);

  const [profile] = await db
    .select()
    .from(positionProfiles)
    .where(where)
    .limit(1);
  return profile ?? null;
}

export async function updateProfile(
  tenantId: string | null,
  id: string,
  data: UpdateProfileInput
) {
  const where = tenantId
    ? and(eq(positionProfiles.id, id), eq(positionProfiles.tenantId, tenantId))
    : eq(positionProfiles.id, id);

  const setData: Record<string, unknown> = { ...data, updatedAt: new Date() };
  if (data.customFields !== undefined) {
    setData.customFields = data.customFields as any;
  }

  const [updated] = await db
    .update(positionProfiles)
    .set(setData)
    .where(where)
    .returning();
  return updated ?? null;
}

export async function deleteProfile(tenantId: string | null, id: string) {
  const empScope = tenantId
    ? and(eq(employees.profileId, id), eq(employees.tenantId, tenantId))
    : eq(employees.profileId, id);

  const [{ assignedCount }] = await db
    .select({ assignedCount: count() })
    .from(employees)
    .where(empScope);

  if (Number(assignedCount) > 0) {
    throw new Error(
      `Cannot delete: ${assignedCount} employee(s) are assigned to this profile`
    );
  }

  const where = tenantId
    ? and(eq(positionProfiles.id, id), eq(positionProfiles.tenantId, tenantId))
    : eq(positionProfiles.id, id);

  const [deleted] = await db
    .delete(positionProfiles)
    .where(where)
    .returning({ id: positionProfiles.id });

  return deleted ?? null;
}

export async function setProfileStatus(
  tenantId: string | null,
  id: string,
  status: "active" | "inactive"
) {
  const where = tenantId
    ? and(eq(positionProfiles.id, id), eq(positionProfiles.tenantId, tenantId))
    : eq(positionProfiles.id, id);

  const [updated] = await db
    .update(positionProfiles)
    .set({ status, updatedAt: new Date() })
    .where(where)
    .returning();
  return updated ?? null;
}

export async function getProfileStats(tenantId: string | null, id: string) {
  const docScope = tenantId
    ? and(eq(documents.profileId, id), eq(documents.tenantId, tenantId))
    : eq(documents.profileId, id);

  const empScope = tenantId
    ? and(eq(employees.profileId, id), eq(employees.tenantId, tenantId))
    : eq(employees.profileId, id);

  const convScope = tenantId ? eq(conversations.tenantId, tenantId) : undefined;

  const [
    [{ documentCount }],
    [{ employeeCount }],
    [{ conversationCount }],
  ] = await Promise.all([
    db.select({ documentCount: count() }).from(documents).where(docScope),
    db.select({ employeeCount: count() }).from(employees).where(empScope),
    db.select({ conversationCount: count() }).from(conversations).where(convScope),
  ]);

  return {
    documentCount: Number(documentCount),
    employeeCount: Number(employeeCount),
    conversationCount: Number(conversationCount),
  };
}

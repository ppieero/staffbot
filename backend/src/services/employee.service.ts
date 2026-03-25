import { and, count, desc, eq, ilike, or, SQL, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { employees, employeeProfiles, positionProfiles, tenants } from "../db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateEmployeeInput {
  profileId: string;
  firstName: string;
  lastName: string;
  phoneWhatsapp?: string;
  telegramUserId?: string;
  email?: string;
  department?: string;
  languagePref?: string;
}

export interface UpdateEmployeeInput {
  profileId?: string;
  firstName?: string;
  lastName?: string;
  phoneWhatsapp?: string;
  telegramUserId?: string;
  email?: string;
  department?: string;
  languagePref?: string;
  preferredChannel?: string;
}

export interface EmployeeFilters {
  page?: number;
  limit?: number;
  search?: string;
  profileId?: string;
  status?: "active" | "inactive" | "onboarding";
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function createEmployee(tenantId: string, data: CreateEmployeeInput & { status?: string }) {
  const [employee] = await db
    .insert(employees)
    .values({
      tenantId,
      profileId: data.profileId,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneWhatsapp: data.phoneWhatsapp,
      telegramUserId: data.telegramUserId,
      email: data.email,
      department: data.department,
      languagePref: data.languagePref ?? "es",
      status: (data.status as "active" | "inactive" | "onboarding") ?? "onboarding",
    })
    .returning();

  // Auto-create primary profile assignment in junction table
  await db.insert(employeeProfiles)
    .values({ employeeId: employee.id, profileId: data.profileId, isPrimary: true })
    .onConflictDoNothing();

  return employee;
}

export async function bulkCreateEmployees(
  tenantId: string | null,
  rows: CreateEmployeeInput[]
) {
  if (rows.length === 0) return [];
  if (rows.length > 500) throw new Error("Bulk import limit is 500 employees");

  const values = rows.map((r) => ({
    tenantId,
    profileId: r.profileId,
    firstName: r.firstName,
    lastName: r.lastName,
    phoneWhatsapp: r.phoneWhatsapp,
    telegramUserId: r.telegramUserId,
    email: r.email,
    department: r.department,
    languagePref: r.languagePref ?? "es",
    status: "onboarding" as const,
  }));

  return db.insert(employees).values(values).returning();
}

export async function getEmployees(tenantId: string | null, filters: EmployeeFilters) {
  const { page = 1, limit = 20, search, profileId, status } = filters;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = tenantId
    ? [eq(employees.tenantId, tenantId)]
    : [isNotNull(employees.tenantId)];

  if (profileId) conditions.push(eq(employees.profileId, profileId));
  if (status) conditions.push(eq(employees.status, status));
  if (search) {
    conditions.push(
      or(
        ilike(employees.firstName, `%${search}%`),
        ilike(employees.lastName, `%${search}%`),
        ilike(employees.email, `%${search}%`),
        ilike(employees.phoneWhatsapp, `%${search}%`)
      ) as SQL
    );
  }

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: employees.id,
        tenantId: employees.tenantId,
        profileId: employees.profileId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        phoneWhatsapp: employees.phoneWhatsapp,
        telegramUserId: employees.telegramUserId,
        email: employees.email,
        department: employees.department,
        status: employees.status,
        languagePref: employees.languagePref,
        preferredChannel: employees.preferredChannel,
        whatsappVerified: employees.whatsappVerified,
        createdAt: employees.createdAt,
        updatedAt: employees.updatedAt,
        profile: {
          id: positionProfiles.id,
          name: positionProfiles.name,
        },
        tenantName: tenants.name,
      })
      .from(employees)
      .leftJoin(positionProfiles, eq(employees.profileId, positionProfiles.id))
      .leftJoin(tenants, eq(employees.tenantId, tenants.id))
      .where(where)
      .orderBy(desc(employees.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(employees).where(where),
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

export async function getEmployeeById(tenantId: string | null, id: string) {
  const [row] = await db
    .select({
      id: employees.id,
      tenantId: employees.tenantId,
      profileId: employees.profileId,
      firstName: employees.firstName,
      lastName: employees.lastName,
      phoneWhatsapp: employees.phoneWhatsapp,
      telegramUserId: employees.telegramUserId,
      email: employees.email,
      department: employees.department,
      status: employees.status,
      languagePref: employees.languagePref,
      preferredChannel: employees.preferredChannel,
      whatsappVerified: employees.whatsappVerified,
      createdAt: employees.createdAt,
      updatedAt: employees.updatedAt,
      profile: {
        id: positionProfiles.id,
        name: positionProfiles.name,
        language: positionProfiles.language,
        systemPrompt: positionProfiles.systemPrompt,
        escalationContact: positionProfiles.escalationContact,
      },
    })
    .from(employees)
    .leftJoin(positionProfiles, eq(employees.profileId, positionProfiles.id))
    .where(tenantId
      ? and(eq(employees.id, id), eq(employees.tenantId, tenantId))
      : eq(employees.id, id)
    )
    .limit(1);

  return row ?? null;
}

export async function updateEmployee(
  tenantId: string | null,
  id: string,
  data: UpdateEmployeeInput
) {
  const [updated] = await db
    .update(employees)
    .set({ ...data, updatedAt: new Date() })
    .where(tenantId
      ? and(eq(employees.id, id), eq(employees.tenantId, tenantId))
      : eq(employees.id, id)
    )
    .returning();
  return updated ?? null;
}

export async function deactivateEmployee(tenantId: string | null, id: string) {
  const [updated] = await db
    .update(employees)
    .set({ status: "inactive", updatedAt: new Date() })
    .where(tenantId
      ? and(eq(employees.id, id), eq(employees.tenantId, tenantId))
      : eq(employees.id, id)
    )
    .returning();
  return updated ?? null;
}

export async function setEmployeeStatus(
  tenantId: string | null,
  id: string,
  status: "active" | "inactive" | "onboarding"
) {
  const [updated] = await db
    .update(employees)
    .set({ status, updatedAt: new Date() })
    .where(tenantId
      ? and(eq(employees.id, id), eq(employees.tenantId, tenantId))
      : eq(employees.id, id)
    )
    .returning();
  return updated ?? null;
}

export async function getEmployeeByPhone(phoneWhatsapp: string) {
  const [row] = await db
    .select({
      id: employees.id,
      tenantId: employees.tenantId,
      profileId: employees.profileId,
      firstName: employees.firstName,
      lastName: employees.lastName,
      status: employees.status,
      languagePref: employees.languagePref,
      profile: {
        id: positionProfiles.id,
        name: positionProfiles.name,
        systemPrompt: positionProfiles.systemPrompt,
        language: positionProfiles.language,
        escalationContact: positionProfiles.escalationContact,
      },
    })
    .from(employees)
    .leftJoin(positionProfiles, eq(employees.profileId, positionProfiles.id))
    .where(eq(employees.phoneWhatsapp, phoneWhatsapp))
    .limit(1);

  return row ?? null;
}

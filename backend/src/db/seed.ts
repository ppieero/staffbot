import dotenv from "dotenv";
dotenv.config();

import { eq } from "drizzle-orm";
import { db } from "./index";
import { users } from "./schema";
import { hashPassword } from "../services/auth.service";

async function seed() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error("[seed] SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set");
    process.exit(1);
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    console.log(`[seed] super admin already exists (id: ${existing.id}) — skipping`);
    process.exit(0);
  }

  const passwordHash = await hashPassword(password);

  const [created] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      role: "super_admin",
      firstName: "Super",
      lastName: "Admin",
      tenantId: null,
      isActive: true,
    })
    .returning({ id: users.id, email: users.email, role: users.role });

  console.log(`[seed] super admin created:`, created);
  process.exit(0);
}

seed().catch((err) => {
  console.error("[seed] error:", err);
  process.exit(1);
});

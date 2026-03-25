import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function runMigrations() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log("[migrate] running migrations...");

  await migrate(db, {
    migrationsFolder: path.join(__dirname, "../../drizzle"),
  });

  console.log("[migrate] all migrations applied successfully");

  await pool.end();
}

runMigrations().catch((err) => {
  console.error("[migrate] migration failed:", err);
  process.exit(1);
});

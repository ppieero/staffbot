import type { Config } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config();

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://staffbot:staffbot_secret@localhost:5432/staffbot",
  },
  verbose: true,
  strict: true,
} satisfies Config;

import "dotenv/config";
import { defineConfig } from "prisma/config";

let url = process.env.DATABASE_URL || "postgresql://dreamsky_database:DreamskyPass2026@127.0.0.1:5432/dreamsky_DreamSky?schema=public";
if (url.includes("dreamsky_dreamsky")) {
  url = url.replace("dreamsky_dreamsky", "dreamsky_database").replace(/:[^@]+@/, ":DreamskyPass2026@");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});

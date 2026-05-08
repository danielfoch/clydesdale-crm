import { spawnSync } from "node:child_process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const migrationDatabaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL;

if (!migrationDatabaseUrl) {
  throw new Error("DATABASE_URL is required for Vercel build migrations.");
}

const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: migrationDatabaseUrl, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" },
  stdio: "inherit",
});

if (migrate.status !== 0) {
  process.exit(migrate.status ?? 1);
}

const build = spawnSync("npx", ["next", "build"], {
  env: process.env,
  stdio: "inherit",
});

process.exit(build.status ?? 1);

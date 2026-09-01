import fs from "fs";
import path from "path";
import { ensureSchema, closeDbPool } from "../src/server/db";

async function main() {
  console.log("Running database migrations from migrations/001_initial_schema.sql...");
  try {
    await ensureSchema();
    console.log("Database migrations applied successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await closeDbPool();
  }
}

main();

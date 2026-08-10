import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createApp } from "./app.js";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(rootDirectory, ".env") });
const production = process.argv.includes("--production") || process.env.NODE_ENV === "production";
const mockMode = process.env.MOCK_MODE === "true" || (!production && (!process.env.NIMBUS_API_KEY || !process.env.NIMBUS_API_SECRET));
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Copy .env.example to .env and set your PostgreSQL password.");
if (!mockMode && (!process.env.NIMBUS_API_KEY || !process.env.NIMBUS_API_SECRET)) throw new Error("NIMBUS_API_KEY and NIMBUS_API_SECRET are required outside demo mode");
if (!mockMode && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) throw new Error("JWT_SECRET must be at least 32 characters in production");
const app = await createApp({
  jwtSecret: process.env.JWT_SECRET || "local-demo-secret-not-for-production-use",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL === "true",
  mockMode,
  initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD,
  nimbusApiUrl: process.env.NIMBUS_API_URL || "https://api-v2.nimbuspost.com",
  nimbusApiKey: process.env.NIMBUS_API_KEY || "",
  nimbusApiSecret: process.env.NIMBUS_API_SECRET || "",
  maxLookupPages: Number(process.env.NIMBUS_LOOKUP_MAX_PAGES || 20),
});
const port = Number(process.env.PORT || 8787); app.listen(port, () => console.log(`AutoShip API listening on http://localhost:${port}`));

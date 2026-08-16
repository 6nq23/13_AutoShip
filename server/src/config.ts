import path from "node:path";
import dotenv from "dotenv";
import type { AppConfig } from "./app.js";

export function loadConfig(): AppConfig {
  // Keep imports side-effect free. The root project file is canonical; the
  // server-local file only fills values that are absent there.
  const workspaceDirectory = path.basename(process.cwd()).toLowerCase() === "server" ? path.resolve(process.cwd(), "..") : process.cwd();
  dotenv.config({ path: path.join(workspaceDirectory, ".env") });
  dotenv.config({ path: path.join(workspaceDirectory, "server", ".env") });

  const production = process.argv.includes("--production") || process.env.NODE_ENV === "production";
  const mockMode = process.env.MOCK_MODE === "true" || (!production && (!process.env.NIMBUS_API_KEY || !process.env.NIMBUS_API_SECRET));

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Copy .env.example to .env and set your PostgreSQL connection string.");
  if (!mockMode && (!process.env.NIMBUS_API_KEY || !process.env.NIMBUS_API_SECRET)) throw new Error("NIMBUS_API_KEY and NIMBUS_API_SECRET are required outside demo mode");
  if (!mockMode && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) throw new Error("JWT_SECRET must be at least 32 characters in production");

  return {
    jwtSecret: process.env.JWT_SECRET || "local-demo-secret-not-for-production-use",
    clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173,https://auto-ship-client.vercel.app",
    databaseUrl: process.env.DATABASE_URL,
    databaseSsl: process.env.DATABASE_SSL === "true",
    mockMode,
    initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD,
    nimbusApiUrl: process.env.NIMBUS_API_URL || "https://api-v2.nimbuspost.com",
    nimbusApiKey: process.env.NIMBUS_API_KEY || "",
    nimbusApiSecret: process.env.NIMBUS_API_SECRET || "",
    maxLookupPages: Number(process.env.NIMBUS_LOOKUP_MAX_PAGES || 20),
  };
}

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientDirectory = path.dirname(fileURLToPath(import.meta.url));
const localCertificate = path.join(clientDirectory, ".cert", "autoship-local.pfx");
const localHttps = existsSync(localCertificate)
  ? { pfx: readFileSync(localCertificate), passphrase: "autoship-local-dev" }
  : undefined;

export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", https: localHttps, proxy: { "/api": "http://localhost:8787" } },
});

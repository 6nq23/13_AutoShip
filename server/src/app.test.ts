import bcrypt from "bcryptjs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { Store } from "./store.js";
import type { Batch, ShippingJob, UserRecord } from "./types.js";

class MemoryStore implements Store {
  private users: UserRecord[] = [];
  private history: Batch[] = [];
  private cache = new Map<string, string>();
  private jobs = new Map<string, ShippingJob>();
  async init() { this.users = [{ id: 1, username: "admin", passwordHash: await bcrypt.hash("admin123", 4), role: "admin" }]; }
  async findUser(username: string) { return this.users.find((user) => user.username.toLowerCase() === username.toLowerCase()); }
  async createUser(username: string, passwordHash: string, role: UserRecord["role"]) {
    if (await this.findUser(username)) return undefined;
    const user = { id: this.users.length + 1, username, passwordHash, role }; this.users.push(user); return user;
  }
  async getOrderId(orderNumber: string) { return this.cache.get(orderNumber); }
  async cacheOrder(orderNumber: string, orderId: string) { this.cache.set(orderNumber, orderId); }
  async addBatch(batch: Batch) { this.history.unshift(batch); }
  async getHistory() { return this.history; }
  async createShippingJob(job: ShippingJob) { if ([...this.jobs.values()].some((item) => item.createdBy.toLowerCase() === job.createdBy.toLowerCase() && ["queued", "processing"].includes(item.status))) return false; this.jobs.set(job.jobId, structuredClone(job)); return true; }
  async updateShippingJob(job: ShippingJob) { this.jobs.set(job.jobId, structuredClone(job)); }
  async getShippingJob(jobId: string) { const job = this.jobs.get(jobId); return job ? structuredClone(job) : undefined; }
  async getActiveShippingJob(username: string) { const job = [...this.jobs.values()].find((item) => item.createdBy.toLowerCase() === username.toLowerCase() && ["queued", "processing"].includes(item.status)); return job ? structuredClone(job) : undefined; }
  async getPendingShippingJobs() { return [...this.jobs.values()].filter((job) => ["queued", "processing"].includes(job.status)).map((job) => structuredClone(job)); }
}

const config = {
  jwtSecret: "test-secret-that-is-long-enough-for-tests",
  clientOrigin: "http://localhost:5173",
  databaseUrl: "postgresql://unused-in-unit-tests",
  databaseSsl: false,
  mockMode: true,
  nimbusApiUrl: "https://api-v2.nimbuspost.com",
  nimbusApiKey: "",
  nimbusApiSecret: "",
  maxLookupPages: 2,
};
const makeApp = () => createApp(config, new MemoryStore());
async function login(app: Awaited<ReturnType<typeof makeApp>>) { const response = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123" }); return response.body.token as string; }
async function waitForJob(app: Awaited<ReturnType<typeof makeApp>>, token: string, jobId: string) { for (let attempt = 0; attempt < 30; attempt++) { const response = await request(app).get(`/api/shipping-jobs/${jobId}`).set("Authorization", `Bearer ${token}`); if (["completed", "failed"].includes(response.body.job.status)) return response.body.job as ShippingJob; await new Promise((resolve) => setTimeout(resolve, 30)); } throw new Error("Job did not finish in time"); }

describe("AutoShip API", () => {
  it("authenticates the seeded demo admin", async () => { const app = await makeApp(); const response = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123" }); expect(response.status).toBe(200); expect(response.body.user.role).toBe("admin"); expect(response.body.token).toBeTruthy(); });
  it("creates only non-admin accounts and signs them in", async () => { const app = await makeApp(); const response = await request(app).post("/api/auth/register").send({ username: "new.packer", password: "a secure passphrase", role: "admin" }); expect(response.status).toBe(201); expect(response.body.user).toEqual({ username: "new.packer", role: "packer" }); expect(response.body.token).toBeTruthy(); const history = await request(app).get("/api/history").set("Authorization", `Bearer ${response.body.token}`); expect(history.status).toBe(200); const settings = await request(app).get("/api/settings/status").set("Authorization", `Bearer ${response.body.token}`); expect(settings.status).toBe(403); const loginResponse = await request(app).post("/api/auth/login").send({ username: "NEW.PACKER", password: "a secure passphrase" }); expect(loginResponse.status).toBe(200); expect(loginResponse.body.user.role).toBe("packer"); });
  it("rejects invalid and duplicate registrations", async () => { const app = await makeApp(); const weak = await request(app).post("/api/auth/register").send({ username: "ok-user", password: "too-short" }); expect(weak.status).toBe(400); const first = await request(app).post("/api/auth/register").send({ username: "ok-user", password: "a secure passphrase" }); expect(first.status).toBe(201); const duplicate = await request(app).post("/api/auth/register").send({ username: "OK-USER", password: "another secure passphrase" }); expect(duplicate.status).toBe(400); });
  it("rejects an invalid order batch", async () => { const app = await makeApp(); const token = await login(app); const response = await request(app).post("/api/ship-bulk").set("Authorization", `Bearer ${token}`).send({ orderNumbers: ["NOT-AN-ORDER"] }); expect(response.status).toBe(400); });
  it("ships a partial batch and stores its history", async () => { const app = await makeApp(); const token = await login(app); const shipped = await request(app).post("/api/ship-bulk").set("Authorization", `Bearer ${token}`).send({ orderNumbers: ["RBD4023", "RBD4030", "RBD4035", "RBD4044"] }); expect(shipped.status).toBe(200); expect(shipped.body.totalShipped).toBe(2); expect(shipped.body.totalFailed).toBe(2); expect(shipped.body.shipped[1].alreadyBooked).toBe(true); expect(shipped.body.labelUrl).toContain("/demo-labels"); const history = await request(app).get("/api/history").set("Authorization", `Bearer ${token}`); expect(history.body.batches).toHaveLength(1); expect(history.body.batches[0].batchId).toBe(shipped.body.batchId); });
  it("runs a persistent job with progress logs and prevents a second active job", async () => { const app = await makeApp(); const token = await login(app); const started = await request(app).post("/api/shipping-jobs").set("Authorization", `Bearer ${token}`).send({ orderNumbers: ["RBD4023", "#RBD4030", "RBD4035", "#RBD4044"] }); expect(started.status).toBe(202); expect(started.body.job.orderNumbers[0]).toBe("#RBD4023"); const duplicate = await request(app).post("/api/shipping-jobs").set("Authorization", `Bearer ${token}`).send({ orderNumbers: ["RBD4050"] }); expect(duplicate.status).toBe(409); const job = await waitForJob(app, token, started.body.job.jobId); expect(job.status).toBe("completed"); expect(job.processed).toBe(4); expect(job.shipped).toHaveLength(2); expect(job.failed).toHaveLength(2); expect(job.logs.some((log) => log.level === "success")).toBe(true); expect(job.logs.some((log) => log.level === "error" && log.orderNumber === "#RBD4030")).toBe(true); expect(job.result?.totalFailed).toBe(2); });
  it("requires authentication for shipping", async () => { const app = await makeApp(); const response = await request(app).post("/api/ship-bulk").send({ orderNumbers: ["RBD4023"] }); expect(response.status).toBe(401); });
});

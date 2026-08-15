import { afterAll, describe, expect, it } from "vitest";
import { PostgresStore } from "./store.js";
import bcrypt from "bcryptjs";
import type { Batch, ShippingJob, SupportTicket } from "./types.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const store = databaseUrl ? new PostgresStore(databaseUrl, false, true) : undefined;

describeWithPostgres("PostgresStore", () => {
  afterAll(async () => { await store?.close(); });

  it("creates the schema and persists users, cache entries, and shipping batches", async () => {
    await store!.init();
    expect((await store!.findUser("ADMIN"))?.role).toBe("admin");
    const username = `packer-${Date.now()}`;
    const passwordHash = await bcrypt.hash("integration-test-password", 4);
    expect((await store!.createUser(username, passwordHash, "packer"))?.role).toBe("packer");
    expect(await store!.createUser(username.toUpperCase(), passwordHash, "packer")).toBeUndefined();

    await store!.cacheOrder("RBD9001", "ORD-9001");
    expect(await store!.getOrderId("RBD9001")).toBe("ORD-9001");

    const batch: Batch = {
      batchId: "a7a07cd1-2e8b-46d7-8e32-e723dcae79f7",
      createdAt: new Date().toISOString(),
      shippedBy: "admin",
      shipped: [],
      failed: [],
      labelUrl: null,
      totalShipped: 0,
      totalFailed: 0,
      demoMode: true,
    };
    await store!.addBatch(batch);
    expect((await store!.getHistory())[0].batchId).toBe(batch.batchId);

    const now = new Date().toISOString();
    const job: ShippingJob = { jobId: crypto.randomUUID(), createdAt: now, updatedAt: now, createdBy: username, status: "queued", orderNumbers: ["RBD9001"], processed: 0, total: 1, shipped: [], failed: [], labelUrl: null, logs: [] };
    expect(await store!.createShippingJob(job)).toBe(true);
    expect((await store!.getActiveShippingJob(username))?.jobId).toBe(job.jobId);
    job.status = "completed"; job.updatedAt = new Date().toISOString(); await store!.updateShippingJob(job);
    expect((await store!.getShippingJob(job.jobId))?.status).toBe("completed");

    const phone = `9${String(Date.now()).slice(-9)}`;
    expect(await store!.addWhatsAppMessage({ phone, direction: "inbound", text: "track RBD9001", providerMessageId: `test-${Date.now()}` })).toBe(true);
    await store!.saveConversation({ phone, intent: "order_status", step: "waiting_order", context: {} });
    expect((await store!.getConversation(phone))?.intent).toBe("order_status");
    const ticket: SupportTicket = { ticketId: crypto.randomUUID(), phone, orderNumber: "#RBD9001", category: "other", status: "open", createdAt: new Date().toISOString() };
    await store!.createSupportTicket(ticket);
    expect((await store!.getSupportOverview()).tickets.some((item) => item.ticketId === ticket.ticketId)).toBe(true);
    expect(await store!.updateSupportTicket(ticket.ticketId, "resolved")).toBe(true);
    await store!.clearConversation(phone);
    expect(await store!.getConversation(phone)).toBeUndefined();
  });
});

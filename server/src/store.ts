import bcrypt from "bcryptjs";
import pg from "pg";
import type { Batch, Role, ShippingJob, SupportConversation, SupportIntent, SupportOverview, SupportTicket, SupportTicketStatus, UserRecord, WhatsAppMessage } from "./types.js";

const { Pool } = pg;

export interface Store {
  init(): Promise<void>;
  findUser(username: string): Promise<UserRecord | undefined>;
  createUser(username: string, passwordHash: string, role: Role): Promise<UserRecord | undefined>;
  getOrderId(orderNumber: string): Promise<string | undefined>;
  cacheOrder(orderNumber: string, orderId: string): Promise<void>;
  addBatch(batch: Batch): Promise<void>;
  getHistory(): Promise<Batch[]>;
  createShippingJob(job: ShippingJob): Promise<boolean>;
  updateShippingJob(job: ShippingJob): Promise<void>;
  getShippingJob(jobId: string): Promise<ShippingJob | undefined>;
  getActiveShippingJob(username: string): Promise<ShippingJob | undefined>;
  getPendingShippingJobs(): Promise<ShippingJob[]>;
  withConversationLock<T>(phone: string, task: () => Promise<T>): Promise<T>;
  addWhatsAppMessage(message: Omit<WhatsAppMessage, "id" | "createdAt">): Promise<boolean>;
  getConversation(phone: string): Promise<SupportConversation | undefined>;
  saveConversation(conversation: Omit<SupportConversation, "updatedAt" | "expiresAt">): Promise<void>;
  clearConversation(phone: string): Promise<void>;
  createSupportTicket(ticket: SupportTicket): Promise<void>;
  updateSupportTicket(ticketId: string, status: SupportTicketStatus): Promise<boolean>;
  getSupportOverview(): Promise<SupportOverview>;
}

export class PostgresStore implements Store {
  private readonly pool: pg.Pool;
  private readonly conversationLockPool: pg.Pool;

  constructor(databaseUrl: string, ssl: boolean, private readonly demoMode: boolean, private readonly initialPassword?: string) {
    const sslConfig = ssl ? { rejectUnauthorized: false } : false;
    this.pool = new Pool({ connectionString: databaseUrl, ssl: sslConfig, max: 10 });
    this.conversationLockPool = new Pool({ connectionString: databaseUrl, ssl: sslConfig, max: 4 });
    this.pool.on("error", (error) => console.error("PostgreSQL pool error", error.message));
    this.conversationLockPool.on("error", (error) => console.error("PostgreSQL conversation-lock pool error", error.message));
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        username_normalized TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'packer')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS order_cache (
        order_number TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS shipping_batches (
        batch_id UUID PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL,
        shipped_by TEXT NOT NULL,
        payload JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS shipping_batches_created_at_idx ON shipping_batches (created_at DESC);
      CREATE TABLE IF NOT EXISTS shipping_jobs (
        job_id UUID PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        created_by TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
        payload JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS shipping_jobs_active_idx ON shipping_jobs (created_by, updated_at DESC) WHERE status IN ('queued', 'processing');
      CREATE UNIQUE INDEX IF NOT EXISTS shipping_jobs_one_active_per_user_idx ON shipping_jobs (LOWER(created_by)) WHERE status IN ('queued', 'processing');
      CREATE TABLE IF NOT EXISTS wa_messages (
        id BIGSERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
        message_text TEXT NOT NULL,
        intent TEXT,
        order_number TEXT,
        provider_message_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS wa_messages_provider_id_idx ON wa_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS wa_messages_phone_idx ON wa_messages (phone, created_at DESC);
      CREATE INDEX IF NOT EXISTS wa_messages_created_at_idx ON wa_messages (created_at DESC);
      CREATE TABLE IF NOT EXISTS wa_conversations (
        phone TEXT PRIMARY KEY,
        intent TEXT,
        step TEXT NOT NULL,
        context JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS wa_conversations_expires_idx ON wa_conversations (expires_at);
      CREATE TABLE IF NOT EXISTS support_tickets (
        ticket_id UUID PRIMARY KEY,
        phone TEXT NOT NULL,
        order_number TEXT,
        category TEXT NOT NULL CHECK (category IN ('refund', 'return', 'missing', 'other')),
        description TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS support_tickets_status_created_idx ON support_tickets (status, created_at DESC);
      UPDATE wa_conversations
      SET expires_at = updated_at + INTERVAL '24 hours'
      WHERE expires_at < updated_at + INTERVAL '24 hours';
    `);
    const { rows: [{ count }] } = await this.pool.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM users");
    if (count === 0) {
      const password = this.initialPassword || (this.demoMode ? "admin123" : "");
      if (!password) throw new Error("INITIAL_ADMIN_PASSWORD is required for first production startup");
      if (!this.demoMode && ["admin123", "replace-before-production"].includes(password)) throw new Error("INITIAL_ADMIN_PASSWORD must be changed before the first production startup");
      await this.pool.query(
        "INSERT INTO users (username, username_normalized, password_hash, role) VALUES ($1, $2, $3, 'admin') ON CONFLICT (username_normalized) DO NOTHING",
        ["admin", "admin", await bcrypt.hash(password, 12)],
      );
    }
  }

  async findUser(username: string) {
    const { rows } = await this.pool.query<{ id: string; username: string; password_hash: string; role: "admin" | "packer" }>(
      "SELECT id, username, password_hash, role FROM users WHERE username_normalized = $1 LIMIT 1",
      [username.toLowerCase()],
    );
    const user = rows[0];
    return user ? { id: Number(user.id), username: user.username, passwordHash: user.password_hash, role: user.role } : undefined;
  }

  async createUser(username: string, passwordHash: string, role: Role) {
    const { rows } = await this.pool.query<{ id: string; username: string; password_hash: string; role: Role }>(
      `INSERT INTO users (username, username_normalized, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username_normalized) DO NOTHING
       RETURNING id, username, password_hash, role`,
      [username, username.toLowerCase(), passwordHash, role],
    );
    const user = rows[0];
    return user ? { id: Number(user.id), username: user.username, passwordHash: user.password_hash, role: user.role } : undefined;
  }

  async getOrderId(orderNumber: string) {
    const { rows } = await this.pool.query<{ order_id: string }>("SELECT order_id FROM order_cache WHERE order_number = $1", [orderNumber]);
    return rows[0]?.order_id;
  }

  async cacheOrder(orderNumber: string, orderId: string) {
    await this.pool.query(
      "INSERT INTO order_cache (order_number, order_id) VALUES ($1, $2) ON CONFLICT (order_number) DO UPDATE SET order_id = EXCLUDED.order_id, updated_at = NOW()",
      [orderNumber, orderId],
    );
  }

  async addBatch(batch: Batch) {
    await this.pool.query(
      "INSERT INTO shipping_batches (batch_id, created_at, shipped_by, payload) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (batch_id) DO NOTHING",
      [batch.batchId, batch.createdAt, batch.shippedBy, JSON.stringify(batch)],
    );
  }

  async getHistory() {
    const { rows } = await this.pool.query<{ payload: Batch }>("SELECT payload FROM shipping_batches ORDER BY created_at DESC");
    return rows.map(({ payload }) => payload);
  }

  async createShippingJob(job: ShippingJob) {
    const result = await this.pool.query(
      "INSERT INTO shipping_jobs (job_id, created_at, updated_at, created_by, status, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb) ON CONFLICT DO NOTHING",
      [job.jobId, job.createdAt, job.updatedAt, job.createdBy, job.status, JSON.stringify(job)],
    );
    return result.rowCount === 1;
  }

  async updateShippingJob(job: ShippingJob) {
    await this.pool.query(
      "UPDATE shipping_jobs SET updated_at = $2, status = $3, payload = $4::jsonb WHERE job_id = $1",
      [job.jobId, job.updatedAt, job.status, JSON.stringify(job)],
    );
  }

  async getShippingJob(jobId: string) {
    const { rows } = await this.pool.query<{ payload: ShippingJob }>("SELECT payload FROM shipping_jobs WHERE job_id = $1", [jobId]);
    return rows[0]?.payload;
  }

  async getActiveShippingJob(username: string) {
    const { rows } = await this.pool.query<{ payload: ShippingJob }>(
      "SELECT payload FROM shipping_jobs WHERE created_by = $1 AND status IN ('queued', 'processing') ORDER BY updated_at DESC LIMIT 1",
      [username],
    );
    return rows[0]?.payload;
  }

  async getPendingShippingJobs() {
    const { rows } = await this.pool.query<{ payload: ShippingJob }>("SELECT payload FROM shipping_jobs WHERE status IN ('queued', 'processing') ORDER BY created_at ASC");
    return rows.map(({ payload }) => payload);
  }

  async withConversationLock<T>(phone: string, task: () => Promise<T>) {
    const client = await this.conversationLockPool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext($1))", [phone]);
      return await task();
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [phone]).catch(() => undefined);
      client.release();
    }
  }

  async addWhatsAppMessage(message: Omit<WhatsAppMessage, "id" | "createdAt">) {
    const result = await this.pool.query(
      `INSERT INTO wa_messages (phone, direction, message_text, intent, order_number, provider_message_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING`,
      [message.phone, message.direction, message.text, message.intent || null, message.orderNumber || null, message.providerMessageId || null],
    );
    return result.rowCount === 1;
  }

  async getConversation(phone: string) {
    const { rows } = await this.pool.query<{ phone: string; intent: SupportIntent | null; step: SupportConversation["step"]; context: Record<string, unknown>; updated_at: Date; expires_at: Date }>(
      "SELECT phone, intent, step, context, updated_at, expires_at FROM wa_conversations WHERE phone = $1 AND expires_at > NOW()",
      [phone],
    );
    const row = rows[0];
    return row ? { phone: row.phone, ...(row.intent ? { intent: row.intent } : {}), step: row.step, context: row.context, updatedAt: row.updated_at.toISOString(), expiresAt: row.expires_at.toISOString() } : undefined;
  }

  async saveConversation(conversation: Omit<SupportConversation, "updatedAt" | "expiresAt">) {
    await this.pool.query(
      `INSERT INTO wa_conversations (phone, intent, step, context, updated_at, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW() + INTERVAL '24 hours')
       ON CONFLICT (phone) DO UPDATE SET intent = EXCLUDED.intent, step = EXCLUDED.step, context = EXCLUDED.context, updated_at = NOW(), expires_at = NOW() + INTERVAL '24 hours'`,
      [conversation.phone, conversation.intent || null, conversation.step, JSON.stringify(conversation.context)],
    );
  }

  async clearConversation(phone: string) { await this.pool.query("DELETE FROM wa_conversations WHERE phone = $1", [phone]); }

  async createSupportTicket(ticket: SupportTicket) {
    await this.pool.query(
      `INSERT INTO support_tickets (ticket_id, phone, order_number, category, description, status, created_at, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (ticket_id) DO NOTHING`,
      [ticket.ticketId, ticket.phone, ticket.orderNumber || null, ticket.category, ticket.description || null, ticket.status, ticket.createdAt, ticket.resolvedAt || null],
    );
  }

  async updateSupportTicket(ticketId: string, status: SupportTicketStatus) {
    const result = await this.pool.query(
      "UPDATE support_tickets SET status = $2, resolved_at = CASE WHEN $2 = 'resolved' THEN NOW() ELSE NULL END WHERE ticket_id = $1",
      [ticketId, status],
    );
    return result.rowCount === 1;
  }

  async getSupportOverview(): Promise<SupportOverview> {
    const [messageResult, ticketResult, conversationResult, statsResult] = await Promise.all([
      this.pool.query<{ id: string; phone: string; direction: WhatsAppMessage["direction"]; message_text: string; intent: SupportIntent | null; order_number: string | null; provider_message_id: string | null; created_at: Date }>(
        "SELECT id, phone, direction, message_text, intent, order_number, provider_message_id, created_at FROM wa_messages ORDER BY created_at DESC LIMIT 200",
      ),
      this.pool.query<{ ticket_id: string; phone: string; order_number: string | null; category: SupportTicket["category"]; description: string | null; status: SupportTicketStatus; created_at: Date; resolved_at: Date | null }>(
        "SELECT ticket_id, phone, order_number, category, description, status, created_at, resolved_at FROM support_tickets ORDER BY created_at DESC LIMIT 100",
      ),
      this.pool.query<{ phone: string; intent: SupportIntent | null; step: SupportConversation["step"]; context: Record<string, unknown>; updated_at: Date; expires_at: Date }>(
        "SELECT phone, intent, step, context, updated_at, expires_at FROM wa_conversations WHERE expires_at > NOW() ORDER BY updated_at DESC LIMIT 100",
      ),
      this.pool.query<{ inbound_today: number; outbound_today: number; active_conversations: number; open_tickets: number }>(
        `SELECT
          (SELECT COUNT(*)::int FROM wa_messages WHERE direction = 'inbound' AND created_at >= CURRENT_DATE) AS inbound_today,
          (SELECT COUNT(*)::int FROM wa_messages WHERE direction = 'outbound' AND created_at >= CURRENT_DATE) AS outbound_today,
          (SELECT COUNT(*)::int FROM wa_conversations WHERE expires_at > NOW()) AS active_conversations,
          (SELECT COUNT(*)::int FROM support_tickets WHERE status = 'open') AS open_tickets`,
      ),
    ]);
    const stats = statsResult.rows[0];
    return {
      messages: messageResult.rows.map((row) => ({ id: row.id, phone: row.phone, direction: row.direction, text: row.message_text, ...(row.intent ? { intent: row.intent } : {}), ...(row.order_number ? { orderNumber: row.order_number } : {}), ...(row.provider_message_id ? { providerMessageId: row.provider_message_id } : {}), createdAt: row.created_at.toISOString() })),
      tickets: ticketResult.rows.map((row) => ({ ticketId: row.ticket_id, phone: row.phone, ...(row.order_number ? { orderNumber: row.order_number } : {}), category: row.category, ...(row.description ? { description: row.description } : {}), status: row.status, createdAt: row.created_at.toISOString(), ...(row.resolved_at ? { resolvedAt: row.resolved_at.toISOString() } : {}) })),
      conversations: conversationResult.rows.map((row) => ({ phone: row.phone, ...(row.intent ? { intent: row.intent } : {}), step: row.step, context: row.context, updatedAt: row.updated_at.toISOString(), expiresAt: row.expires_at.toISOString() })),
      stats: { inboundToday: stats.inbound_today, outboundToday: stats.outbound_today, activeConversations: stats.active_conversations, openTickets: stats.open_tickets },
    };
  }

  async close() { await Promise.all([this.pool.end(), this.conversationLockPool.end()]); }
}

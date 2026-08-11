import bcrypt from "bcryptjs";
import pg from "pg";
import type { Batch, Role, ShippingJob, UserRecord } from "./types.js";

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
}

export class PostgresStore implements Store {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string, ssl: boolean, private readonly demoMode: boolean, private readonly initialPassword?: string) {
    this.pool = new Pool({ connectionString: databaseUrl, ssl: ssl ? { rejectUnauthorized: false } : false, max: 10 });
    this.pool.on("error", (error) => console.error("PostgreSQL pool error", error.message));
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
    `);
    const { rows: [{ count }] } = await this.pool.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM users");
    if (count === 0) {
      const password = this.initialPassword || (this.demoMode ? "admin123" : "");
      if (!password) throw new Error("INITIAL_ADMIN_PASSWORD is required for first production startup");
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

  async close() { await this.pool.end(); }
}

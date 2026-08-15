export type Role = "admin" | "packer";
export type User = { username: string; role: Role };
export type ShippedOrder = { orderNumber: string; orderId: string; awb: string; courier: string; cost: number; alreadyBooked?: boolean };
export type FailedOrder = { orderNumber: string; error: string; code: string };
export type ShippingLog = { at: string; level: "info" | "success" | "error"; message: string; orderNumber?: string };
export type ShipResult = { shipped: ShippedOrder[]; failed: FailedOrder[]; labelUrl: string | null; totalShipped: number; totalFailed: number; batchId: string; demoMode: boolean; logs?: ShippingLog[] };
export type HistoryItem = ShipResult & { createdAt: string; shippedBy: string };
export type ShippingJob = { jobId: string; createdAt: string; updatedAt: string; createdBy: string; status: "queued" | "processing" | "completed" | "failed"; orderNumbers: string[]; processed: number; total: number; shipped: ShippedOrder[]; failed: FailedOrder[]; labelUrl: string | null; logs: ShippingLog[]; error?: string; result?: ShipResult };
export type SupportIntent = "confirm_order" | "change_address" | "order_status" | "not_dispatched" | "order_failed" | "refund_return";
export type WhatsAppMessage = { id: string; phone: string; direction: "inbound" | "outbound"; text: string; intent?: SupportIntent; orderNumber?: string; createdAt: string };
export type SupportTicket = { ticketId: string; phone: string; orderNumber?: string; category: "refund" | "return" | "missing" | "other"; description?: string; status: "open" | "resolved"; createdAt: string; resolvedAt?: string };
export type SupportConversation = { phone: string; intent?: SupportIntent; step: string; updatedAt: string; expiresAt: string };
export type SupportOverview = { messages: WhatsAppMessage[]; tickets: SupportTicket[]; conversations: SupportConversation[]; stats: { inboundToday: number; outboundToday: number; activeConversations: number; openTickets: number }; connections: { whatsapp: boolean; shopify: boolean; nimbus: boolean } };

const TOKEN_KEY = "autoship_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Something went wrong. Please try again.");
  return body;
}

export const api = {
  login: (username: string, password: string) => request<{ token: string; user: User; demoMode: boolean }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (username: string, password: string) => request<{ token: string; user: User; demoMode: boolean }>("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => request<{ user: User; demoMode: boolean }>("/api/auth/me"),
  ship: (orderNumbers: string[]) => request<ShipResult>("/api/ship-bulk", { method: "POST", body: JSON.stringify({ orderNumbers }) }),
  startShipping: (orderNumbers: string[]) => request<{ job: ShippingJob }>("/api/shipping-jobs", { method: "POST", body: JSON.stringify({ orderNumbers }) }),
  shippingJob: (jobId: string) => request<{ job: ShippingJob }>(`/api/shipping-jobs/${encodeURIComponent(jobId)}`),
  activeShippingJob: () => request<{ job: ShippingJob | null }>("/api/shipping-jobs/active"),
  history: () => request<{ batches: HistoryItem[] }>("/api/history"),
  status: () => request<{ connected: boolean; demoMode: boolean; apiUrl: string; database: string }>("/api/settings/status"),
  supportOverview: () => request<SupportOverview>("/api/support/overview"),
  updateSupportTicket: (ticketId: string, status: SupportTicket["status"]) => request<{ updated: boolean }>(`/api/support/tickets/${encodeURIComponent(ticketId)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
};

export function normalizeOrder(value: string) {
  const normalized = value.trim().replace(/^#/, "").toUpperCase();
  return /^RBD\d+$/.test(normalized) ? `#${normalized}` : null;
}

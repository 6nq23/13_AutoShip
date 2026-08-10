import { afterEach, describe, expect, it, vi } from "vitest";
import { COURIER_PRIORITY, NimbusClient } from "./nimbus.js";
import type { NimbusProgressEvent } from "./types.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const makeClient = () => new NimbusClient(
  { apiUrl: "https://nimbus.test", apiKey: "key", apiSecret: "secret", maxPages: 2, mockMode: false },
  { getOrderId: async () => undefined, cacheOrder: async () => undefined },
);

afterEach(() => vi.unstubAllGlobals());

describe("Nimbus courier priority", () => {
  it("pins each courier_id in order and stops after the first success", async () => {
    const bookingBodies: Array<Record<string, string>> = []; const events: NimbusProgressEvent[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v2/orders?")) return json({ success: true, data: [{ order_id: "ORD-24", order_number: "#RBD4024", order_status: "pending" }] });
      if (url.endsWith("/v2/shipments/book")) {
        const body = JSON.parse(String(init?.body)) as Record<string, string>; bookingBodies.push(body);
        if (bookingBodies.length === 1) return json({ error: { code: "NO_SERVICEABLE_COURIER", detail: "Not serviceable" } }, 400);
        return json({ success: true, data: { awb: "AWB-24", courier_name: "Bluedart Brand", price: { total: 92 } } });
      }
      if (url.endsWith("/v2/shipments/labels")) return json({ success: true, data: { url: "https://labels.test/24.pdf" } });
      throw new Error(`Unexpected request: ${url}`);
    }));

    const result = await makeClient().shipMany(["#RBD4024"], 1, async (event) => { events.push(event); });
    expect(bookingBodies).toEqual([
      { order_id: "ORD-24", courier_id: COURIER_PRIORITY[0].courierId },
      { order_id: "ORD-24", courier_id: COURIER_PRIORITY[1].courierId },
    ]);
    expect(bookingBodies.every((body) => !("role_id" in body))).toBe(true);
    expect(result.shipped[0].courier).toBe("Bluedart Brand");
    expect(events.filter((event) => event.type === "courier_attempt")).toHaveLength(2);
    expect(events.some((event) => event.type === "courier_rejected" && event.priority === 1)).toBe(true);
  });

  it("tries each configured courier once and then returns a bounded failure", async () => {
    const bookingIds: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v2/orders?")) return json({ success: true, data: [{ order_id: "ORD-35", order_number: "#RBD4035", order_status: "pending" }] });
      if (url.endsWith("/v2/shipments/book")) { const body = JSON.parse(String(init?.body)) as { courier_id: string }; bookingIds.push(body.courier_id); return json({ error: { code: "NO_SERVICEABLE_COURIER", detail: "Not serviceable" } }, 400); }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const result = await makeClient().shipMany(["#RBD4035"], 1);
    expect(bookingIds).toEqual(COURIER_PRIORITY.map((courier) => courier.courierId));
    expect(new Set(bookingIds).size).toBe(COURIER_PRIORITY.length);
    expect(result.failed).toEqual([{ orderNumber: "#RBD4035", code: "COURIER_PRIORITY_EXHAUSTED", error: expect.stringContaining(`All ${COURIER_PRIORITY.length} priority couriers rejected`) }]);
  });

  it("processes a bulk batch with at most five orders concurrently", async () => {
    let activeBookings = 0; let maximumActiveBookings = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/v2/orders") { const orderNumber = url.searchParams.get("order_number")!; return json({ success: true, data: [{ order_id: `ORD-${orderNumber.slice(4)}`, order_number: orderNumber, order_status: "pending" }] }); }
      if (url.pathname === "/v2/shipments/book") { activeBookings++; maximumActiveBookings = Math.max(maximumActiveBookings, activeBookings); await new Promise((resolve) => setTimeout(resolve, 30)); activeBookings--; return json({ success: true, data: { awb: "AWB", courier_name: "Delhivery Surface DT", price: { total: 75 } } }); }
      if (url.pathname === "/v2/shipments/labels") return json({ success: true, data: { url: "https://labels.test/bulk.pdf" } });
      throw new Error(`Unexpected request: ${url}`);
    }));

    const orders = Array.from({ length: 7 }, (_, index) => `#RBD50${index}`);
    const result = await makeClient().shipMany(orders, 5);
    expect(result.shipped).toHaveLength(7);
    expect(maximumActiveBookings).toBe(5);
  });

  it("uses the live order_ids label contract and falls back to ids when required", async () => {
    const labelBodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v2/orders?")) return json({ success: true, data: [{ order_id: "ORD-51", order_number: "#RBD51", order_status: "booked", shipment: { awb: "AWB-51", courier_name: "Delhivery" } }] });
      if (url.endsWith("/v2/shipments/labels")) { const body = JSON.parse(String(init?.body)); labelBodies.push(body); if (labelBodies.length === 1) return json({ error: { code: "VALIDATION_FAILED", detail: "ids: expected array" } }, 400); return json({ success: true, data: { url: "https://labels.test/51.pdf" } }); }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const result = await makeClient().shipMany(["#RBD51"], 1);
    expect(labelBodies).toEqual([{ order_ids: ["ORD-51"] }, { ids: ["ORD-51"] }]);
    expect(result.labelUrl).toBe("https://labels.test/51.pdf");
  });
});

import { describe, expect, it, vi } from "vitest";
import type { NimbusClient } from "./nimbus.js";
import type { ShopifyClient } from "./shopify.js";
import type { Store } from "./store.js";
import type { WhatsAppClient } from "./whatsapp.js";
import { WhatsAppRouter, classifyIntent, extractOrderNumber, extractPhoneNumber, parseAddress, refundCategory } from "./whatsapp-router.js";

describe("WhatsApp support parsing", () => {
  it("classifies clear English and Hinglish messages without an LLM", () => {
    expect(classifyIntent("mera order kaha hai RBD5001")).toBe("order_status");
    expect(classifyIntent("address galat hai change karna hai")).toBe("change_address");
    expect(classifyIntent("wrong item, paisa wapas chahiye")).toBe("refund_return");
    expect(classifyIntent("5")).toBe("order_failed");
    expect(classifyIntent("hello ji")).toBeUndefined();
  });

  it("extracts only valid order and phone identifiers", () => {
    expect(extractOrderNumber("track #rbd-5001 please")).toBe("#RBD5001");
    expect(extractPhoneNumber("my number is +91 98765 43210")).toBe("9876543210");
    expect(extractPhoneNumber("RBD5001")).toBeUndefined();
  });

  it("requires a structured, complete Indian address", () => {
    expect(parseAddress("14 Park Street, Kolkata, West Bengal, 700016")).toEqual({ address1: "14 Park Street", city: "Kolkata", province: "West Bengal", zip: "700016", country: "India" });
    expect(parseAddress("somewhere in Kolkata")).toBeNull();
    expect(parseAddress("14 Park Street, Kolkata, West Bengal, 7000")).toBeNull();
  });

  it("preserves refund, return, and missing-item ticket categories", () => {
    expect(refundCategory("missing item nahi aaya")).toBe("missing");
    expect(refundCategory("paisa wapas refund chahiye")).toBe("refund");
    expect(refundCategory("wrong item return karna hai")).toBe("return");
  });

  it("does not reveal an order when the WhatsApp sender phone does not match", async () => {
    const sendText = vi.fn(async () => undefined);
    const clearConversation = vi.fn(async () => undefined);
    const nimbusLookup = vi.fn();
    const router = new WhatsAppRouter({
      store: {
        addWhatsAppMessage: vi.fn(async () => true),
        getConversation: vi.fn(async () => undefined),
        clearConversation,
        withConversationLock: async (_phone: string, task: () => Promise<unknown>) => task(),
      } as unknown as Store,
      shopify: {
        getOrderByName: vi.fn(async () => ({
          id: "gid://shopify/Order/5001",
          name: "#RBD5001",
          createdAt: new Date().toISOString(),
          totalAmount: "499.00",
          currencyCode: "INR",
          customerPhones: ["9876543210"],
          lineItems: [{ title: "Rakhi Set", quantity: 1 }],
        })),
      } as unknown as ShopifyClient,
      nimbus: { lookupOrder: nimbusLookup } as unknown as NimbusClient,
      whatsapp: { sendText } as unknown as WhatsAppClient,
      supportPhone: "9999999999",
    });

    await router.handleIncomingMessage({ id: "wa-unauthorized-1", phone: "911111111111", text: "track RBD5001" });

    expect(nimbusLookup).not.toHaveBeenCalled();
    expect(clearConversation).toHaveBeenCalledWith("911111111111");
    expect(sendText.mock.calls[0]?.[1]).toContain("couldn't verify");
    expect(sendText.mock.calls[0]?.[1]).not.toContain("#RBD5001");
  });

  it("does not offer NDR actions when Nimbus explicitly returns none", async () => {
    const sendText = vi.fn(async () => undefined);
    const saveConversation = vi.fn(async () => undefined);
    const router = new WhatsAppRouter({
      store: {
        addWhatsAppMessage: vi.fn(async () => true), getConversation: vi.fn(async () => undefined), clearConversation: vi.fn(async () => undefined), saveConversation,
        withConversationLock: async (_phone: string, task: () => Promise<unknown>) => task(),
      } as unknown as Store,
      shopify: { getOrderByName: vi.fn(async () => ({ id: "gid://shopify/Order/5001", name: "#RBD5001", createdAt: new Date().toISOString(), totalAmount: "499", currencyCode: "INR", customerPhones: ["9876543210"], lineItems: [] })) } as unknown as ShopifyClient,
      nimbus: { lookupOrder: vi.fn(async () => ({ order_id: "ORD-1", order_number: "#RBD5001", order_status: "ndr", shipment: { awb: "AWB-1" } })), getNdr: vi.fn(async () => ({ awb: "AWB-1", available_actions: [] })) } as unknown as NimbusClient,
      whatsapp: { sendText } as unknown as WhatsAppClient,
      supportPhone: "9999999999",
    });

    await router.handleIncomingMessage({ id: "wa-no-actions", phone: "919876543210", text: "delivery failed RBD5001" });

    expect(saveConversation).not.toHaveBeenCalled();
    expect(sendText.mock.calls[0]?.[1]).toContain("not provided an available recovery action");
  });
});

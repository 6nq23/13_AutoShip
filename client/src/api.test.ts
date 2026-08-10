import { describe, expect, it } from "vitest";
import { normalizeOrder } from "./api";

describe("normalizeOrder", () => {
  it("normalizes supported QR values", () => {
    expect(normalizeOrder(" #rbd4023 ")).toBe("#RBD4023");
    expect(normalizeOrder("#RBD4023")).toBe("#RBD4023");
    expect(normalizeOrder("RBD4023")).toBe("#RBD4023");
  });
  it("rejects non-order QR values", () => {
    expect(normalizeOrder("https://example.com")).toBeNull();
    expect(normalizeOrder("RBD-4023")).toBeNull();
  });
});

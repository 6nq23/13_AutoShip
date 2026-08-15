# AutoShip WhatsApp Customer Support Automation

## Problem

~1,000 WhatsApp customer inquiries per day across 6 categories, all handled manually. Customers write in many different ways (Hindi, English, Hinglish, typos, abbreviations) and often don't have their order number handy.

---

## Core Design: Menu-First, Then Collect Details

Instead of trying to be clever about guessing what the customer wants from a messy first message, the bot follows a **simple, reliable 3-step flow**:

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 1: Understand the intent                                   │
│                                                                   │
│  Try keyword detection on the first message.                     │
│  ✅ Keywords matched → jump to Step 2                            │
│  ❌ Not understood  → show numbered menu:                        │
│                                                                   │
│    "Namaste! 🙏 How can we help you?                             │
│     Reply with the number:                                       │
│     1️⃣ Confirm my order                                         │
│     2️⃣ Change address or phone number                           │
│     3️⃣ Check order status / tracking                            │
│     4️⃣ Why is my order not dispatched?                          │
│     5️⃣ My delivery failed                                      │
│     6️⃣ Refund / Return / Missing item"                         │
│                                                                   │
│  Customer replies "3" → intent = order_status                    │
├──────────────────────────────────────────────────────────────────┤
│  STEP 2: Collect the order number                                │
│                                                                   │
│  If order number was in the first message → use it               │
│  Otherwise → ask:                                                │
│    "Please share your order number (e.g. RBD5001).               │
│     If you don't have it, just send your phone number."          │
│                                                                   │
│  Customer sends "9876543210"                                     │
│  → Look up in Shopify by phone → find latest order(s)            │
│  → If multiple orders, ask which one                             │
├──────────────────────────────────────────────────────────────────┤
│  STEP 3: Handle the request + reply                              │
│                                                                   │
│  Now we have: intent + order number                              │
│  → Run the handler → send the answer                             │
│  → For refund/return: forward to human phone number              │
└──────────────────────────────────────────────────────────────────┘
```

### Why this works for your case
- **Customers who write clearly** ("Where is RBD5001?") → keyword match + order number extracted → instant answer, no menu needed
- **Customers who write messy** ("hello ji kuch puchna tha") → menu shown → they pick a number → clean intent
- **Customers without order number** → phone number fallback via Shopify lookup
- **Refund/return/missing** → collected info + forwarded to human phone number, not stuck in a bot loop

---

## The 6 Inquiry Categories & What We Can Automate

| # | Inquiry | Automation | How |
|---|---------|-----------|-----|
| 1 | **Confirm my order** | ✅ Fully auto | Shopify lookup → items, amount, status, ETA |
| 2 | **Change address/phone** | ⚠️ Depends on timing | Before dispatch: Shopify update. After dispatch (NDR): NimbusPost NDR action. In-transit: escalate |
| 3 | **Order status/tracking** | ✅ Fully auto | NimbusPost `GET /v2/tracking/{awb}` → status + location + ETA |
| 4 | **Not dispatched yet** | ✅ Fully auto | Check NimbusPost order status → give honest reason |
| 5 | **Delivery failed** | ✅ Mostly auto | NimbusPost NDR → show reason → offer re-attempt / address update / RTO |
| 6 | **Refund/return/missing** | 🔴 Human | Collect order# → forward customer to support phone number |

---

## Complete Conversation Flowcharts

### Master Flow (every message goes through this)

```
Customer sends ANY message
        │
        ▼
┌─ Has active conversation? ──────────────────────────┐
│  YES → resume where we left off (Step 2/3)          │
│  NO  → start fresh:                                 │
│        ├─ Try keyword detection on message           │
│        │   ├─ Intent found? → set intent             │
│        │   │   ├─ Order# also found? → go to Step 3  │
│        │   │   └─ No order# → go to Step 2           │
│        │   └─ Intent NOT found? → show menu (Step 1) │
│        └─ Is it a menu number (1-6)? → set intent    │
└─────────────────────────────────────────────────────┘
```

### Category 1: Confirm My Order

```
Bot: "Please share your order number (e.g. RBD5001),
      or send your phone number."
Customer: "RBD5001"
        │
        ▼
  Shopify: GET order by name "RBD5001"
  NimbusPost: resolve order → check status
        │
        ▼
Bot: "✅ Order #RBD5001 is confirmed!
      📦 Items: Rakhi Set x2, Lumba Rakhi x1
      💰 Total: ₹499 (Prepaid ✅)
      📍 Shipping to: Asha Rao, 12 MG Road, Bengaluru 560001
      🚚 Courier: Delhivery Surface
      📅 Expected delivery: 18 Aug 2026

      Need anything else? Reply with a number:
      1️⃣ Track this order
      2️⃣ Change address
      3️⃣ Something else"
```

### Category 2: Change Address/Phone

```
Bot: "Please share your order number or phone number."
Customer: "RBD5001"
        │
        ▼
  Check order status in NimbusPost
        │
        ├─ NOT yet shipped (created/booked)
        │   Bot: "Send your new complete address"
        │   Customer: "14 Park Street, Flat 2A, Kolkata 700016"
        │   Bot: "Send the new phone number (or 'same' to keep current)"
        │   Customer: "same"
        │   Bot: "Please confirm:
        │         📍 New address: 14 Park Street, Flat 2A, Kolkata 700016
        │         📱 Phone: same as before
        │         Reply YES to update or NO to cancel"
        │   Customer: "YES"
        │   → Cancel old NimbusPost order → create new with updated Shopify address
        │   Bot: "✅ Address updated! Your order will be shipped to the new address."
        │
        ├─ Shipped but delivery FAILED (NDR)
        │   → POST /v2/ndr/{awb}/action with updated_address + updated_phone
        │   Bot: "✅ Address updated! Re-delivery will be attempted."
        │
        ├─ Shipped and IN TRANSIT (no NDR)
        │   Bot: "Your order is already in transit with {courier}.
        │         Unfortunately we cannot change the address at this stage.
        │         Please contact our support: {SUPPORT_PHONE}"
        │
        └─ Already DELIVERED
            Bot: "This order was already delivered on {date}."
```

### Category 3: Order Status / Tracking

```
Bot: "Please share your order number or phone number."
Customer: "9876543210"
        │
        ▼
  Shopify: find orders by phone 9876543210
  Found 3 orders → show list:
        │
Bot: "We found these orders for your number:
      1️⃣ #RBD5001 — Rakhi Set (₹499)
      2️⃣ #RBD4998 — Lumba Rakhi (₹299)
      3️⃣ #RBD4950 — Gift Hamper (₹999)
      Reply with the number."
Customer: "1"
        │
        ▼
  NimbusPost: GET /v2/tracking/{awb}
        │
        ▼
  Reply based on latest.shipStatus:
  ├─ "booked"           → "📦 Order booked! Waiting for courier pickup."
  ├─ "picked up"        → "📦 Picked up by {courier} on {date}."
  ├─ "in transit"       → "🚚 In transit! Currently at {location}. ETA: {edd}"
  ├─ "out for delivery"  → "🎉 Out for delivery today!"
  ├─ "delivered"        → "✅ Delivered on {date}."
  ├─ "rto"/"returning"  → "↩️ Being returned. Reason: {reason}"
  └─ "ndr"              → "⚠️ Delivery attempt failed: {reason}. Reply 'reattempt' to retry."

  + tracking link: "Track live: {tracking_url}"
```

### Category 4: Not Dispatched Yet

```
Bot: "Please share your order number or phone number."
Customer: "RBD5001"
        │
        ▼
  Check Shopify fulfillment status + NimbusPost order status
        │
        ├─ Not found in NimbusPost at all
        │   Bot: "Your order is being processed by our team. 
        │         It will be shipped within 24-48 hours. 📦
        │         We'll send you tracking details once dispatched!"
        │
        ├─ Status "created" (in NimbusPost but not booked)
        │   Bot: "Your order is ready and queued for shipping!
        │         The courier will pick it up today or tomorrow. 🚛"
        │
        ├─ Status "booked" (booked, awaiting pickup)
        │   Bot: "Your order is booked with {courier}! 
        │         Courier pickup is scheduled. You'll receive
        │         tracking details shortly. 📋"
        │
        └─ Already shipped/in-transit
            → redirect to order_status handler (Category 3)
```

### Category 5: Delivery Failed

```
Bot: "Please share your order number or phone number."
Customer: "RBD5001"
        │
        ▼
  NimbusPost: GET /v2/tracking/{awb} → check status
  NimbusPost: GET /v2/ndr → find by AWB
        │
        ├─ NDR found
        │   Bot: "⚠️ Delivery was attempted on {date}.
        │         Reason: {remarks} (e.g. 'Customer not available')
        │         Attempt #{attempt_count}
        │
        │         What would you like to do?
        │         1️⃣ Re-attempt delivery
        │         2️⃣ Update my address/phone for re-delivery
        │         3️⃣ Return to sender"
        │
        │   Customer: "1"
        │   → POST /v2/ndr/{awb}/action { action: "reattempt" }
        │   Bot: "✅ Re-delivery has been scheduled! 
        │         The courier will attempt again soon."
        │
        │   Customer: "2"
        │   → enter change_address flow (Category 2, NDR branch)
        │
        │   Customer: "3"
        │   → POST /v2/ndr/{awb}/action { action: "rto" }
        │   Bot: "↩️ Return initiated. Once we receive the package,
        │         your refund will be processed.
        │         Contact {SUPPORT_PHONE} for refund queries."
        │
        └─ No NDR (order shows failed/rto in tracking but not in NDR list)
            Bot: "Your order status shows it could not be delivered.
                  Reason: {tracking reason}
                  Please contact our support team: {SUPPORT_PHONE}"
```

### Category 6: Refund / Return / Missing Item

```
Bot: "We're sorry to hear that! 😔
      Please share your order number or phone number 
      so we can look it up."
Customer: "RBD5001"
        │
        ▼
  Shopify: look up order → get details
        │
Bot: "We found your order #RBD5001 (Rakhi Set x2, ₹499).

      For refund, return, and missing item requests,
      please message our support team directly:
      📞 {SUPPORT_PHONE_NUMBER}

      When you message them, please mention:
      • Order: #RBD5001
      • Issue: [refund/return/missing]

      Our team will help you right away! 🙏"

  → Log this in support_tickets table (phone, order#, category)
  → Optionally: send a WhatsApp msg TO the support number:
    "⚠️ Customer {phone} needs help with order #RBD5001 
     (refund/return/missing). They will message you."
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   CUSTOMER (WhatsApp)                    │
│  "mera order kab aayega"                                │
└─────────────────────┬───────────────────────────────────┘
                      │ WhatsApp webhook
                      ▼
┌─────────────────────────────────────────────────────────┐
│              AUTOSHIP SERVER (Express)                    │
│                                                          │
│  POST /api/whatsapp/webhook                              │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │        Message Pipeline                            │  │
│  │                                                    │  │
│  │  1. Check for active conversation (resume)         │  │
│  │  2. Try keyword classification                     │  │
│  │  3. If unclear → show menu                         │  │
│  │  4. Once intent known → collect order number       │  │
│  │     (from msg, or ask → accept RBD# or phone)     │  │
│  │  5. Route to handler                               │  │
│  └──────────┬───────────────────────────────────────┘  │
│             │                                           │
│  ┌──────────▼───────────────────────────────────────┐  │
│  │  Handlers                                         │  │
│  │  confirm_order   → Shopify + NimbusPost lookup    │  │
│  │  change_address  → multi-step + NimbusPost/Shopify│  │
│  │  order_status    → NimbusPost tracking            │  │
│  │  not_dispatched  → NimbusPost order check         │  │
│  │  order_failed    → NimbusPost NDR + actions       │  │
│  │  refund_return   → collect order# → forward to    │  │
│  │                    SUPPORT_PHONE_NUMBER            │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  Existing:  NimbusClient  |  PostgresStore               │
└──────────┬──────────┬──────────────────────────────────┘
           │          │
     ┌─────▼──┐  ┌───▼─────────────┐
     │Shopify │  │ NimbusPost v2   │
     │  API   │  │ (existing)      │
     └────────┘  └─────────────────┘
```

---

## User Review Required

> [!IMPORTANT]
> ### WhatsApp API Provider
> Which WhatsApp Business API provider do you use?
> - **WhatsApp Cloud API (Meta)** — direct from Meta
> - **Third-party** like Gupshup, Wati, Twilio, Interakt, AiSensy, etc.

> [!IMPORTANT]
> ### Shopify API Access
> Do you have a Shopify Admin API access token? We need:
> - `Admin API access token` (starts with `shpat_`)
> - Your Shopify store URL (e.g., `your-store.myshopify.com`)

> [!IMPORTANT]
> ### Support Phone Number
> What is the phone number you want refund/return/missing queries forwarded to? This will be the number the bot tells customers to contact directly.

> [!WARNING]
> ### NimbusPost Cannot Edit Orders
> NimbusPost v2 has NO endpoint to edit an existing order. For address changes:
> - **Before shipping**: Cancel old order in NimbusPost → create new one with updated address
> - **After shipping (NDR only)**: Use `POST /v2/ndr/{awb}/action` with `updated_address`/`updated_phone`
> - **In-transit (not NDR)**: Cannot change → escalate to human

---

## Open Questions

> [!IMPORTANT]
> ### 1. WhatsApp approved templates
> Do you already have any approved WhatsApp message templates? Templates are required for sending the first message to a customer (proactive outreach). For **replies** within 24h of customer's message, we can send free-form text — which covers most of our use case.

> [!IMPORTANT]
> ### 2. Multiple orders per phone number
> When a customer sends their phone number and has multiple orders, should we:
> - A) Show a list and ask them to pick? (recommended)
> - B) Always use the most recent order?
> - C) Show status of all orders at once?

---

## Conversation State Machine

Every phone number has a conversation state tracked in PostgreSQL. States expire after 30 minutes of inactivity.

```
┌─────────────────────────────────────────────────────────┐
│                    STATES                                 │
│                                                          │
│  (none)           → fresh, no active conversation        │
│  waiting_menu     → menu shown, waiting for 1-6          │
│  waiting_order    → intent known, waiting for order#     │
│  waiting_pick     → multiple orders found, pick one      │
│  handling         → inside a handler's multi-step flow   │
│    └─ substates per handler:                             │
│       change_address: waiting_address → waiting_phone    │
│                       → waiting_confirm                  │
│       order_failed:   waiting_ndr_choice                 │
│  done             → answered, conversation cleared       │
└─────────────────────────────────────────────────────────┘
```

### Order Identification Flow (shared by all handlers)

```
Customer has no order number
        │
Bot: "Please share your order number (e.g. RBD5001).
      Don't have it? Send your phone number instead."
        │
        ├─ Customer sends "RBD5001"
        │   → regex match → resolve in Shopify/NimbusPost → proceed
        │
        ├─ Customer sends "9876543210" (10 digits)
        │   → Shopify: GET orders by phone
        │   ├─ 0 orders → "We couldn't find any orders for this number. 
        │   │              Please check and try again."
        │   ├─ 1 order  → use it, proceed
        │   └─ 2+ orders → show numbered list, ask to pick
        │
        └─ Customer sends something else
            → "Sorry, I didn't understand. Please send your order 
               number (like RBD5001) or your 10-digit phone number."
            → retry (max 3 times, then show menu again)
```

---

## Proposed Changes

### Component 1: WhatsApp Client

#### [NEW] `server/src/whatsapp.ts`

Sending messages via WhatsApp API:
- `sendText(phone, text)` — plain text reply
- `sendInteractiveButtons(phone, body, buttons[])` — for yes/no, NDR choices
- `sendListMessage(phone, body, rows[])` — for the 6-option menu
- Webhook signature verification
- Rate limiting (WhatsApp: 80 msgs/sec)

---

### Component 2: Message Router

#### [NEW] `server/src/whatsapp-router.ts`

The brain of the bot. Handles every incoming message:

```typescript
async function handleIncomingMessage(phone: string, text: string) {
  // 1. Check for active conversation
  const convo = await store.getConversation(phone);
  
  if (convo && !isExpired(convo)) {
    // Resume: we're in the middle of a flow
    return resumeConversation(convo, text);
  }

  // 2. Fresh message — try keyword classification
  const intent = classifyIntent(text);
  const orderNumber = extractOrderNumber(text);

  if (intent === "unknown") {
    // 3. Didn't understand → show menu
    await sendMenu(phone);
    await store.saveConversation(phone, { step: "waiting_menu" });
    return;
  }

  if (orderNumber) {
    // 4. Got intent + order number → handle immediately
    return routeToHandler(phone, intent, orderNumber);
  }

  // 5. Got intent but no order number → ask for it
  await askForOrderNumber(phone, intent);
  await store.saveConversation(phone, { 
    intent, step: "waiting_order" 
  });
}
```

**Keyword matching** (EN + Hindi + Hinglish):

| Intent | Keywords |
|--------|----------|
| `confirm_order` | confirm, pakka, order confirm, mera order aaya, placed, order hua |
| `change_address` | address, phone, number, change, update, badlo, galat address, wrong address |
| `order_status` | status, tracking, kaha hai, where, track, kab aayega, kab milega, kidhar |
| `not_dispatched` | dispatch, ship, sent, bheja, kab bhejoge, nahi bheja, why not shipped |
| `order_failed` | fail, failed, deliver nahi, nahi mila, attempt, undelivered, return ho gaya |
| `refund_return` | refund, return, missing, galat, wrong item, paisa wapas, nahi aaya, rakhi nahi |

If the customer just sends a number 1-6 → map to intent directly.

---

### Component 3: Intent Handlers

#### [NEW] `server/src/handlers/confirm-order.ts`
- Shopify lookup → NimbusPost status check → formatted reply with items, amount, address, courier, ETA

#### [NEW] `server/src/handlers/order-status.ts`  
- NimbusPost tracking → formatted status with location, ETA, tracking link

#### [NEW] `server/src/handlers/change-address.ts`
- Multi-step: collect new address → collect phone → confirm → execute (cancel+recreate or NDR action)

#### [NEW] `server/src/handlers/not-dispatched.ts`
- Check NimbusPost order state → give appropriate "your order is being processed" message

#### [NEW] `server/src/handlers/order-failed.ts`
- NimbusPost NDR lookup → show reason → offer 3 choices (re-attempt / update address / RTO)

#### [NEW] `server/src/handlers/refund-return.ts`
- Collect order number → look up in Shopify → send formatted message with order details + support phone number
- Log in `support_tickets` table
- Optionally notify the support number about incoming query

---

### Component 4: Shopify Client

#### [NEW] `server/src/shopify.ts`

```typescript
class ShopifyClient {
  // Find order by name (#RBD5001)
  getOrderByName(name: string): Promise<ShopifyOrder | null>
  
  // Find orders by customer phone (for no-order-number fallback)
  getOrdersByPhone(phone: string): Promise<ShopifyOrder[]>
  
  // Update shipping address (pre-dispatch only)
  updateOrderAddress(orderId: string, address: Address): Promise<void>
}
```

---

### Component 5: Conversation State

#### [NEW] `server/src/conversation.ts`

PostgreSQL-backed conversation state:

```sql
CREATE TABLE IF NOT EXISTS wa_conversations (
  phone       TEXT PRIMARY KEY,
  intent      TEXT,
  step        TEXT NOT NULL,
  context     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL  -- 30 min from last activity
);
```

Methods: `getConversation`, `saveConversation`, `clearConversation`, `cleanExpired`

---

### Component 6: Database

#### [MODIFY] [store.ts](file:///d:/13_AutoShip/server/src/store.ts)

Add tables:

```sql
-- Message log (all inbound + outbound messages for debugging)
CREATE TABLE IF NOT EXISTS wa_messages (
  id            BIGSERIAL PRIMARY KEY,
  phone         TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_text  TEXT,
  intent        TEXT,
  order_number  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wa_messages_phone_idx ON wa_messages (phone, created_at DESC);

-- Conversation state
CREATE TABLE IF NOT EXISTS wa_conversations (
  phone       TEXT PRIMARY KEY,
  intent      TEXT,
  step        TEXT NOT NULL,
  context     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Support tickets (for escalated refund/return/missing queries)
CREATE TABLE IF NOT EXISTS support_tickets (
  ticket_id    TEXT PRIMARY KEY,
  phone        TEXT NOT NULL,
  order_number TEXT,
  category     TEXT NOT NULL,  -- 'refund', 'return', 'missing', 'other'
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'open',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);
```

---

### Component 7: Server Wiring

#### [MODIFY] [app.ts](file:///d:/13_AutoShip/server/src/app.ts)

Add WhatsApp webhook routes (no JWT auth — verified by WhatsApp signature):

```typescript
// Webhook verification handshake
app.get("/api/whatsapp/webhook", verifyWebhook);

// Incoming messages
app.post("/api/whatsapp/webhook", verifySignature, handleWebhook);
```

#### [MODIFY] `.env`

```env
# WhatsApp
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_APP_SECRET=...

# Shopify
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_...

# Support escalation
SUPPORT_PHONE_NUMBER=919876543210   # for refund/return/missing forwarding
```

---

### Component 8: Dashboard (Phase 3)

#### [MODIFY] `client/src/App.tsx`

Add "Support" tab:
- Live message feed (wa_messages)
- Ticket list (support_tickets) with open/resolved filter
- Daily stats: auto-resolved vs escalated
- Per-phone conversation history

---

## Automation Breakdown

```
 ~1000 msgs/day
      │
      ▼
 ┌────────────────────────────┐
 │  Bot auto-resolves (~75%)  │
 │  • Order confirmation      │──► Instant reply (< 5 sec)
 │  • Order status/tracking   │
 │  • Why not dispatched      │
 │  • Failed delivery + NDR   │
 │    re-attempt              │
 ├────────────────────────────┤
 │  Bot handles with steps    │
 │  (~15%)                    │──► 2-3 messages back and forth
 │  • Address change (pre-    │
 │    dispatch)               │
 │  • NDR address update      │
 ├────────────────────────────┤
 │  Forward to human (10%)    │
 │  • Refund requests         │──► Bot collects order#, then
 │  • Return requests         │    sends customer to
 │  • Missing/wrong items     │    SUPPORT_PHONE_NUMBER
 │  • Address change (in-     │
 │    transit, not NDR)       │
 └────────────────────────────┘

 Estimated savings: ~6-8 hours/day of manual work
 Human only handles: ~100 msgs/day (refunds + edge cases)
```

---

## Build Phases

### Phase 1 — Core Bot
- WhatsApp webhook + signature verification
- Menu system + keyword classification
- Order number extraction + phone number fallback (Shopify)
- Shopify client
- Handlers: confirm order, order status, not dispatched
- Conversation state (PostgreSQL)
- Basic text replies

### Phase 2 — Full Flows
- Handler: change address (multi-step)
- Handler: order failed + NDR actions
- Handler: refund/return → forward to support phone
- Interactive buttons (WhatsApp)
- Message logging (wa_messages)
- Support tickets

### Phase 3 — Dashboard
- Support tab in AutoShip web UI
- Message feed, ticket list, stats
- Conversation history viewer

---

## Effort Estimate

| Component | Effort |
|-----------|--------|
| WhatsApp client + webhook + signature | ~3h |
| Shopify client | ~2h |
| Message router + keyword classifier + menu | ~3h |
| Order identification flow (RBD# + phone fallback) | ~2h |
| Conversation state machine | ~2h |
| 6 intent handlers | ~6h |
| Database tables + store methods | ~2h |
| Tests | ~3h |
| Dashboard (Phase 3) | ~4h |
| **Total** | **~27h** |

---

## Files Reference

| File | Change |
|------|--------|
| [NEW] `server/src/whatsapp.ts` | WhatsApp API client (send messages, verify signatures) |
| [NEW] `server/src/whatsapp-router.ts` | Message pipeline: classify → collect order# → route |
| [NEW] `server/src/shopify.ts` | Shopify Admin API client (order lookup by name/phone) |
| [NEW] `server/src/conversation.ts` | Conversation state machine (PostgreSQL-backed) |
| [NEW] `server/src/handlers/confirm-order.ts` | Order confirmation handler |
| [NEW] `server/src/handlers/order-status.ts` | Tracking status handler |
| [NEW] `server/src/handlers/change-address.ts` | Address/phone change (multi-step) |
| [NEW] `server/src/handlers/not-dispatched.ts` | Dispatch inquiry handler |
| [NEW] `server/src/handlers/order-failed.ts` | Failed delivery + NDR actions |
| [NEW] `server/src/handlers/refund-return.ts` | Collect order# → forward to support phone |
| [MODIFY] [app.ts](file:///d:/13_AutoShip/server/src/app.ts) | Add webhook routes |
| [MODIFY] [store.ts](file:///d:/13_AutoShip/server/src/store.ts) | Add wa_messages, wa_conversations, support_tickets tables |
| [MODIFY] [types.ts](file:///d:/13_AutoShip/server/src/types.ts) | Add WhatsApp + Shopify types |
| [MODIFY] `.env` | Add WhatsApp + Shopify + support phone credentials |

## Out of Scope

- AI/LLM-based classification (keyword matching is enough for 6 clear categories)
- Proactive shipping update messages (future: via NimbusPost webhooks)
- WhatsApp catalog / product browsing
- Payment processing via WhatsApp
- Automated refund processing (requires human judgment)

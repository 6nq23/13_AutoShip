# AutoShip

AutoShip turns `RBD` order QR codes into booked NimbusPost shipments and one merged label bundle. The React PWA talks to an Express API; Prisma and PostgreSQL store users, cached NimbusPost order IDs, shipping jobs, and shipping history. The backend can run locally or as one Vercel Node.js serverless function.

## Prisma database

The local development database is configured as:

```dotenv
DATABASE_URL="postgres://postgres:postgres@localhost:5432/auto_aync_prisma?schema=public"
```

Create the database once, then apply the Prisma schema and seed the initial admin:

```bash
PGPASSWORD=postgres createdb -h localhost -U postgres auto_aync_prisma
npm run init-db -w server
```

Useful Prisma commands:

```bash
npm run db:push -w server
npm run db:studio -w server
npm run db:generate -w server
```

The Prisma schema is in `server/prisma/schema.prisma`. It owns all four application tables: `users`, `order_cache`, `shipping_jobs`, and `shipping_batches`.

## First-time PostgreSQL setup (Windows)

PostgreSQL 18 is already running on this machine. Open PowerShell and connect as its administrator:

```powershell
& "D:\07_EXE\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d postgres -W
```

Enter the PostgreSQL administrator password, then create the local database if it does not already exist:

```sql
CREATE DATABASE auto_aync_prisma;
\q
```

Create the local environment file:

```powershell
cd D:\13_AutoShip
Copy-Item .env.example .env
notepad .env
```

Set `DATABASE_URL` in `.env`:

```dotenv
DATABASE_URL="postgres://postgres:postgres@localhost:5432/auto_aync_prisma?schema=public"
DATABASE_SSL=false
```

<<<<<<< HEAD
AutoShip creates its user, shipping, WhatsApp conversation/message, and support-ticket tables on the first server start.
=======
Run `npm run init-db -w server` after changing `DATABASE_URL`; Prisma creates the tables and the seed step creates the initial admin when the user table is empty.
>>>>>>> d13b0bc7d7b1b18c0539c414b10e70561277620e

## Start AutoShip

One terminal starts PostgreSQL-backed API and frontend together:

```powershell
cd D:\13_AutoShip
npm install
npm run dev
```

Or use separate terminals:

```powershell
# Terminal 1 — API at http://localhost:8787
cd D:\13_AutoShip
npm run dev -w server
```

```powershell
# Terminal 2 — frontend at http://localhost:5173
cd D:\13_AutoShip
npm run dev -w client
```

Open `http://localhost:5173`. In demo mode, the first login is `admin` / `admin123`. Anyone can use **Create account** on the sign-in page to make a non-admin `packer` account; new accounts can scan, ship, and view shipment history, but cannot open admin settings.

## Use the camera locally

Browser camera access requires a secure context. On the same computer as AutoShip, open `http://localhost:5173`; browsers treat `localhost` as secure even without HTTPS.

To use a phone or another computer over Wi-Fi, create a trusted local HTTPS certificate once:

```powershell
cd D:\13_AutoShip
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-local-https.ps1
```

The script detects the computer's LAN IP, trusts an AutoShip-only development CA for your Windows account, and prints an address such as `https://192.168.1.20:5173`. It also exports `client\.cert\autoship-local-ca.cer`.

For a phone, copy that `.cer` file to the phone and install it as a trusted CA certificate, then restart `npm run dev` and open the HTTPS address printed by the script. On Android this is under **Security > Encryption & credentials > Install a certificate > CA certificate**. On iPhone, install the downloaded profile and then enable it under **Settings > General > About > Certificate Trust Settings**. Only install this development CA on devices you control.

The phone and computer must be on the same Wi-Fi. Allow Node.js through Windows Firewall on private networks if the page cannot connect. When the scanner opens, choose **Allow camera**.

## Use NimbusPost

In `.env`, set `MOCK_MODE=false`, add the NimbusPost `npk_` key pair, choose a strong `JWT_SECRET`, and set `INITIAL_ADMIN_PASSWORD` before the first production start.

```powershell
npm run check
npm start
```

Database and NimbusPost credentials stay on the server. The browser only talks to AutoShip’s authenticated `/api` routes.

## WhatsApp customer support

Admins have a **Support** tab for live message activity, active automation flows, integration readiness, and escalated refund/return/missing-item tickets. Configure Shopify, NimbusPost, and one WhatsApp provider in `.env`; use `.env.example` as the key reference. Shopify Admin GraphQL uses API version `2026-07` and needs order/customer read access, order write access, and protected customer-data access for phone and address fields.

Point the provider webhook at `POST /api/whatsapp/webhook`:

- Meta: set `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, and `WHATSAPP_APP_SECRET`. Meta challenge verification and `X-Hub-Signature-256` validation are enabled.
- Whapi.Cloud: set `WHATSAPP_API_KEY` (or `WHATSAPP_ACCESS_TOKEN`) and optionally a separate `WHATSAPP_VERIFY_TOKEN`. In the Whapi.Cloud channel webhook settings, add a custom callback header named `x-autoship-webhook-token`; its value must be the verify token, or the API/access token when no separate verify token is set.
- Getgabs: set `WHATSAPP_PROVIDER=getgabs`, `WHATSAPP_API_KEY`, `WHATSAPP_API_URL`, `WHATSAPP_SENDER`, `WHATSAPP_CAMPAIGN_ID`, and a separate `WHATSAPP_VERIFY_TOKEN`. Configure the Getgabs incoming-chat webhook as `https://YOUR_AUTOSHIP_HOST/api/whatsapp/webhook?token=YOUR_VERIFY_TOKEN`. AutoShip sends dynamic bot responses through Getgabs' service-message endpoint during the open 24-hour customer-service window. To initiate an approved template message, also set `WHATSAPP_TEMPLATE_NAME` and optionally `WHATSAPP_TEMPLATE_LANGUAGE` (defaults to `en_US`).

The bot supports order confirmation, address/phone changes with explicit confirmation, tracking, not-dispatched checks, NDR actions, and refund/return/missing-item escalation. Before exposing or changing an order, AutoShip verifies that the WhatsApp sender matches an order, shipping, billing, or customer phone in Shopify. Conversation state expires after 24 hours, provider message IDs are deduplicated, and all Support API routes are admin-only.

## Deploy the backend to Vercel

Create a Vercel project with `server` as its Root Directory. `server/vercel.json` routes every request to the Express function at `server/api/index.ts`; Prisma Client is generated during install/build. Shipment jobs are registered with Vercel `waitUntil()` so the existing `202` response and frontend polling flow continue to work after the response is sent.

Set these Vercel environment variables:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public
DATABASE_SSL=true
CLIENT_ORIGIN=http://localhost:5173,https://auto-ship-client.vercel.app
JWT_SECRET=a-random-secret-at-least-32-characters-long
INITIAL_ADMIN_PASSWORD=a-strong-initial-password
NIMBUS_API_KEY=npk_your_key
NIMBUS_API_SECRET=your_secret
NIMBUS_API_URL=https://api-v2.nimbuspost.com
NIMBUS_LOOKUP_MAX_PAGES=20
MOCK_MODE=false
```

The localhost database URL is only for local development: a Vercel function cannot connect to PostgreSQL running on your computer. Use a hosted PostgreSQL URL for Preview and Production, then apply `server/prisma/migrations` to that database before serving traffic.

The production client uses `VITE_API_URL=https://auto-ship-backend.vercel.app` from `client/.env.production`. Local development leaves the base URL empty and continues using Vite's `/api` proxy to `http://localhost:8787`.

Vercel function execution is capped at the configured 300 seconds. Very large or slow live shipment batches should eventually move to a durable queue/worker so they are not interrupted by the function timeout.

## Courier priority

AutoShip pins `courier_id` when booking and tries these couriers in order for each shipment. It stops on the first success and marks the order failed after the seventh rejection:

1. Delhivery Surface DT — `6a0d96ef27ad772d357b22cc`
2. Bluedart Brand — `6a06d0daea73ccc9fd278986`
3. Delhivery Surface DT_Stressed — `6a0d96ef27ad772d357b230a`
4. Xpressbees Surface — `6a0d96ef27ad772d357b22b7`
5. Xpressbees Surface_Stressed — `6a0d96ef27ad772d357b2308`
6. Delhivery Air — `6a0d96ef27ad772d357b22b4`
7. Bluedart Brand Air — `6a06d0daea73ccc9fd278979`

The corresponding role/rate-sheet IDs are retained in shipment logs for diagnosis, but NimbusPost's `/v2/shipments/book` contract accepts only `order_id` and `courier_id`. Each order has a 60-second overall timeout, so the fallback cannot loop indefinitely.

## Bulk shipping behavior

NimbusPost exposes a single-order booking endpoint, not one request that books an entire batch. AutoShip therefore creates one persistent bulk job and processes up to five orders concurrently. Inside each order, the configured courier priority is tried sequentially until one courier succeeds or all seven reject it. A one-order batch is a normal single shipment; add at least two orders before pressing **Bulk ship** to see bulk activity. The live panel shows a separate status for every order plus the complete chronological log.

## Why `node_modules` and root package files exist

The root `package.json` defines npm workspaces for `client` and `server` and provides commands that operate both together. npm installs shared and workspace dependencies into the root `node_modules` directory to avoid duplicate copies. `package-lock.json` pins the exact versions. These are required for local development; `node_modules` is generated and ignored by Git, while the two package files must remain in the project.

# AutoShip

AutoShip turns `RBD` order QR codes into booked NimbusPost shipments and one merged label bundle. The React PWA talks to an Express API; PostgreSQL stores users, cached NimbusPost order IDs, and shipping history.

## First-time PostgreSQL setup (Windows)

PostgreSQL 18 is already running on this machine. Open PowerShell and connect as its administrator:

```powershell
& "D:\07_EXE\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d postgres -W
```

Enter the PostgreSQL administrator password, then run these two SQL statements using a strong password of your choice:

```sql
CREATE USER autoship WITH PASSWORD 'replace_with_a_strong_password';
CREATE DATABASE autoship OWNER autoship;
\q
```

Create the local environment file:

```powershell
cd D:\13_AutoShip
Copy-Item .env.example .env
notepad .env
```

Set `DATABASE_URL` in `.env` with the same password:

```dotenv
DATABASE_URL=postgresql://autoship:YOUR_PASSWORD@localhost:5432/autoship
DATABASE_SSL=false
```

AutoShip creates its `users`, `order_cache`, and `shipping_batches` tables on the first server start.

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

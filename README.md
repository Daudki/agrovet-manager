# Agrovet Manager

Inventory, sales and expiry management built specifically for agrovet shops (agricultural inputs and veterinary supplies).
Multi-tenant: every shop registers its own account and only ever sees its own data.

**Stack:** React 18 + Vite (client) · Node.js + Express (API) · SQLite (built-in `node:sqlite`, no native build step).

## Features

| Area | What you get |
| --- | --- |
| **Accounts** | Register, then sign in. Private workspace per shop, httpOnly cookie sessions, change password, sign out on all devices |
| **Team & roles** | Owner, manager and cashier logins. Cashiers can sell and look things up but never see costs or profit, and only see their own sales. Sales record who served |
| **Languages** | English and Kiswahili, switchable on every screen (also on the sign-in pages) and remembered per device. Dates and numbers follow the language |
| **Products** | Full CRUD, categories, suppliers, SKU & barcode, units, cost/selling price with live margin, reorder levels, active ingredients, free-form specifications (e.g. sprayer capacity), archive & restore, CSV export |
| **Batch-level stock** | Every receipt is a batch with its own cost and expiry date. Stock is always derived from batches, never typed in by hand |
| **FEFO selling** | Sales take stock from the earliest-expiring batch first; expired stock can never be sold |
| **Alerts** | Out of stock, low stock, expiring soon (configurable window), expired — on the dashboard and as sidebar badges |
| **Alternatives** | Search by name or active ingredient and see in-stock alternatives that share an ingredient |
| **Point of sale** | Touch-friendly catalogue, barcode-scanner friendly, price override, discounts, 5 payment methods, credit / part-payment, printable receipts |
| **Sales history** | Filters, totals, receipts, void a sale (stock is restored to the original batches) |
| **Purchases** | Multi-line goods-received notes, supplier tracking, void while untouched |
| **Stock control** | Stock counts, write-offs with reasons, full stock ledger (audit trail) |
| **Customers** | Balances, credit sales, payment recording (settles oldest sale first), purchase history |
| **Expenses** | Categorised running costs deducted from profit |
| **Reports** | Profit & loss (revenue − cost of goods − expenses), margins, best sellers, payment mix, category mix, inventory valuation (cost vs retail), CSV exports |
| **UX** | Dark mode, My Account page, responsive down to phones (tables become cards, cart becomes a bottom sheet), installable PWA, keyboard `/` to search |

## Quick start

Requires **Node.js ≥ 22.13** (for the built-in SQLite module).

```bash
npm install
cp .env.example .env        # optional in development
npm run dev
```

* Web app: http://localhost:5173 (Vite proxies `/api` to the API)
* API: http://localhost:4000

Open the app, choose **Create your shop account**, and tick *Load sample data* to explore with realistic products, sales and expiry alerts.

### Production

See **[DEPLOY.md](DEPLOY.md)** for a step-by-step guide (Render or your own server), backups and a go-live checklist.

```bash
npm run build               # builds client/dist
JWT_SECRET=$(openssl rand -hex 32) npm start
```

In production the API serves the built web app on a single port. Serve it behind HTTPS (the session cookie is `Secure` in production; set `COOKIE_SECURE=false` only to test a production build on plain `http://localhost`).

Or with Docker:

```bash
docker build -t agrovet-manager .
docker run -p 4000:4000 -e JWT_SECRET=change-me -e COOKIE_SECURE=false -v agrovet-data:/data agrovet-manager
```

Back up by copying the SQLite file (`DATABASE_PATH`, default `server/data/agrovet.db`).

## Configuration

See [`.env.example`](.env.example). `JWT_SECRET` is **required** in production.

## Project layout

```
server/
  src/
    schema.js          ordered SQL migrations (PRAGMA user_version)
    db.js              connection + re-entrant transactions
    services/          all business logic (framework-free, unit-tested)
    routes/            Express routes + zod validation
    middleware/        auth (JWT cookie), error handling
  tests/               node:test – service tests + HTTP integration tests
client/
  src/
    pages/             one file per screen
    components/        modals, drawers, tables, charts (hand-rolled SVG), pickers
    context/           auth + theme
    lib/               API client, hooks, formatters
    styles/global.css  design system (CSS variables, light/dark)
```


## Roles

| | Owner | Manager | Cashier |
| --- | :-: | :-: | :-: |
| Make sales, look up products & customers, record customer payments | ✓ | ✓ | ✓ |
| See buying prices, stock value, profit | ✓ | ✓ | – |
| Products, categories, suppliers, purchases, stock adjustments | ✓ | ✓ | – |
| Void sales, delete customers, expenses, reports, dashboard, CSV export | ✓ | ✓ | – |
| Shop settings, team management | ✓ | – | – |
| See all sales | ✓ | ✓ | own only |

Rules are enforced on the server for every route (`server/src/permissions.js`, `routes/index.js`); the UI only hides what a role can't use. Cost and profit fields are stripped from API responses for cashiers (`server/src/redact.js`). Role changes, deactivation and password resets sign the person out immediately.

## Languages

Text is translated with `t('English text')`; the English text is the lookup key and Kiswahili lives in `client/src/locales/sw.js`. Anything not translated simply shows in English. Server error messages are translated on arrival (`tServer`).

When you add UI text, wrap it in `t()` and run:

```bash
npm run i18n:check      # fails if any t('…') string has no Kiswahili entry
```

To add another language: add it to `LANGUAGES` in `client/src/lib/i18n.js` and create its dictionary next to `sw.js`.

## Updating an existing install

Migrations run automatically on start. Back up first: `cp server/data/agrovet.db server/data/agrovet.db.bak`. Existing shop owners keep the same email and password; their login moves to the new `users` table.

## How the important rules work

* **Tenant isolation** – every business table has `account_id`, services receive the signed-in account and every query filters by it. Foreign ids supplied by a client (category, supplier, product, customer…) are verified to belong to the same account. Covered by tests.
* **Stock** – `batches.quantity` is the single source of truth. Every change also writes a signed row to `stock_movements`, so the ledger always adds up to the stock on hand (asserted in tests).
* **Money & profit** – revenue is the sale total; cost of goods comes from the actual batch costs consumed by each sale; net profit = gross profit − expenses. Voided sales are excluded everywhere.
* **Dates** – sales/expenses/purchases are stamped with the shop's local calendar day (configurable time zone), so late-evening sales land on the right day.
* **Deleting** – products that have ever been sold or purchased are archived rather than deleted so history stays correct.

## API overview

All routes except `/api/auth/*` require a session. JSON in, JSON out; validation errors return `400 { error, details: { fields } }`.

```
POST /api/auth/register (does not sign in) | login | logout     GET /api/auth/me
PATCH /api/account   POST /api/account/password | sign-out-everywhere | demo-data
CRUD /api/team  (owner only: managers & cashiers)
GET /api/dashboard   /api/alerts   /api/search?q=   /api/reports/sales?from&to   /api/reports/inventory
CRUD /api/categories  /api/suppliers  /api/customers  /api/expenses  (+ POST /api/customers/:id/payments)
CRUD /api/products    POST /api/products/:id/archive | restore   GET /api/products/:id/alternatives
GET/POST /api/purchases   POST /api/purchases/:id/void
GET /api/stock/batches  /api/stock/movements   POST /api/stock/adjust
GET/POST /api/sales   POST /api/sales/:id/void
GET /api/export/products.csv | sales.csv | expenses.csv | movements.csv
```

## Tests

```bash
npm test
```

`server/tests/roles.test.js` covers the permission matrix, team management, cost redaction and the users migration. `server/tests/services.test.js` covers FEFO allocation, overselling rollback, voids, credit settlement, purchases, adjustments, expiry classification, P&L maths, tenant isolation and a ledger-integrity check on the demo data. `api.test.js` exercises the HTTP layer (register-then-login, validation, tenant isolation, cashier restrictions, CSV export).

## Notes & limitations

* No audit log of who changed what (sales do record who served).
* Passwords are hashed with bcrypt; there is no email-based password reset (needs an email provider).
* Voiding a sale restores stock but does not track refunds of money already collected.
* SQLite is ideal for a shop or a few hundred shops on one server; move to PostgreSQL if you need multiple app servers.

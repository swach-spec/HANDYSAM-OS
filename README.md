# HandySam OS

HandySam's business ERP — quotations, invoices, receipts, inventory,
expenses and books — backed by Supabase (the same project as Meide
Command Center), so Command Center can read live HandySam data for
analytics with no separate export step.

## 1. Set up the database

Open your Supabase project (the same one Command Center uses) →
**SQL Editor** → **New query**. Run these files from `supabase/`
**in this exact order** — each is kept under ~100 lines so it pastes
cleanly into the SQL editor, and every one is safe to re-run if
something fails partway:

1. `00-core-schema.sql` — Command Center's shared `businesses` /
   `transactions` / `debts` / `tasks` / `diary_entries` /
   `coach_conversations` tables. Skip this only if you're certain
   they already exist — it's idempotent either way (`if not exists`
   everywhere), so running it again is harmless.
2. `01a-handysam-tables-1.sql` — settings, document numbering,
   products, quotations
3. `01b-handysam-tables-2.sql` — quotation items, invoices, invoice
   items, receipts, expenses, stock movements
4. `01c-handysam-views-rls.sql` — the two analytics views
   (`handysam_dashboard_snapshot`, `handysam_monthly_summary`), Row
   Level Security, and Realtime
5. `02-handysam-seed.sql` — the 71-item product catalog (Trinity
   Petroleum MGPS price list); items marked `flagged = true` still
   need a confirmed cost price
6. `03a-bridge-link.sql` — links every `handysam_*` row to the
   `businesses` row named `'HandySam'`
7. `03b-bridge-mirror.sql` — mirrors every HandySam receipt/expense
   into the shared `transactions` table live, so Command Center's
   existing analytics see HandySam activity with no extra code
8. `04-numbering-and-inventory.sql` — switches document numbering to
   `HS_Q-DDMMYYYY-001` / `HS_I-...` / `HS_R-...` (gapless per day),
   and adds stock adjustment/retake support to `handysam_stock_moves`
9. `05a-status-workflow.sql` — quotations move draft → confirmed →
   invoiced; invoices get a `doc_status` (draft/confirmed) separate
   from payment status (unpaid/paid) — only draft documents are
   editable in the app
10. `05b-credit-notes.sql` / `05c-bills.sql` — new document types:
    Credit Notes (against an invoice) and Bills (accounts payable —
    what HandySam owes a supplier)
11. `05d-credit-bill-security-mirror.sql` — RLS, Realtime, and
    ledger-mirroring for both: a confirmed credit note reduces income
    in `transactions`, a paid bill records as an expense

## Roles & logins

Run `06a` through `06f` (in order) to add role-based access:

- **admin** — full access everywhere
- **accountant** — full access to Quotations, Invoices, Receipts,
  Credit Notes, Expenses, Books; view-only on Bills; **no** access to
  Products/Inventory edits
- **procurement** — full access to Products, Inventory, Bills; **no**
  access at all to Quotations, Invoices, Receipts, Credit Notes,
  Expenses, Books, or Settings
- **sales** — POS only. Nothing else is visible or reachable, even
  by direct API call.

This is enforced with Postgres Row Level Security, not just hidden UI
— even a direct API call is blocked for the wrong role. `06a` also
bootstraps every *existing* Supabase Auth user as `admin` (so you're
not locked out), and adds an admin-only "Manage Users" panel in
Settings to assign roles to anyone who signs in afterward — they need
to sign in at least once first so their account exists in Supabase
Auth, then an admin assigns their role by email.

Invoice confirmation deducts stock, which crosses the
accounting/inventory boundary — `06e` handles this with a
`security definer` database function so an accountant can confirm an
invoice (their permission) without being granted direct write access
to inventory tables (which they shouldn't have).

## Point of Sale (POS)

Run `07a-pos-sale-fn.sql` to enable it. (If you're adding the `sales` role, run `10a-sales-role.sql` afterward — it also re-permits `handysam_pos_sale` for that role.) A new **POS** tab (admin and
accountant only) gives a dedicated register screen:

- Tap a product to add it to the sale — no confirmation dialog, no
  draft stage. This is for instant walk-in sales, not the
  quote-first workflow the rest of the app uses.
- One "Charge" click creates an already-paid, already-confirmed
  invoice, deducts stock, and issues a receipt — all in a single
  atomic database call (`handysam_pos_sale`), so a half-finished sale
  can't leave stock or the ledger in an inconsistent state.
- Designed as its own full-screen layout (not boxed like the other
  tabs) since this is meant to be the screen staff live in all day:
  a light, browsable product catalog on the left, a dark fixed
  register panel on the right with the cart, payment method, and
  total — deliberately visually distinct from "browsing" so it's
  always clear when you're about to commit a sale.
- Responsive down to a phone: the register panel stacks below the
  catalog instead of sitting beside it.

## Product photos, SKU, and barcode/QR scanning

Run `08a-sku-barcode-photo.sql` then `08b-storage-bucket-photos.sql`.

- **SKU** — auto-generated (`HS-00001`, `HS-00002`, ...) the moment a
  product is created. Read-only in the app; it's your own internal
  identifier, guaranteed unique.
- **Barcode** — optional, for a manufacturer's printed barcode if the
  item has one. Editable in Products — click into the field and
  either type it or scan it (see below), then press Enter or click
  away to save.
- **Photo** — click the thumbnail square in Products to upload one
  from your device. Shows on the POS product tile once set; if none
  is uploaded, the tile clearly says "No photo uploaded" instead of
  showing a placeholder image.
- **Barcode/QR scanning** — any USB or Bluetooth barcode/QR scanner
  works out of the box, with no extra setup or library. These
  devices work by typing the code as keystrokes into whatever's
  focused, then pressing Enter — exactly like a keyboard. So:
  - In **POS**, the "Scan barcode / SKU" field is focused by
    default — scan an item and it's added to the cart immediately.
  - In **Products**, click into a row's Barcode field and scan to
    fill it in.
- **SKU everywhere** — run `09a-sku-on-line-items.sql` then
  `09b-sku-in-functions.sql`. The product's SKU is copied onto every
  quotation, invoice, credit note, and bill line item, every stock
  movement, and every POS sale at the moment it's created — same
  pattern already used for description/uom, so it survives even if
  the product is later edited or deleted, and prints on every PDF.

  - **Phone camera scanning** is also built in — tap the 📷 Camera
    button in POS (or next to a product's Barcode field in Products)
    to open a live camera overlay that decodes barcodes and QR codes
    directly (via ZXing, no server round-trip). Needs HTTPS (Vercel
    is fine) and camera permission. This library only downloads when
    someone actually taps the camera button, not on every page load,
    so it doesn't slow down the app for people using a physical
    scanner instead.

## 2. Configure the app

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your
Supabase project (**Project Settings → API**) — the same values
Command Center already uses.

## 3. Run it

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. Go to **Settings** first and fill
in your company phone/email/address, bank details, and terms &
conditions — these print on every PDF.

To deploy: `npm run build` then drag the `dist/` folder onto Netlify,
or connect the repo to Netlify/Vercel for auto-deploys.

## 4. If you already used the standalone tool

If you've been using `handysam-system.html` (the local-storage
prototype) and have real data in it, export it from its **Books** tab
("Export all data") and run:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
node scripts/migrate-from-localstorage.mjs ./handysam-backup-XXXX.json
```

Use the **service role** key here (Project Settings → API → `service_role`),
not the anon key — it bypasses Row Level Security for this one-off
import. Never put the service role key in `.env` or the browser app.

## How Command Center reads this data

Because both apps point at the same Supabase project, Command Center
can query these tables/views directly with the Supabase client —
no ETL, no sync job:

- `handysam_dashboard_snapshot` — one-row live snapshot (open
  quotations, unpaid invoices, month income/expense, low stock, etc.)
  for a dashboard tile.
- `handysam_monthly_summary` — income vs. expense vs. net, by month.
- Realtime: subscribe to `postgres_changes` on `handysam_invoices`,
  `handysam_receipts`, `handysam_expenses`, `handysam_products` etc.
  to update a Command Center widget the moment something changes here
  (see `src/pages/Dashboard.jsx` for a working example of this).

## Data model

```
handysam_products
handysam_quotations ──< handysam_quotation_items
handysam_invoices   ──< handysam_invoice_items   (quotation_id links back to the quote it came from)
handysam_receipts       (invoice_id links to the invoice it paid)
handysam_expenses
handysam_stock_moves    (product_id, type: in/out — auto-logged when an invoice is created)
handysam_settings       (one row: company profile, bank details, terms & conditions)
```

All tables carry a `venture` column (default `'handysam'`) so the
same schema pattern can extend to Apicalmed, Tavira, or Kenya Plate
later without a redesign — just filter by venture in the queries.

## What's next for HandySam OS

This covers the core ERP loop end to end. Natural next additions,
whenever you're ready:

- Supabase Auth (so the app isn't wide open — currently any
  authenticated user in the project has full read/write access)
- Purchase orders / supplier tracking (you have Trinity Petroleum's
  cost prices — a POs table would close the loop with Inventory)
- Job/project costing (tie expenses and invoices to a specific
  installation project, not just a client name)
- File attachments (photos of installed work, signed delivery notes)

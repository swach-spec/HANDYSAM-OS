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

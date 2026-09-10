-- ============================================================
-- HandySam OS <-> Command Center bridge
-- Run this AFTER: (1) your businesses/transactions script,
-- and (2) handysam schema.sql + seed.sql.
--
-- What this does:
--  1. Links every handysam_* row to the shared `businesses` table
--     (business_id, auto-set to the 'HandySam' row).
--  2. Auto-mirrors every HandySam receipt (income) and expense into
--     your shared `transactions` table the moment it's created, so
--     Command Center's existing transactions-based analytics pick up
--     HandySam activity with zero extra code on the Command Center side.
--  3. Keeps that mirror in sync if a HandySam receipt/expense is
--     deleted, via a traceable source_table/source_id pair added to
--     `transactions`.
-- ============================================================

-- ---------- 1. link handysam_* rows to businesses ----------
alter table handysam_products      add column if not exists business_id uuid references businesses(id);
alter table handysam_quotations    add column if not exists business_id uuid references businesses(id);
alter table handysam_invoices      add column if not exists business_id uuid references businesses(id);
alter table handysam_receipts      add column if not exists business_id uuid references businesses(id);
alter table handysam_expenses      add column if not exists business_id uuid references businesses(id);
alter table handysam_stock_moves   add column if not exists business_id uuid references businesses(id);

-- default every new row to the 'HandySam' business automatically
create or replace function handysam_business_id() returns uuid as $$
  select id from businesses where name = 'HandySam' limit 1;
$$ language sql stable;

alter table handysam_products      alter column business_id set default handysam_business_id();
alter table handysam_quotations    alter column business_id set default handysam_business_id();
alter table handysam_invoices      alter column business_id set default handysam_business_id();
alter table handysam_receipts      alter column business_id set default handysam_business_id();
alter table handysam_expenses      alter column business_id set default handysam_business_id();
alter table handysam_stock_moves   alter column business_id set default handysam_business_id();

-- backfill any rows created before this script ran
update handysam_products    set business_id = handysam_business_id() where business_id is null;
update handysam_quotations  set business_id = handysam_business_id() where business_id is null;
update handysam_invoices    set business_id = handysam_business_id() where business_id is null;
update handysam_receipts    set business_id = handysam_business_id() where business_id is null;
update handysam_expenses    set business_id = handysam_business_id() where business_id is null;
update handysam_stock_moves set business_id = handysam_business_id() where business_id is null;

-- ---------- 2. traceability columns on the shared ledger ----------
alter table transactions add column if not exists source_table text;
alter table transactions add column if not exists source_id uuid;
drop index if exists transactions_source_unique;
create unique index transactions_source_unique on transactions(source_table, source_id);


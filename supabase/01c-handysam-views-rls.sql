-- ============================================================
-- Analytics views — this is what Command Center should read from
-- ============================================================

-- Monthly income (paid receipts) vs expenses vs net cash flow
create or replace view handysam_monthly_summary as
select
  coalesce(r.month, e.month) as month,
  coalesce(r.income, 0) as income,
  coalesce(e.expense, 0) as expense,
  coalesce(r.income, 0) - coalesce(e.expense, 0) as net
from
  (select date_trunc('month', date)::date as month, sum(amount) as income
   from handysam_receipts group by 1) r
full outer join
  (select date_trunc('month', date)::date as month, sum(amount) as expense
   from handysam_expenses group by 1) e
  on r.month = e.month
order by 1 desc;

-- Live snapshot for a dashboard tile
create or replace view handysam_dashboard_snapshot as
select
  (select count(*) from handysam_products) as product_count,
  (select count(*) from handysam_products where flagged) as unconfirmed_price_count,
  (select count(*) from handysam_products where stock <= 3) as low_stock_count,
  (select count(*) from handysam_quotations where status != 'invoiced') as open_quotations,
  (select count(*) from handysam_invoices where status = 'unpaid') as unpaid_invoices,
  (select coalesce(sum(total),0) from handysam_invoices where status = 'unpaid') as unpaid_amount,
  (select coalesce(sum(amount),0) from handysam_receipts
     where date_trunc('month', date) = date_trunc('month', current_date)) as month_income,
  (select coalesce(sum(amount),0) from handysam_expenses
     where date_trunc('month', date) = date_trunc('month', current_date)) as month_expense;

-- ============================================================
-- Row Level Security
-- Default: any authenticated Supabase user (i.e. anyone logged into
-- Command Center) can read and write. Tighten this later if you add
-- per-venture roles — e.g. restrict handysam_* writes to a specific
-- role/user and leave read access open to all authenticated staff
-- for analytics.
-- ============================================================
alter table handysam_settings enable row level security;
alter table handysam_products enable row level security;
alter table handysam_quotations enable row level security;
alter table handysam_quotation_items enable row level security;
alter table handysam_invoices enable row level security;
alter table handysam_invoice_items enable row level security;
alter table handysam_receipts enable row level security;
alter table handysam_expenses enable row level security;
alter table handysam_stock_moves enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array[
    'handysam_settings','handysam_products','handysam_quotations','handysam_quotation_items',
    'handysam_invoices','handysam_invoice_items','handysam_receipts','handysam_expenses','handysam_stock_moves'
  ])
  loop
    execute format('drop policy if exists "authenticated full access" on %I', t);
    execute format(
      'create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)', t
    );
  end loop;
end $$;

-- ============================================================
-- Realtime — lets Command Center subscribe to live changes
-- instead of polling.
-- ============================================================
alter publication supabase_realtime add table
  handysam_products, handysam_quotations, handysam_invoices,
  handysam_receipts, handysam_expenses, handysam_stock_moves;

-- ============================================================
-- Seed: default settings row + Trinity Petroleum product list
-- ============================================================
insert into handysam_settings (venture) values ('handysam') on conflict (venture) do nothing;

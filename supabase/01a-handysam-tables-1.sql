-- ============================================================
-- HandySam OS — Supabase schema
-- Run this in the SAME Supabase project as Meide Command Center
-- (SQL Editor → New query → paste → Run).
-- Tables are prefixed handysam_ so they sit safely alongside
-- Command Center's existing tables in the same database.
-- ============================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------- helper: auto-update updated_at ----------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------- settings (single row per venture) ----------
create table if not exists handysam_settings (
  id uuid primary key default gen_random_uuid(),
  venture text not null default 'handysam',
  name text default 'HandySam Engineering',
  tagline text default 'Fabrication · Installations · Systems',
  address text,
  phone text,
  email text,
  bank_name text,
  account_name text,
  account_number text,
  terms text default 'Payment due within 14 days of invoice date. Goods remain the property of HandySam Engineering until paid in full. Prices are valid for 30 days from date of quotation.',
  updated_at timestamptz default now(),
  unique(venture)
);

-- ---------- document numbering ----------
create table if not exists handysam_counters (
  doc_type text primary key,       -- 'quote' | 'invoice' | 'receipt'
  next_val int not null default 1
);
insert into handysam_counters (doc_type, next_val) values
  ('quote',1), ('invoice',1), ('receipt',1)
on conflict (doc_type) do nothing;

create or replace function handysam_next_number(p_doc_type text, p_prefix text)
returns text as $$
declare v int;
begin
  update handysam_counters set next_val = next_val + 1
    where doc_type = p_doc_type
    returning next_val - 1 into v;
  return p_prefix || '-' || lpad(v::text, 4, '0');
end;
$$ language plpgsql;

-- ---------- products ----------
create table if not exists handysam_products (
  id uuid primary key default gen_random_uuid(),
  venture text not null default 'handysam',
  category text,
  description text not null,
  uom text default 'Pcs',
  cost numeric,
  sell numeric,
  stock numeric default 0,
  flagged boolean default false,   -- true = cost/price not yet confirmed
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger trg_products_updated before update on handysam_products
  for each row execute function set_updated_at();

-- ---------- quotations ----------
create table if not exists handysam_quotations (
  id uuid primary key default gen_random_uuid(),
  venture text not null default 'handysam',
  number text unique,
  date date not null default current_date,
  client text not null,
  client_contact text,
  notes text,
  discount_pct numeric default 0,
  subtotal numeric default 0,
  discount numeric default 0,
  vat numeric default 0,
  total numeric default 0,
  status text default 'draft' check (status in ('draft','sent','invoiced')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger trg_quotations_updated before update on handysam_quotations
  for each row execute function set_updated_at();


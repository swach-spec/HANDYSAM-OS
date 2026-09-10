-- Credit notes: issued against an invoice (return, correction, or goodwill discount)
create table if not exists handysam_credit_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) default handysam_business_id(),
  number text unique,
  date date not null default current_date,
  invoice_id uuid references handysam_invoices(id) on delete set null,
  client text not null,
  client_contact text,
  reason text,
  notes text,
  discount_pct numeric default 0,
  subtotal numeric default 0,
  discount numeric default 0,
  vat numeric default 0,
  total numeric default 0,
  status text default 'draft' check (status in ('draft','confirmed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger trg_credit_notes_updated before update on handysam_credit_notes
  for each row execute function set_updated_at();

create table if not exists handysam_credit_note_items (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references handysam_credit_notes(id) on delete cascade,
  product_id uuid references handysam_products(id) on delete set null,
  description text not null,
  uom text,
  qty numeric not null default 1,
  price numeric not null default 0
);

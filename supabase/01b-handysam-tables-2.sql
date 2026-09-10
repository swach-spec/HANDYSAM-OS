create table if not exists handysam_quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references handysam_quotations(id) on delete cascade,
  product_id uuid references handysam_products(id) on delete set null,
  description text not null,
  uom text,
  qty numeric not null default 1,
  price numeric not null default 0
);

-- ---------- invoices ----------
create table if not exists handysam_invoices (
  id uuid primary key default gen_random_uuid(),
  venture text not null default 'handysam',
  number text unique,
  date date not null default current_date,
  due_date date,
  quotation_id uuid references handysam_quotations(id) on delete set null,
  client text not null,
  client_contact text,
  notes text,
  discount_pct numeric default 0,
  subtotal numeric default 0,
  discount numeric default 0,
  vat numeric default 0,
  total numeric default 0,
  status text default 'unpaid' check (status in ('unpaid','paid')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger trg_invoices_updated before update on handysam_invoices
  for each row execute function set_updated_at();

create table if not exists handysam_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references handysam_invoices(id) on delete cascade,
  product_id uuid references handysam_products(id) on delete set null,
  description text not null,
  uom text,
  qty numeric not null default 1,
  price numeric not null default 0
);

-- ---------- receipts ----------
create table if not exists handysam_receipts (
  id uuid primary key default gen_random_uuid(),
  venture text not null default 'handysam',
  number text unique,
  date date not null default current_date,
  invoice_id uuid references handysam_invoices(id) on delete set null,
  client text,
  amount numeric not null,
  method text,
  created_at timestamptz default now()
);

-- ---------- expenses ----------
create table if not exists handysam_expenses (
  id uuid primary key default gen_random_uuid(),
  venture text not null default 'handysam',
  date date not null default current_date,
  category text not null,
  vendor text,
  amount numeric not null,
  note text,
  created_at timestamptz default now()
);

-- ---------- stock movements ----------
create table if not exists handysam_stock_moves (
  id uuid primary key default gen_random_uuid(),
  venture text not null default 'handysam',
  date date not null default current_date,
  product_id uuid references handysam_products(id) on delete set null,
  description text,
  type text check (type in ('in','out')),
  qty numeric not null,
  note text,
  created_at timestamptz default now()
);


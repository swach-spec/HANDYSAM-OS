-- Bills: money HandySam owes a supplier/vendor (accounts payable),
-- distinct from Expenses (which are already-paid outflows).
create table if not exists handysam_bills (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) default handysam_business_id(),
  number text unique,
  date date not null default current_date,
  due_date date,
  vendor text not null,
  notes text,
  subtotal numeric default 0,
  vat numeric default 0,
  total numeric default 0,
  status text default 'draft' check (status in ('draft','confirmed','paid')),
  paid_date date,
  payment_method text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger trg_bills_updated before update on handysam_bills
  for each row execute function set_updated_at();

create table if not exists handysam_bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references handysam_bills(id) on delete cascade,
  product_id uuid references handysam_products(id) on delete set null,
  description text not null,
  uom text,
  qty numeric not null default 1,
  price numeric not null default 0
);

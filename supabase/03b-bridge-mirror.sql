-- ---------- 3. mirror HandySam receipts -> transactions (income) ----------
create or replace function handysam_mirror_receipt()
returns trigger as $$
begin
  insert into transactions (business_id, transaction_date, type, category, amount, payment_method, paid_by, description, source_table, source_id)
  values (
    handysam_business_id(), new.date, 'income', 'HandySam Sales', new.amount, new.method,
    new.client, 'Receipt ' || new.number, 'handysam_receipts', new.id
  )
  on conflict (source_table, source_id) do update
    set amount = excluded.amount, transaction_date = excluded.transaction_date,
        payment_method = excluded.payment_method, paid_by = excluded.paid_by;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_handysam_receipt_mirror on handysam_receipts;
create trigger trg_handysam_receipt_mirror
  after insert or update on handysam_receipts
  for each row execute function handysam_mirror_receipt();

create or replace function handysam_unmirror_receipt()
returns trigger as $$
begin
  delete from transactions where source_table = 'handysam_receipts' and source_id = old.id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists trg_handysam_receipt_unmirror on handysam_receipts;
create trigger trg_handysam_receipt_unmirror
  after delete on handysam_receipts
  for each row execute function handysam_unmirror_receipt();

-- ---------- 4. mirror HandySam expenses -> transactions (expense) ----------
create or replace function handysam_mirror_expense()
returns trigger as $$
begin
  insert into transactions (business_id, transaction_date, type, category, amount, paid_to, description, source_table, source_id)
  values (
    handysam_business_id(), new.date, 'expense', new.category, new.amount,
    new.vendor, new.note, 'handysam_expenses', new.id
  )
  on conflict (source_table, source_id) do update
    set amount = excluded.amount, category = excluded.category,
        transaction_date = excluded.transaction_date, paid_to = excluded.paid_to, description = excluded.description;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_handysam_expense_mirror on handysam_expenses;
create trigger trg_handysam_expense_mirror
  after insert or update on handysam_expenses
  for each row execute function handysam_mirror_expense();

create or replace function handysam_unmirror_expense()
returns trigger as $$
begin
  delete from transactions where source_table = 'handysam_expenses' and source_id = old.id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists trg_handysam_expense_unmirror on handysam_expenses;
create trigger trg_handysam_expense_unmirror
  after delete on handysam_expenses
  for each row execute function handysam_unmirror_expense();

-- ---------- 5. one-off backfill for receipts/expenses that already existed ----------
insert into transactions (business_id, transaction_date, type, category, amount, payment_method, paid_by, description, source_table, source_id)
select handysam_business_id(), r.date, 'income', 'HandySam Sales', r.amount, r.method, r.client, 'Receipt ' || r.number, 'handysam_receipts', r.id
from handysam_receipts r
on conflict (source_table, source_id) do nothing;

insert into transactions (business_id, transaction_date, type, category, amount, paid_to, description, source_table, source_id)
select handysam_business_id(), e.date, 'expense', e.category, e.amount, e.vendor, e.note, 'handysam_expenses', e.id
from handysam_expenses e
on conflict (source_table, source_id) do nothing;

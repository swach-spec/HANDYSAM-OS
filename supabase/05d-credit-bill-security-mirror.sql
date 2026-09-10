alter table handysam_credit_notes enable row level security;
alter table handysam_credit_note_items enable row level security;
alter table handysam_bills enable row level security;
alter table handysam_bill_items enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array[
    'handysam_credit_notes','handysam_credit_note_items','handysam_bills','handysam_bill_items'
  ])
  loop
    execute format('drop policy if exists "authenticated full access" on %I', t);
    execute format('create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

alter publication supabase_realtime add table handysam_credit_notes, handysam_bills;

-- Confirmed credit note -> reduces income in the shared ledger
create or replace function handysam_mirror_credit_note() returns trigger as $$
begin
  if new.status = 'confirmed' then
    insert into transactions (business_id, transaction_date, type, category, amount, paid_by, description, source_table, source_id)
    values (handysam_business_id(), new.date, 'expense', 'HandySam Credit Notes', new.total, new.client,
            'Credit note ' || new.number, 'handysam_credit_notes', new.id)
    on conflict (source_table, source_id) do update
      set amount = excluded.amount, transaction_date = excluded.transaction_date;
  else
    delete from transactions where source_table = 'handysam_credit_notes' and source_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_credit_note_mirror on handysam_credit_notes;
create trigger trg_credit_note_mirror after insert or update of status on handysam_credit_notes
  for each row execute function handysam_mirror_credit_note();

-- Paid bill -> records as an expense in the shared ledger
create or replace function handysam_mirror_bill() returns trigger as $$
begin
  if new.status = 'paid' then
    insert into transactions (business_id, transaction_date, type, category, amount, paid_to, payment_method, description, source_table, source_id)
    values (handysam_business_id(), coalesce(new.paid_date, current_date), 'expense', 'HandySam Purchases', new.total,
            new.vendor, new.payment_method, 'Bill ' || new.number, 'handysam_bills', new.id)
    on conflict (source_table, source_id) do update
      set amount = excluded.amount, transaction_date = excluded.transaction_date, payment_method = excluded.payment_method;
  else
    delete from transactions where source_table = 'handysam_bills' and source_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bill_mirror on handysam_bills;
create trigger trg_bill_mirror after insert or update of status on handysam_bills
  for each row execute function handysam_mirror_bill();

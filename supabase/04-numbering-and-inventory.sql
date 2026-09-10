-- Numbering: HS_Q-DDMMYYYY-001 / HS_I-DDMMYYYY-001 / HS_R-DDMMYYYY-001
-- Sequence resets daily per doc type but is gapless within that day.
create table if not exists handysam_daily_counters (
  doc_type text not null,
  count_date date not null,
  next_val int not null default 1,
  primary key (doc_type, count_date)
);

create or replace function handysam_next_number(p_doc_type text, p_prefix text)
returns text as $$
declare v int;
begin
  insert into handysam_daily_counters (doc_type, count_date, next_val)
  values (p_doc_type, current_date, 2)
  on conflict (doc_type, count_date) do update
    set next_val = handysam_daily_counters.next_val + 1
  returning next_val - 1 into v;
  return p_prefix || '-' || to_char(current_date, 'DDMMYYYY') || '-' || lpad(v::text, 3, '0');
end;
$$ language plpgsql;

-- Inventory: stock adjustments and physical stocktakes ("retake"),
-- with an optional price captured at the time of a retake.
alter table handysam_stock_moves drop constraint if exists handysam_stock_moves_type_check;
alter table handysam_stock_moves add constraint handysam_stock_moves_type_check
  check (type in ('in','out','adjustment','retake'));
alter table handysam_stock_moves add column if not exists new_cost numeric;

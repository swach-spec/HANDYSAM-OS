-- A POS sale is instant: no draft/confirm stage, just a paid invoice +
-- stock deduction + receipt, all atomically. Client sends the cart as
-- jsonb: [{product_id, description, uom, qty, price}, ...].
create or replace function handysam_pos_sale(
  p_client text, p_items jsonb, p_discount_pct numeric, p_payment_method text
) returns table(invoice_number text, receipt_number text, total numeric) as $$
declare
  v_subtotal numeric; v_discount numeric; v_vat numeric; v_total numeric;
  v_inv_id uuid; v_inv_num text; v_rcpt_num text; it jsonb;
begin
  if handysam_current_role() not in ('admin','accountant') then
    raise exception 'Not authorized to record POS sales';
  end if;

  select coalesce(sum((e->>'qty')::numeric * (e->>'price')::numeric), 0) into v_subtotal
    from jsonb_array_elements(p_items) e;
  v_discount := v_subtotal * (coalesce(p_discount_pct, 0) / 100);
  v_vat := (v_subtotal - v_discount) * 0.16;
  v_total := v_subtotal - v_discount + v_vat;

  v_inv_num := handysam_next_number('invoice', 'HS_I');
  insert into handysam_invoices (number, date, client, subtotal, discount_pct, discount, vat, total, status, doc_status)
  values (v_inv_num, current_date, coalesce(nullif(p_client, ''), 'Walk-in Customer'),
          v_subtotal, coalesce(p_discount_pct, 0), v_discount, v_vat, v_total, 'paid', 'confirmed')
  returning id into v_inv_id;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into handysam_invoice_items (invoice_id, product_id, description, uom, qty, price)
    values (v_inv_id, nullif(it->>'product_id', '')::uuid, it->>'description', it->>'uom',
            (it->>'qty')::numeric, (it->>'price')::numeric);
    if nullif(it->>'product_id', '') is not null then
      update handysam_products set stock = coalesce(stock, 0) - (it->>'qty')::numeric
        where id = (it->>'product_id')::uuid;
      insert into handysam_stock_moves (product_id, description, type, qty, note)
      values ((it->>'product_id')::uuid, it->>'description', 'out', (it->>'qty')::numeric, 'POS sale ' || v_inv_num);
    end if;
  end loop;

  v_rcpt_num := handysam_next_number('receipt', 'HS_R');
  insert into handysam_receipts (number, date, invoice_id, client, amount, method)
  values (v_rcpt_num, current_date, v_inv_id, coalesce(nullif(p_client, ''), 'Walk-in Customer'), v_total, p_payment_method);

  return query select v_inv_num, v_rcpt_num, v_total;
end;
$$ language plpgsql security definer set search_path = public;

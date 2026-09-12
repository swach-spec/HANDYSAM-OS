-- Confirming an invoice needs to deduct stock, but accountants (who confirm
-- invoices) shouldn't get direct write access to inventory tables. This
-- function does both atomically under the function owner's privileges,
-- after checking the caller is actually allowed to confirm invoices.
create or replace function handysam_confirm_invoice(p_invoice_id uuid)
returns void as $$
declare r record;
begin
  if handysam_current_role() not in ('admin','accountant') then
    raise exception 'Not authorized to confirm invoices';
  end if;

  for r in select * from handysam_invoice_items where invoice_id = p_invoice_id loop
    if r.product_id is not null then
      update handysam_products set stock = coalesce(stock, 0) - r.qty where id = r.product_id;
      insert into handysam_stock_moves (product_id, description, type, qty, note)
      values (r.product_id, r.description, 'out', r.qty, 'Invoice confirmed');
    end if;
  end loop;

  update handysam_invoices set doc_status = 'confirmed' where id = p_invoice_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Products & stock: everyone with a role can view; only admin/procurement can change them.
drop policy if exists "authenticated full access" on handysam_products;
create policy "products read" on handysam_products for select to authenticated
  using (handysam_current_role() is not null);
create policy "products insert" on handysam_products for insert to authenticated
  with check (handysam_current_role() in ('admin','procurement'));
create policy "products update" on handysam_products for update to authenticated
  using (handysam_current_role() in ('admin','procurement'))
  with check (handysam_current_role() in ('admin','procurement'));
create policy "products delete" on handysam_products for delete to authenticated
  using (handysam_current_role() in ('admin','procurement'));

drop policy if exists "authenticated full access" on handysam_stock_moves;
create policy "stock read" on handysam_stock_moves for select to authenticated
  using (handysam_current_role() is not null);
create policy "stock write" on handysam_stock_moves for insert to authenticated
  with check (handysam_current_role() in ('admin','procurement'));

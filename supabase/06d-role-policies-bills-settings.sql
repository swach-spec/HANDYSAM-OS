-- Bills: procurement's domain to create/manage; accountant can view for reconciliation.
drop policy if exists "authenticated full access" on handysam_bills;
create policy "bills read" on handysam_bills for select to authenticated
  using (handysam_current_role() in ('admin','procurement','accountant'));
create policy "bills insert" on handysam_bills for insert to authenticated
  with check (handysam_current_role() in ('admin','procurement'));
create policy "bills update" on handysam_bills for update to authenticated
  using (handysam_current_role() in ('admin','procurement'))
  with check (handysam_current_role() in ('admin','procurement'));
create policy "bills delete" on handysam_bills for delete to authenticated
  using (handysam_current_role() in ('admin','procurement'));

drop policy if exists "authenticated full access" on handysam_bill_items;
create policy "bill items read" on handysam_bill_items for select to authenticated
  using (handysam_current_role() in ('admin','procurement','accountant'));
create policy "bill items write" on handysam_bill_items for all to authenticated
  using (handysam_current_role() in ('admin','procurement'))
  with check (handysam_current_role() in ('admin','procurement'));

-- Settings: everyone can read (needed for PDFs), only admin can change.
drop policy if exists "authenticated full access" on handysam_settings;
create policy "settings read" on handysam_settings for select to authenticated
  using (handysam_current_role() is not null);
create policy "settings write" on handysam_settings for update to authenticated
  using (handysam_current_role() = 'admin') with check (handysam_current_role() = 'admin');

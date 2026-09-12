-- Public bucket for product photos (safe to be public — nothing sensitive).
-- Anyone can view; only admin/procurement (same as who can edit products) can upload.
insert into storage.buckets (id, name, public) values ('product-photos', 'product-photos', true)
  on conflict (id) do nothing;

drop policy if exists "product photos read" on storage.objects;
create policy "product photos read" on storage.objects for select
  using (bucket_id = 'product-photos');

drop policy if exists "product photos write" on storage.objects;
create policy "product photos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and handysam_current_role() in ('admin','procurement'));

drop policy if exists "product photos update" on storage.objects;
create policy "product photos update" on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and handysam_current_role() in ('admin','procurement'));

drop policy if exists "product photos delete" on storage.objects;
create policy "product photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and handysam_current_role() in ('admin','procurement'));

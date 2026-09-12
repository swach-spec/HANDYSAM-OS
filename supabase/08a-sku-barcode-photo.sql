-- SKU: auto-generated (HS-00001, HS-00002, ...) unless one is supplied.
-- Barcode: optional, for a manufacturer's own printed barcode (scan-to-fill).
-- Photo: public URL into the product-photos storage bucket (see 08b).
alter table handysam_products add column if not exists sku text;
alter table handysam_products add column if not exists barcode text;
alter table handysam_products add column if not exists photo_url text;

create sequence if not exists handysam_sku_seq;

create or replace function handysam_set_sku() returns trigger as $$
begin
  if new.sku is null or new.sku = '' then
    new.sku := 'HS-' || lpad(nextval('handysam_sku_seq')::text, 5, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_sku on handysam_products;
create trigger trg_products_sku before insert on handysam_products
  for each row execute function handysam_set_sku();

-- Backfill any products created before this migration.
update handysam_products set sku = 'HS-' || lpad(nextval('handysam_sku_seq')::text, 5, '0')
  where sku is null;

create unique index if not exists handysam_products_sku_key on handysam_products(sku);
create unique index if not exists handysam_products_barcode_key on handysam_products(barcode) where barcode is not null;

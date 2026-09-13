-- Denormalized copy of the product's SKU at the time of the transaction,
-- the same way description/uom already are — so it survives even if the
-- product is later edited or deleted.
alter table handysam_quotation_items add column if not exists sku text;
alter table handysam_invoice_items add column if not exists sku text;
alter table handysam_credit_note_items add column if not exists sku text;
alter table handysam_bill_items add column if not exists sku text;
alter table handysam_stock_moves add column if not exists sku text;

-- Backfill from the current product record wherever possible.
update handysam_quotation_items i set sku = p.sku from handysam_products p where i.product_id = p.id and i.sku is null;
update handysam_invoice_items i set sku = p.sku from handysam_products p where i.product_id = p.id and i.sku is null;
update handysam_credit_note_items i set sku = p.sku from handysam_products p where i.product_id = p.id and i.sku is null;
update handysam_bill_items i set sku = p.sku from handysam_products p where i.product_id = p.id and i.sku is null;
update handysam_stock_moves m set sku = p.sku from handysam_products p where m.product_id = p.id and m.sku is null;

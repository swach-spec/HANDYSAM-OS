-- Quotations: draft -> confirmed -> invoiced (only draft is editable in the app)
alter table handysam_quotations drop constraint if exists handysam_quotations_status_check;
update handysam_quotations set status = 'confirmed' where status = 'sent';
alter table handysam_quotations add constraint handysam_quotations_status_check
  check (status in ('draft','confirmed','invoiced'));

-- Invoices: doc_status (draft/confirmed) is separate from payment status (unpaid/paid).
-- Existing invoices were already issued, so they default to 'confirmed'.
alter table handysam_invoices add column if not exists doc_status text default 'confirmed'
  check (doc_status in ('draft','confirmed'));

-- Sales/accounting documents: admin + accountant only. Procurement gets zero rows.
do $$
declare t text;
begin
  for t in select unnest(array[
    'handysam_quotations','handysam_quotation_items','handysam_invoices','handysam_invoice_items',
    'handysam_receipts','handysam_expenses','handysam_credit_notes','handysam_credit_note_items'
  ])
  loop
    execute format('drop policy if exists "authenticated full access" on %I', t);
    execute format(
      'create policy "accounting access" on %I for all to authenticated using (handysam_current_role() in (''admin'',''accountant'')) with check (handysam_current_role() in (''admin'',''accountant''))',
      t
    );
  end loop;
end $$;

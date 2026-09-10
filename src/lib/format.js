export function fmt(n) {
  n = Number(n) || 0;
  return 'KES ' + n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
export const VAT_RATE = 0.16;

export async function nextNumber(supabase, docType, prefix) {
  const { data, error } = await supabase.rpc('handysam_next_number', { p_doc_type: docType, p_prefix: prefix });
  if (error) throw new Error('Numbering failed (' + error.message + ') — has 04-numbering-and-inventory.sql been run?');
  if (!data) throw new Error('Numbering function returned no value — check handysam_next_number exists in the database.');
  return data;
}

export function calcTotals(items, discountPct) {
  const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);
  const pct = Number(discountPct) || 0;
  const discount = subtotal * (pct / 100);
  const taxable = subtotal - discount;
  const vat = taxable * VAT_RATE;
  return { subtotal, discountPct: pct, discount, taxable, vat, total: taxable + vat };
}

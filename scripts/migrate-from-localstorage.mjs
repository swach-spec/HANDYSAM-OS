// One-time migration: imports a JSON backup exported from the
// standalone handysam-system.html tool (Books tab → "Export all
// data") into this Supabase project.
//
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/migrate-from-localstorage.mjs ./handysam-backup-2026-09-08.json
//
// Uses the SERVICE ROLE key (not the anon key) so it can bypass RLS
// for this one-off import. Never commit the service role key or use
// it in the browser app.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const file = process.argv[2];

if (!url || !key || !file) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-from-localstorage.mjs <backup.json>');
  process.exit(1);
}

const supabase = createClient(url, key);
const db = JSON.parse(readFileSync(file, 'utf8'));

const productIdMap = {};   // old localStorage id -> new uuid
const quoteIdMap = {};
const invoiceIdMap = {};

async function run() {
  console.log('Importing settings...');
  if (db.settings) {
    await supabase.from('handysam_settings').upsert({
      venture: 'handysam',
      name: db.settings.name,
      tagline: db.settings.tagline,
      address: db.settings.address,
      phone: db.settings.phone,
      email: db.settings.email,
      bank_name: db.settings.bankName,
      account_name: db.settings.accountName,
      account_number: db.settings.accountNumber,
      terms: db.settings.terms,
    }, { onConflict: 'venture' });
  }

  console.log(`Importing ${db.products?.length || 0} products...`);
  for (const p of db.products || []) {
    const { data, error } = await supabase.from('handysam_products').insert({
      category: p.category, description: p.description, uom: p.uom,
      cost: p.cost, sell: p.sell, stock: p.stock || 0, flagged: !!p.flagged,
    }).select('id').single();
    if (error) { console.error('product error', p.description, error.message); continue; }
    productIdMap[p.id] = data.id;
  }

  console.log(`Importing ${db.quotations?.length || 0} quotations...`);
  for (const q of db.quotations || []) {
    const { data, error } = await supabase.from('handysam_quotations').insert({
      number: q.number, date: q.date, client: q.client, client_contact: q.clientContact,
      notes: q.notes, discount_pct: q.discountPct || 0, status: q.status,
    }).select('id').single();
    if (error) { console.error('quote error', q.number, error.message); continue; }
    quoteIdMap[q.id] = data.id;
    const items = (q.items || []).map(it => ({
      quotation_id: data.id,
      product_id: productIdMap[it.productId] || null,
      description: it.description, uom: it.uom, qty: it.qty, price: it.price,
    }));
    if (items.length) await supabase.from('handysam_quotation_items').insert(items);
    // recompute + store totals to match the app's own calc
    const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
    const discount = subtotal * ((q.discountPct || 0) / 100);
    const vat = (subtotal - discount) * 0.16;
    await supabase.from('handysam_quotations').update({
      subtotal, discount, vat, total: subtotal - discount + vat,
    }).eq('id', data.id);
  }

  console.log(`Importing ${db.invoices?.length || 0} invoices...`);
  for (const inv of db.invoices || []) {
    const { data, error } = await supabase.from('handysam_invoices').insert({
      number: inv.number, date: inv.date, quotation_id: quoteIdMap[inv.quoteId] || null,
      client: inv.client, client_contact: inv.clientContact, notes: inv.notes,
      discount_pct: inv.discountPct || 0, subtotal: inv.subtotal, discount: inv.discount || 0,
      vat: inv.vat, total: inv.total, status: inv.status,
    }).select('id').single();
    if (error) { console.error('invoice error', inv.number, error.message); continue; }
    invoiceIdMap[inv.id] = data.id;
    const items = (inv.items || []).map(it => ({
      invoice_id: data.id,
      product_id: productIdMap[it.productId] || null,
      description: it.description, uom: it.uom, qty: it.qty, price: it.price,
    }));
    if (items.length) await supabase.from('handysam_invoice_items').insert(items);
  }

  console.log(`Importing ${db.receipts?.length || 0} receipts...`);
  for (const r of db.receipts || []) {
    await supabase.from('handysam_receipts').insert({
      number: r.number, date: r.date, invoice_id: invoiceIdMap[r.invoiceId] || null,
      client: r.client, amount: r.amount, method: r.method,
    });
  }

  console.log(`Importing ${db.expenses?.length || 0} expenses...`);
  for (const e of db.expenses || []) {
    await supabase.from('handysam_expenses').insert({
      date: e.date, category: e.category, vendor: e.vendor, amount: e.amount, note: e.note,
    });
  }

  console.log(`Importing ${db.stockMoves?.length || 0} stock movements...`);
  for (const m of db.stockMoves || []) {
    await supabase.from('handysam_stock_moves').insert({
      date: m.date, product_id: productIdMap[m.productId] || null,
      description: m.description, type: m.type, qty: m.qty, note: m.note,
    });
  }

  // bump counters past whatever numbers were already used
  const maxNum = (arr, prefix) => (arr || [])
    .map(x => parseInt((x.number || '').replace(prefix + '-', ''), 10))
    .filter(n => !isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0);
  await supabase.from('handysam_counters').update({ next_val: maxNum(db.quotations, 'QT') + 1 }).eq('doc_type', 'quote');
  await supabase.from('handysam_counters').update({ next_val: maxNum(db.invoices, 'INV') + 1 }).eq('doc_type', 'invoice');
  await supabase.from('handysam_counters').update({ next_val: maxNum(db.receipts, 'RCT') + 1 }).eq('doc_type', 'receipt');

  console.log('Done.');
}

run().catch(e => { console.error(e); process.exit(1); });

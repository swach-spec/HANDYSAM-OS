import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmt, todayISO, calcTotals, nextNumber } from '../lib/format';
import { buildQuotePDF } from '../lib/pdf';
import ProductPicker from './ProductPicker';

function emptyDraft() {
  return { id: null, number: null, date: todayISO(), client: '', client_contact: '', items: [], notes: '', discountPct: 0, status: 'draft' };
}

export default function Quotations() {
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [draft, setDraft] = useState(null);
  const [picking, setPicking] = useState(false);

  async function loadAll() {
    const [{ data: s }, { data: p }, { data: q }] = await Promise.all([
      supabase.from('handysam_settings').select('*').eq('venture', 'handysam').single(),
      supabase.from('handysam_products').select('*').order('description'),
      supabase.from('handysam_quotations').select('*').order('created_at', { ascending: false }),
    ]);
    setSettings(s); setProducts(p || []); setQuotes(q || []);
  }
  useEffect(() => { loadAll(); }, []);

  function startNew() { setDraft(emptyDraft()); }

  async function openExisting(q) {
    const { data: items } = await supabase.from('handysam_quotation_items').select('*').eq('quotation_id', q.id);
    setDraft({
      id: q.id, number: q.number, date: q.date, client: q.client, client_contact: q.client_contact || '',
      notes: q.notes || '', discountPct: q.discount_pct || 0, status: q.status,
      items: (items || []).map(it => ({ productId: it.product_id, sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price })),
    });
  }

  async function confirmQuote(q) {
    if (!confirm('Confirm this quotation? It will be locked from editing until reverted.')) return;
    await supabase.from('handysam_quotations').update({ status: 'confirmed' }).eq('id', q.id);
    loadAll();
  }

  async function editConfirmed(q) {
    if (!confirm('Revert this quotation to draft so you can edit it?')) return;
    await supabase.from('handysam_quotations').update({ status: 'draft' }).eq('id', q.id);
    const { data: fresh } = await supabase.from('handysam_quotations').select('*').eq('id', q.id).single();
    openExisting(fresh);
  }

  function addLine(p) {
    setDraft(d => ({ ...d, items: [...d.items, { productId: p.id, sku: p.sku, description: p.description, uom: p.uom, qty: 1, price: p.sell || p.cost || 0 }] }));
    setPicking(false);
  }
  function updateLine(idx, field, val) {
    setDraft(d => {
      const items = d.items.slice();
      items[idx] = { ...items[idx], [field]: Number(val) };
      return { ...d, items };
    });
  }
  function removeLine(idx) {
    setDraft(d => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));
  }

  async function saveDraft() {
    if (!draft.client) { alert('Enter a client name first.'); return; }
    if (draft.items.length === 0) { alert('Add at least one line item.'); return; }
    const t = calcTotals(draft.items, draft.discountPct);
    if (!draft.id) {
      let num;
      try { num = await nextNumber(supabase, 'quote', 'HS_Q'); } catch (e) { alert(e.message); return; }
      const { data: q, error } = await supabase.from('handysam_quotations').insert({
        number: num, date: draft.date, client: draft.client, client_contact: draft.client_contact,
        notes: draft.notes, discount_pct: draft.discountPct,
        subtotal: t.subtotal, discount: t.discount, vat: t.vat, total: t.total, status: 'draft',
      }).select('*').single();
      if (error) { alert(error.message); return; }
      const items = draft.items.map(it => ({ quotation_id: q.id, product_id: it.productId, sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price }));
      await supabase.from('handysam_quotation_items').insert(items);
    } else {
      await supabase.from('handysam_quotations').update({
        date: draft.date, client: draft.client, client_contact: draft.client_contact,
        notes: draft.notes, discount_pct: draft.discountPct,
        subtotal: t.subtotal, discount: t.discount, vat: t.vat, total: t.total,
      }).eq('id', draft.id);
      await supabase.from('handysam_quotation_items').delete().eq('quotation_id', draft.id);
      const items = draft.items.map(it => ({ quotation_id: draft.id, product_id: it.productId, sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price }));
      await supabase.from('handysam_quotation_items').insert(items);
    }
    setDraft(null);
    loadAll();
  }

  async function downloadDraftPDF() {
    if (!draft || draft.items.length === 0) { alert('Nothing to export yet.'); return; }
    const t = calcTotals(draft.items, draft.discountPct);
    const doc = buildQuotePDF(settings, {
      number: draft.number, date: draft.date, client: draft.client, client_contact: draft.client_contact,
      notes: draft.notes, discount_pct: t.discountPct, subtotal: t.subtotal, discount: t.discount, vat: t.vat, total: t.total,
    }, draft.items);
    doc.save((draft.number || 'quotation') + '.pdf');
  }

  async function downloadSavedPDF(q) {
    const { data: items } = await supabase.from('handysam_quotation_items').select('*').eq('quotation_id', q.id);
    const doc = buildQuotePDF(settings, q, (items || []).map(it => ({ sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price })));
    doc.save(q.number + '.pdf');
  }

  async function convertToInvoice(q) {
    if (q.status !== 'confirmed') { alert('Confirm this quotation before converting it to an invoice.'); return; }
    if (!confirm('Convert this quotation to a draft invoice? You can review it before confirming (stock is only deducted once the invoice is confirmed).')) return;
    const { data: items } = await supabase.from('handysam_quotation_items').select('*').eq('quotation_id', q.id);
    let num;
    try { num = await nextNumber(supabase, 'invoice', 'HS_I'); } catch (e) { alert(e.message); return; }
    const { data: inv, error } = await supabase.from('handysam_invoices').insert({
      number: num, date: todayISO(), quotation_id: q.id, client: q.client, client_contact: q.client_contact,
      notes: q.notes, discount_pct: q.discount_pct, subtotal: q.subtotal, discount: q.discount, vat: q.vat, total: q.total,
      status: 'unpaid', doc_status: 'draft',
    }).select('*').single();
    if (error) { alert(error.message); return; }
    const invItems = (items || []).map(it => ({ invoice_id: inv.id, product_id: it.product_id, sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price }));
    await supabase.from('handysam_invoice_items').insert(invItems);
    await supabase.from('handysam_quotations').update({ status: 'invoiced' }).eq('id', q.id);
    loadAll();
  }

  if (!settings) return <div className="card">Loading…</div>;

  const t = draft ? calcTotals(draft.items, draft.discountPct) : null;

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Quotations</h2>
          <button className="btn gold" onClick={startNew}>+ New Quotation</button>
        </div>
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>#</th><th>Date</th><th>Client</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {quotes.map(q => (
              <tr key={q.id}>
                <td>{q.number}</td><td>{q.date}</td><td>{q.client}</td><td>{fmt(q.total)}</td>
                <td><span className={`badge ${q.status}`}>{q.status}</span></td>
                <td className="row">
                  {q.status === 'draft' && <button className="btn ghost sm" onClick={() => openExisting(q)}>Open</button>}
                  <button className="btn ghost sm" onClick={() => downloadSavedPDF(q)}>PDF</button>
                  {q.status === 'draft' && <button className="btn gold sm" onClick={() => confirmQuote(q)}>Confirm</button>}
                  {q.status === 'confirmed' && <button className="btn ghost sm" onClick={() => editConfirmed(q)}>Edit</button>}
                  {q.status === 'confirmed' && <button className="btn gold sm" onClick={() => convertToInvoice(q)}>→ Invoice</button>}
                </td>
              </tr>
            ))}
            {quotes.length === 0 && <tr><td colSpan={6} className="empty">No quotations yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{draft.id ? 'Quotation ' + draft.number : 'New Quotation'}</h2>
            <span className="close-x" onClick={() => setDraft(null)}>✕</span>
          </div>
          <div className="grid grid-2">
            <div><label className="muted">Client name</label><br />
              <input style={{ width: '100%' }} value={draft.client} onChange={e => setDraft({ ...draft, client: e.target.value })} /></div>
            <div><label className="muted">Client contact</label><br />
              <input style={{ width: '100%' }} value={draft.client_contact} onChange={e => setDraft({ ...draft, client_contact: e.target.value })} /></div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <div><label className="muted">Date</label><br />
              <input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></div>
          </div>

          <h3 style={{ marginTop: 16 }}>Line items</h3>
          <table>
            <thead><tr><th style={{ width: '30%' }}>Product</th><th>SKU</th><th>UOM</th><th>Qty</th><th>Unit Price</th><th>Line Total</th><th></th></tr></thead>
            <tbody>
              {draft.items.map((it, idx) => (
                <tr key={idx}>
                  <td>{it.description}</td><td className="muted">{it.sku || '—'}</td><td>{it.uom}</td>
                  <td><input type="number" min="0" style={{ width: 70 }} defaultValue={it.qty} onBlur={e => updateLine(idx, 'qty', e.target.value)} /></td>
                  <td><input type="number" min="0" style={{ width: 100 }} defaultValue={it.price} onBlur={e => updateLine(idx, 'price', e.target.value)} /></td>
                  <td>{fmt(it.qty * it.price)}</td>
                  <td><button className="btn danger sm" onClick={() => removeLine(idx)}>✕</button></td>
                </tr>
              ))}
              {draft.items.length === 0 && <tr><td colSpan={6} className="empty">No line items yet — add a product below.</td></tr>}
            </tbody>
          </table>
          <button className="btn ghost sm" onClick={() => setPicking(true)}>+ Add line item</button>

          <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
            <label className="muted">Discount %</label>
            <input type="number" min="0" max="100" style={{ width: 80 }} value={draft.discountPct}
              onChange={e => setDraft({ ...draft, discountPct: Number(e.target.value) || 0 })} />
          </div>
          <div className="totals" style={{ marginTop: 6 }}>
            <div><span>Subtotal</span><span>{fmt(t.subtotal)}</span></div>
            {t.discount > 0 && <div><span>Discount ({t.discountPct}%)</span><span>-{fmt(t.discount)}</span></div>}
            <div><span>VAT (16%)</span><span>{fmt(t.vat)}</span></div>
            <div className="grand"><span>Total</span><span>{fmt(t.total)}</span></div>
          </div>

          <div style={{ marginTop: 10 }}><label className="muted">Notes</label><br />
            <textarea style={{ width: '100%' }} rows={2} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></div>

          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn gold" onClick={saveDraft}>Save Quotation</button>
            {draft.id && <button className="btn ghost" onClick={async () => { await saveDraft(); await confirmQuote(draft); }}>Save & Confirm</button>}
            <button className="btn ghost" onClick={downloadDraftPDF}>Preview / Download PDF</button>
          </div>
        </div>
      )}

      {picking && <ProductPicker products={products} onPick={addLine} onClose={() => setPicking(false)} />}
    </>
  );
}

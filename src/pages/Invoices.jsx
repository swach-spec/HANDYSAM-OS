import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmt, todayISO, calcTotals, nextNumber } from '../lib/format';
import { buildInvoicePDF, buildReceiptPDF } from '../lib/pdf';
import ProductPicker from './ProductPicker';

function emptyDraft() {
  return { id: null, number: null, date: todayISO(), dueDate: '', client: '', client_contact: '', items: [], notes: '', discountPct: 0 };
}

export default function Invoices() {
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [draft, setDraft] = useState(null);
  const [picking, setPicking] = useState(false);

  async function loadAll() {
    const [{ data: s }, { data: p }, { data: inv }, { data: rcts }] = await Promise.all([
      supabase.from('handysam_settings').select('*').eq('venture', 'handysam').single(),
      supabase.from('handysam_products').select('*').order('description'),
      supabase.from('handysam_invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('handysam_receipts').select('*, handysam_invoices(number)').order('created_at', { ascending: false }),
    ]);
    setSettings(s); setProducts(p || []); setInvoices(inv || []); setReceipts(rcts || []);
  }
  useEffect(() => { loadAll(); }, []);

  function startNew() { setDraft(emptyDraft()); }

  async function openExisting(inv) {
    const { data: items } = await supabase.from('handysam_invoice_items').select('*').eq('invoice_id', inv.id);
    setDraft({
      id: inv.id, number: inv.number, date: inv.date, dueDate: inv.due_date || '', client: inv.client,
      client_contact: inv.client_contact || '', notes: inv.notes || '', discountPct: inv.discount_pct || 0,
      items: (items || []).map(it => ({ productId: it.product_id, sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price })),
    });
  }

  function addLine(p) {
    setDraft(d => ({ ...d, items: [...d.items, { productId: p.id, sku: p.sku, description: p.description, uom: p.uom, qty: 1, price: p.sell || p.cost || 0 }] }));
    setPicking(false);
  }
  function updateLine(idx, field, val) {
    setDraft(d => { const items = d.items.slice(); items[idx] = { ...items[idx], [field]: Number(val) }; return { ...d, items }; });
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
      try { num = await nextNumber(supabase, 'invoice', 'HS_I'); } catch (e) { alert(e.message); return; }
      const { data: inv, error } = await supabase.from('handysam_invoices').insert({
        number: num, date: draft.date, due_date: draft.dueDate || null, client: draft.client, client_contact: draft.client_contact,
        notes: draft.notes, discount_pct: draft.discountPct, subtotal: t.subtotal, discount: t.discount, vat: t.vat, total: t.total,
        status: 'unpaid', doc_status: 'draft',
      }).select('*').single();
      if (error) { alert(error.message); return; }
      const items = draft.items.map(it => ({ invoice_id: inv.id, product_id: it.productId, sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price }));
      await supabase.from('handysam_invoice_items').insert(items);
    } else {
      await supabase.from('handysam_invoices').update({
        date: draft.date, due_date: draft.dueDate || null, client: draft.client, client_contact: draft.client_contact,
        notes: draft.notes, discount_pct: draft.discountPct, subtotal: t.subtotal, discount: t.discount, vat: t.vat, total: t.total,
      }).eq('id', draft.id);
      await supabase.from('handysam_invoice_items').delete().eq('invoice_id', draft.id);
      const items = draft.items.map(it => ({ invoice_id: draft.id, product_id: it.productId, sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price }));
      await supabase.from('handysam_invoice_items').insert(items);
    }
    setDraft(null);
    loadAll();
  }

  async function confirmInvoice(inv) {
    if (!confirm('Confirm this invoice? Stock will be deducted for tracked items and it will be locked from editing.')) return;
    const { error } = await supabase.rpc('handysam_confirm_invoice', { p_invoice_id: inv.id });
    if (error) { alert(error.message); return; }
    loadAll();
  }

  async function editDraftInvoice(inv) {
    if (inv.doc_status !== 'draft') { alert('Only draft invoices can be edited directly. Use a credit note for a confirmed invoice.'); return; }
    openExisting(inv);
  }

  async function downloadInvoice(inv) {
    const { data: items } = await supabase.from('handysam_invoice_items').select('*').eq('invoice_id', inv.id);
    const doc = buildInvoicePDF(settings, inv, (items || []).map(it => ({ sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price })));
    doc.save(inv.number + '.pdf');
  }

  async function downloadReceipt(inv) {
    const r = receipts.find(x => x.invoice_id === inv.id);
    if (!r) { alert('No receipt found for this invoice.'); return; }
    const doc = buildReceiptPDF(settings, { ...r, invoiceNumber: inv.number });
    doc.save(r.number + '.pdf');
  }

  async function markPaid(inv) {
    const method = prompt('Payment method (Cash / M-Pesa / Bank Transfer / Cheque):', 'M-Pesa');
    if (method === null) return;
    let num;
    try { num = await nextNumber(supabase, 'receipt', 'HS_R'); } catch (e) { alert(e.message); return; }
    await supabase.from('handysam_receipts').insert({
      number: num, date: todayISO(), invoice_id: inv.id, client: inv.client, amount: inv.total, method,
    });
    await supabase.from('handysam_invoices').update({ status: 'paid' }).eq('id', inv.id);
    loadAll();
  }

  if (!settings) return <div className="card">Loading…</div>;
  const t = draft ? calcTotals(draft.items, draft.discountPct) : null;

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Invoices</h2>
          <button className="btn gold" onClick={startNew}>+ New Invoice</button>
        </div>
        <table>
          <thead><tr><th>#</th><th>Date</th><th>Client</th><th>Total</th><th>Doc Status</th><th>Payment</th><th></th></tr></thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td>{inv.number}</td><td>{inv.date}</td><td>{inv.client}</td><td>{fmt(inv.total)}</td>
                <td><span className={`badge ${inv.doc_status}`}>{inv.doc_status}</span></td>
                <td><span className={`badge ${inv.status}`}>{inv.status}</span></td>
                <td className="row">
                  {inv.doc_status === 'draft' && <button className="btn ghost sm" onClick={() => editDraftInvoice(inv)}>Open</button>}
                  <button className="btn ghost sm" onClick={() => downloadInvoice(inv)}>PDF</button>
                  {inv.doc_status === 'draft' && <button className="btn gold sm" onClick={() => confirmInvoice(inv)}>Confirm</button>}
                  {inv.doc_status === 'confirmed' && inv.status !== 'paid' && <button className="btn gold sm" onClick={() => markPaid(inv)}>Mark Paid</button>}
                  {inv.status === 'paid' && <button className="btn ghost sm" onClick={() => downloadReceipt(inv)}>Receipt PDF</button>}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={7} className="empty">No invoices yet — create one, or convert a confirmed quotation.</td></tr>}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{draft.id ? 'Invoice ' + draft.number : 'New Invoice'}</h2>
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
            <div><label className="muted">Due date</label><br />
              <input type="date" value={draft.dueDate} onChange={e => setDraft({ ...draft, dueDate: e.target.value })} /></div>
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
            <button className="btn gold" onClick={saveDraft}>Save Invoice</button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Receipts issued</h2>
        <table>
          <thead><tr><th>#</th><th>Date</th><th>Invoice</th><th>Amount</th><th>Method</th></tr></thead>
          <tbody>
            {receipts.map(r => (
              <tr key={r.id}><td>{r.number}</td><td>{r.date}</td><td>{r.handysam_invoices?.number}</td><td>{fmt(r.amount)}</td><td>{r.method}</td></tr>
            ))}
            {receipts.length === 0 && <tr><td colSpan={5} className="empty">No receipts yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {picking && <ProductPicker products={products} onPick={addLine} onClose={() => setPicking(false)} />}
    </>
  );
}

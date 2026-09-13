import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmt, todayISO, VAT_RATE, nextNumber } from '../lib/format';
import { buildBillPDF } from '../lib/pdf';
import { loadStaffDirectory, getMyEmail } from '../lib/staff';
import ProductPicker from './ProductPicker';

function emptyDraft() {
  return { id: null, number: null, date: todayISO(), dueDate: '', vendor: '', notes: '', items: [], includeVat: true };
}
function billTotals(items, includeVat) {
  const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);
  const vat = includeVat ? subtotal * VAT_RATE : 0;
  return { subtotal, vat, total: subtotal + vat };
}

export default function Bills({ role }) {
  const canWrite = role === 'admin' || role === 'procurement';
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [bills, setBills] = useState([]);
  const [draft, setDraft] = useState(null);
  const [picking, setPicking] = useState(false);
  const [staff, setStaff] = useState({});
  const [myEmail, setMyEmail] = useState('');

  async function loadAll() {
    const [{ data: s }, { data: p }, { data: b }] = await Promise.all([
      supabase.from('handysam_settings').select('*').eq('venture', 'handysam').single(),
      supabase.from('handysam_products').select('*').order('description'),
      supabase.from('handysam_bills').select('*').order('created_at', { ascending: false }),
    ]);
    setSettings(s); setProducts(p || []); setBills(b || []);
    setStaff(await loadStaffDirectory(supabase));
    setMyEmail(await getMyEmail(supabase));
  }
  useEffect(() => { loadAll(); }, []);

  function startNew() { setDraft(emptyDraft()); }

  async function openExisting(b) {
    const { data: items } = await supabase.from('handysam_bill_items').select('*').eq('bill_id', b.id);
    setDraft({
      id: b.id, number: b.number, date: b.date, dueDate: b.due_date || '', vendor: b.vendor, notes: b.notes || '',
      includeVat: b.vat > 0,
      items: (items || []).map(it => ({ productId: it.product_id, sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price })),
    });
  }

  function addLine(p) { setDraft(d => ({ ...d, items: [...d.items, { productId: p.id, sku: p.sku, description: p.description, uom: p.uom, qty: 1, price: p.cost || 0 }] })); setPicking(false); }
  function addCustomLine() {
    const description = prompt('Line description:'); if (!description) return;
    const qty = Number(prompt('Qty:', '1')) || 1;
    const price = Number(prompt('Unit price (KES):', '0')) || 0;
    setDraft(d => ({ ...d, items: [...d.items, { productId: null, description, uom: '', qty, price }] }));
  }
  function updateLine(idx, field, val) { setDraft(d => { const items = d.items.slice(); items[idx] = { ...items[idx], [field]: Number(val) }; return { ...d, items }; }); }
  function removeLine(idx) { setDraft(d => ({ ...d, items: d.items.filter((_, i) => i !== idx) })); }

  async function saveDraft() {
    if (!draft.vendor) { alert('Enter a vendor name first.'); return; }
    if (draft.items.length === 0) { alert('Add at least one line item.'); return; }
    const t = billTotals(draft.items, draft.includeVat);
    if (!draft.id) {
      let num;
      try { num = await nextNumber(supabase, 'bill', 'HS_B'); } catch (e) { alert(e.message); return; }
      const { data: bill, error } = await supabase.from('handysam_bills').insert({
        number: num, date: draft.date, due_date: draft.dueDate || null, vendor: draft.vendor, notes: draft.notes,
        subtotal: t.subtotal, vat: t.vat, total: t.total, status: 'draft',
      }).select('*').single();
      if (error) { alert(error.message); return; }
      const items = draft.items.map(it => ({ bill_id: bill.id, product_id: it.productId, sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price }));
      await supabase.from('handysam_bill_items').insert(items);
    } else {
      await supabase.from('handysam_bills').update({
        date: draft.date, due_date: draft.dueDate || null, vendor: draft.vendor, notes: draft.notes,
        subtotal: t.subtotal, vat: t.vat, total: t.total,
      }).eq('id', draft.id);
      await supabase.from('handysam_bill_items').delete().eq('bill_id', draft.id);
      const items = draft.items.map(it => ({ bill_id: draft.id, product_id: it.productId, sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price }));
      await supabase.from('handysam_bill_items').insert(items);
    }
    setDraft(null);
    loadAll();
  }

  async function confirmBill(b) {
    if (!confirm('Confirm this bill? It will be locked from editing.')) return;
    await supabase.from('handysam_bills').update({ status: 'confirmed' }).eq('id', b.id);
    loadAll();
  }
  async function editConfirmed(b) {
    if (!confirm('Revert to draft so you can edit it?')) return;
    await supabase.from('handysam_bills').update({ status: 'draft' }).eq('id', b.id);
    const { data: fresh } = await supabase.from('handysam_bills').select('*').eq('id', b.id).single();
    openExisting(fresh);
  }
  async function markPaid(b) {
    const method = prompt('Payment method (Cash / M-Pesa / Bank Transfer / Cheque):', 'Bank Transfer');
    if (method === null) return;
    const date = prompt('Payment date (YYYY-MM-DD):', todayISO()) || todayISO();
    await supabase.from('handysam_bills').update({ status: 'paid', payment_method: method, paid_date: date }).eq('id', b.id);
    loadAll();
  }

  async function downloadPDF(b) {
    const { data: items } = await supabase.from('handysam_bill_items').select('*').eq('bill_id', b.id);
    const doc = buildBillPDF(settings, { ...b, servedByEmail: staff[b.created_by] || myEmail },
      (items || []).map(it => ({ sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price })));
    doc.save(b.number + '.pdf');
  }

  if (!settings) return <div className="card">Loading…</div>;
  const t = draft ? billTotals(draft.items, draft.includeVat) : null;

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Bills (Accounts Payable)</h2>
          <button className="btn gold" onClick={startNew} disabled={!canWrite} style={!canWrite ? { opacity: 0.4, cursor: 'not-allowed' } : {}}>+ New Bill</button>
        </div>
        <table>
          <thead><tr><th>#</th><th>Date</th><th>Vendor</th><th>Due</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {bills.map(b => (
              <tr key={b.id}>
                <td>{b.number}</td><td>{b.date}</td><td>{b.vendor}</td><td>{b.due_date || '—'}</td><td>{fmt(b.total)}</td>
                <td><span className={`badge ${b.status}`}>{b.status}</span></td>
                <td className="row">
                  {b.status === 'draft' && canWrite && <button className="btn ghost sm" onClick={() => openExisting(b)}>Open</button>}
                  <button className="btn ghost sm" onClick={() => downloadPDF(b)}>PDF</button>
                  {b.status === 'draft' && canWrite && <button className="btn gold sm" onClick={() => confirmBill(b)}>Confirm</button>}
                  {b.status === 'confirmed' && canWrite && <button className="btn ghost sm" onClick={() => editConfirmed(b)}>Edit</button>}
                  {b.status === 'confirmed' && canWrite && <button className="btn gold sm" onClick={() => markPaid(b)}>Mark Paid</button>}
                </td>
              </tr>
            ))}
            {bills.length === 0 && <tr><td colSpan={7} className="empty">No bills yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{draft.id ? 'Bill ' + draft.number : 'New Bill'}</h2>
            <span className="close-x" onClick={() => setDraft(null)}>✕</span>
          </div>
          <div className="grid grid-2">
            <div><label className="muted">Vendor</label><br />
              <input style={{ width: '100%' }} value={draft.vendor} onChange={e => setDraft({ ...draft, vendor: e.target.value })} /></div>
            <div><label className="muted">Due date</label><br />
              <input type="date" value={draft.dueDate} onChange={e => setDraft({ ...draft, dueDate: e.target.value })} /></div>
            <div><label className="muted">Date</label><br />
              <input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label className="row"><input type="checkbox" checked={draft.includeVat} onChange={e => setDraft({ ...draft, includeVat: e.target.checked })} /> Vendor charged VAT (16%)</label>
            </div>
          </div>

          <h3 style={{ marginTop: 16 }}>Line items</h3>
          <table>
            <thead><tr><th style={{ width: '30%' }}>Description</th><th>SKU</th><th>UOM</th><th>Qty</th><th>Unit Price</th><th>Line Total</th><th></th></tr></thead>
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
              {draft.items.length === 0 && <tr><td colSpan={6} className="empty">No line items yet.</td></tr>}
            </tbody>
          </table>
          <div className="row">
            <button className="btn ghost sm" onClick={() => setPicking(true)}>+ Add product</button>
            <button className="btn ghost sm" onClick={addCustomLine}>+ Add custom line</button>
          </div>

          <div className="totals" style={{ marginTop: 12 }}>
            <div><span>Subtotal</span><span>{fmt(t.subtotal)}</span></div>
            {draft.includeVat && <div><span>VAT (16%)</span><span>{fmt(t.vat)}</span></div>}
            <div className="grand"><span>Total</span><span>{fmt(t.total)}</span></div>
          </div>

          <div style={{ marginTop: 10 }}><label className="muted">Notes</label><br />
            <textarea style={{ width: '100%' }} rows={2} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></div>

          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn gold" onClick={saveDraft}>Save Bill</button>
          </div>
        </div>
      )}

      {picking && <ProductPicker products={products} onPick={addLine} onClose={() => setPicking(false)} />}
    </>
  );
}

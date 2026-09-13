import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmt, todayISO, calcTotals, nextNumber } from '../lib/format';
import { buildCreditNotePDF } from '../lib/pdf';
import { loadStaffDirectory, getMyEmail } from '../lib/staff';
import ProductPicker from './ProductPicker';

function emptyDraft() {
  return { id: null, number: null, date: todayISO(), invoiceId: '', client: '', client_contact: '', reason: '', notes: '', items: [], discountPct: 0, status: 'draft' };
}

export default function CreditNotes() {
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState(null);
  const [picking, setPicking] = useState(false);
  const [staff, setStaff] = useState({});
  const [myEmail, setMyEmail] = useState('');

  async function loadAll() {
    const [{ data: s }, { data: p }, { data: inv }, { data: cn }] = await Promise.all([
      supabase.from('handysam_settings').select('*').eq('venture', 'handysam').single(),
      supabase.from('handysam_products').select('*').order('description'),
      supabase.from('handysam_invoices').select('id, number, client, client_contact').order('created_at', { ascending: false }),
      supabase.from('handysam_credit_notes').select('*, handysam_invoices(number)').order('created_at', { ascending: false }),
    ]);
    setSettings(s); setProducts(p || []); setInvoices(inv || []); setNotes(cn || []);
    setStaff(await loadStaffDirectory(supabase));
    setMyEmail(await getMyEmail(supabase));
  }
  useEffect(() => { loadAll(); }, []);

  function startNew() { setDraft(emptyDraft()); }

  function pickInvoice(invId) {
    const inv = invoices.find(i => i.id === invId);
    setDraft(d => ({ ...d, invoiceId: invId, client: inv?.client || d.client, client_contact: inv?.client_contact || d.client_contact }));
  }

  async function openExisting(n) {
    const { data: items } = await supabase.from('handysam_credit_note_items').select('*').eq('credit_note_id', n.id);
    setDraft({
      id: n.id, number: n.number, date: n.date, invoiceId: n.invoice_id || '', client: n.client, client_contact: n.client_contact || '',
      reason: n.reason || '', notes: n.notes || '', discountPct: n.discount_pct || 0, status: n.status,
      items: (items || []).map(it => ({ productId: it.product_id, sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price })),
    });
  }

  function addLine(p) { setDraft(d => ({ ...d, items: [...d.items, { productId: p.id, sku: p.sku, description: p.description, uom: p.uom, qty: 1, price: p.sell || p.cost || 0 }] })); setPicking(false); }
  function addCustomLine() {
    const description = prompt('Line description:'); if (!description) return;
    const qty = Number(prompt('Qty:', '1')) || 1;
    const price = Number(prompt('Unit price (KES):', '0')) || 0;
    setDraft(d => ({ ...d, items: [...d.items, { productId: null, description, uom: '', qty, price }] }));
  }
  function updateLine(idx, field, val) { setDraft(d => { const items = d.items.slice(); items[idx] = { ...items[idx], [field]: Number(val) }; return { ...d, items }; }); }
  function removeLine(idx) { setDraft(d => ({ ...d, items: d.items.filter((_, i) => i !== idx) })); }

  async function saveDraft() {
    if (!draft.client) { alert('Enter a client name first.'); return; }
    if (draft.items.length === 0) { alert('Add at least one line item.'); return; }
    const t = calcTotals(draft.items, draft.discountPct);
    if (!draft.id) {
      let num;
      try { num = await nextNumber(supabase, 'credit_note', 'HS_C'); } catch (e) { alert(e.message); return; }
      const { data: cn, error } = await supabase.from('handysam_credit_notes').insert({
        number: num, date: draft.date, invoice_id: draft.invoiceId || null, client: draft.client, client_contact: draft.client_contact,
        reason: draft.reason, notes: draft.notes, discount_pct: draft.discountPct,
        subtotal: t.subtotal, discount: t.discount, vat: t.vat, total: t.total, status: 'draft',
      }).select('*').single();
      if (error) { alert(error.message); return; }
      const items = draft.items.map(it => ({ credit_note_id: cn.id, product_id: it.productId, sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price }));
      await supabase.from('handysam_credit_note_items').insert(items);
    } else {
      await supabase.from('handysam_credit_notes').update({
        date: draft.date, invoice_id: draft.invoiceId || null, client: draft.client, client_contact: draft.client_contact,
        reason: draft.reason, notes: draft.notes, discount_pct: draft.discountPct,
        subtotal: t.subtotal, discount: t.discount, vat: t.vat, total: t.total,
      }).eq('id', draft.id);
      await supabase.from('handysam_credit_note_items').delete().eq('credit_note_id', draft.id);
      const items = draft.items.map(it => ({ credit_note_id: draft.id, product_id: it.productId, sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price }));
      await supabase.from('handysam_credit_note_items').insert(items);
    }
    setDraft(null);
    loadAll();
  }

  async function confirmNote(n) {
    if (!confirm('Confirm this credit note? It will be locked and recorded in the shared ledger.')) return;
    await supabase.from('handysam_credit_notes').update({ status: 'confirmed' }).eq('id', n.id);
    loadAll();
  }
  async function editConfirmed(n) {
    if (!confirm('Revert to draft so you can edit it?')) return;
    await supabase.from('handysam_credit_notes').update({ status: 'draft' }).eq('id', n.id);
    const { data: fresh } = await supabase.from('handysam_credit_notes').select('*').eq('id', n.id).single();
    openExisting(fresh);
  }

  async function downloadPDF(n) {
    const { data: items } = await supabase.from('handysam_credit_note_items').select('*').eq('credit_note_id', n.id);
    const doc = buildCreditNotePDF(settings, { ...n, servedByEmail: staff[n.created_by] || myEmail },
      (items || []).map(it => ({ sku: it.sku, description: it.description, uom: it.uom, qty: it.qty, price: it.price })), n.handysam_invoices?.number);
    doc.save(n.number + '.pdf');
  }

  if (!settings) return <div className="card">Loading…</div>;
  const t = draft ? calcTotals(draft.items, draft.discountPct) : null;

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Credit Notes</h2>
          <button className="btn gold" onClick={startNew}>+ New Credit Note</button>
        </div>
        <table>
          <thead><tr><th>#</th><th>Date</th><th>Client</th><th>Against Invoice</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {notes.map(n => (
              <tr key={n.id}>
                <td>{n.number}</td><td>{n.date}</td><td>{n.client}</td><td>{n.handysam_invoices?.number || '—'}</td><td>{fmt(n.total)}</td>
                <td><span className={`badge ${n.status}`}>{n.status}</span></td>
                <td className="row">
                  {n.status === 'draft' && <button className="btn ghost sm" onClick={() => openExisting(n)}>Open</button>}
                  <button className="btn ghost sm" onClick={() => downloadPDF(n)}>PDF</button>
                  {n.status === 'draft' && <button className="btn gold sm" onClick={() => confirmNote(n)}>Confirm</button>}
                  {n.status === 'confirmed' && <button className="btn ghost sm" onClick={() => editConfirmed(n)}>Edit</button>}
                </td>
              </tr>
            ))}
            {notes.length === 0 && <tr><td colSpan={7} className="empty">No credit notes yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{draft.id ? 'Credit Note ' + draft.number : 'New Credit Note'}</h2>
            <span className="close-x" onClick={() => setDraft(null)}>✕</span>
          </div>
          <div className="grid grid-2">
            <div><label className="muted">Against invoice (optional)</label><br />
              <select style={{ width: '100%' }} value={draft.invoiceId} onChange={e => pickInvoice(e.target.value)}>
                <option value="">— none —</option>
                {invoices.map(i => <option key={i.id} value={i.id}>{i.number} — {i.client}</option>)}
              </select></div>
            <div><label className="muted">Date</label><br />
              <input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></div>
            <div><label className="muted">Client name</label><br />
              <input style={{ width: '100%' }} value={draft.client} onChange={e => setDraft({ ...draft, client: e.target.value })} /></div>
            <div><label className="muted">Client contact</label><br />
              <input style={{ width: '100%' }} value={draft.client_contact} onChange={e => setDraft({ ...draft, client_contact: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 10 }}><label className="muted">Reason</label><br />
            <input style={{ width: '100%' }} placeholder="e.g. returned goods, pricing correction" value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} /></div>

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

          <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
            <label className="muted">Discount %</label>
            <input type="number" min="0" max="100" style={{ width: 80 }} value={draft.discountPct}
              onChange={e => setDraft({ ...draft, discountPct: Number(e.target.value) || 0 })} />
          </div>
          <div className="totals" style={{ marginTop: 6 }}>
            <div><span>Subtotal</span><span>{fmt(t.subtotal)}</span></div>
            {t.discount > 0 && <div><span>Discount ({t.discountPct}%)</span><span>-{fmt(t.discount)}</span></div>}
            <div><span>VAT (16%)</span><span>{fmt(t.vat)}</span></div>
            <div className="grand"><span>Total Credit</span><span>{fmt(t.total)}</span></div>
          </div>

          <div style={{ marginTop: 10 }}><label className="muted">Notes</label><br />
            <textarea style={{ width: '100%' }} rows={2} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></div>

          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn gold" onClick={saveDraft}>Save Credit Note</button>
          </div>
        </div>
      )}

      {picking && <ProductPicker products={products} onPick={addLine} onClose={() => setPicking(false)} />}
    </>
  );
}

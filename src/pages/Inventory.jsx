import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/format';
import { buildStockListPDF } from '../lib/pdf';
import ProductPicker from './ProductPicker';

export default function Inventory() {
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [moves, setMoves] = useState([]);
  const [pickAction, setPickAction] = useState(null); // 'in' | 'adjustment' | 'retake' | null

  async function loadAll() {
    const [{ data: s }, { data: p }, { data: m }] = await Promise.all([
      supabase.from('handysam_settings').select('*').eq('venture', 'handysam').single(),
      supabase.from('handysam_products').select('*').order('category').order('description'),
      supabase.from('handysam_stock_moves').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    setSettings(s); setProducts(p || []); setMoves(m || []);
  }
  useEffect(() => { loadAll(); }, []);

  async function stockIn(p) {
    setPickAction(null);
    const qty = Number(prompt(`Quantity received for "${p.description}":`, '1'));
    if (!qty) return;
    const date = prompt('Date (YYYY-MM-DD):', todayISO()) || todayISO();
    const note = prompt('Note (e.g. supplier / PO ref):', '') || '';
    await supabase.from('handysam_products').update({ stock: (p.stock || 0) + qty }).eq('id', p.id);
    await supabase.from('handysam_stock_moves').insert({ date, product_id: p.id, description: p.description, type: 'in', qty, note });
    loadAll();
  }

  async function stockAdjustment(p) {
    setPickAction(null);
    const delta = Number(prompt(`Adjustment for "${p.description}" — use a negative number for a decrease (e.g. -2 for breakage/loss):`, '0'));
    if (!delta) return;
    const date = prompt('Date (YYYY-MM-DD):', todayISO()) || todayISO();
    const reason = prompt('Reason for this adjustment:', '') || '';
    await supabase.from('handysam_products').update({ stock: (p.stock || 0) + delta }).eq('id', p.id);
    await supabase.from('handysam_stock_moves').insert({ date, product_id: p.id, description: p.description, type: 'adjustment', qty: delta, note: reason });
    loadAll();
  }

  async function stockRetake(p) {
    setPickAction(null);
    const countedStr = prompt(`Physical count for "${p.description}" — system currently shows ${p.stock || 0}:`, String(p.stock || 0));
    if (countedStr === null) return;
    const counted = Number(countedStr);
    const variance = counted - (p.stock || 0);
    const date = prompt('Stocktake date (YYYY-MM-DD):', todayISO()) || todayISO();
    const newCostStr = prompt('New cost price observed during this stocktake (leave blank to keep current):', '');
    const patch = { stock: counted };
    if (newCostStr) { patch.cost = Number(newCostStr); patch.flagged = false; }
    await supabase.from('handysam_products').update(patch).eq('id', p.id);
    await supabase.from('handysam_stock_moves').insert({
      date, product_id: p.id, description: p.description, type: 'retake', qty: variance,
      note: `Stocktake — counted ${counted} (system showed ${p.stock || 0})`,
      new_cost: newCostStr ? Number(newCostStr) : null,
    });
    loadAll();
  }

  async function downloadStockList() {
    const doc = buildStockListPDF(settings, products);
    doc.save('HandySam-Stock-List-' + todayISO() + '.pdf');
  }

  const pickHandlers = { in: stockIn, adjustment: stockAdjustment, retake: stockRetake };

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Stock Levels</h2>
          <div className="row">
            <button className="btn gold" onClick={() => setPickAction('in')}>+ Stock In</button>
            <button className="btn ghost" onClick={() => setPickAction('adjustment')}>± Adjustment</button>
            <button className="btn ghost" onClick={() => setPickAction('retake')}>Stock Retake</button>
            <button className="btn ghost" onClick={downloadStockList}>Download Stock List (PDF)</button>
          </div>
        </div>
        <table>
          <thead><tr><th>Product</th><th>Category</th><th>UOM</th><th>Stock</th><th>Status</th></tr></thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id}>
                <td>{p.description}</td><td className="muted">{p.category}</td><td>{p.uom}</td>
                <td>{p.stock || 0}</td>
                <td><span className={`badge ${(p.stock || 0) <= 3 ? 'low' : 'ok'}`}>{(p.stock || 0) <= 3 ? 'Low / Restock' : 'OK'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>Stock Movement Log</h2>
        <table>
          <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Note</th></tr></thead>
          <tbody>
            {moves.map(m => (
              <tr key={m.id}>
                <td>{m.date}</td><td>{m.description}</td>
                <td><span className={`badge ${m.type === 'in' ? 'ok' : m.type === 'out' ? 'unpaid' : m.type === 'retake' ? 'draft' : 'sent'}`}>{m.type}</span></td>
                <td>{m.qty > 0 && m.type !== 'in' ? '+' : ''}{m.qty}</td><td className="muted">{m.note}</td>
              </tr>
            ))}
            {moves.length === 0 && <tr><td colSpan={5} className="empty">No stock movements yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {pickAction && <ProductPicker products={products} onPick={pickHandlers[pickAction]} onClose={() => setPickAction(null)} />}
    </>
  );
}

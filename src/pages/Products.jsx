import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');

  async function load() {
    const { data, error } = await supabase.from('handysam_products').select('*').order('category').order('description');
    if (!error) setProducts(data);
  }
  useEffect(() => { load(); }, []);

  const cats = [...new Set(products.map(p => p.category))];
  const rows = products.filter(p =>
    (cat === 'all' || p.category === cat) && p.description.toLowerCase().includes(q.toLowerCase())
  );

  async function updateField(id, field, value) {
    const patch = { [field]: value === '' ? null : Number(value) };
    if (field === 'cost') patch.flagged = !patch.cost;
    setProducts(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));
    await supabase.from('handysam_products').update(patch).eq('id', id);
  }

  async function deleteProduct(id) {
    if (!confirm('Delete this product? Past quotations/invoices keep their own copy of the line item.')) return;
    await supabase.from('handysam_products').delete().eq('id', id);
    load();
  }

  async function addProduct() {
    const description = prompt('Product description:'); if (!description) return;
    const category = prompt('Category:', 'MGPS') || 'Uncategorised';
    const uom = prompt('Unit of measure (Pcs / Mtr / Unit / Set):', 'Pcs') || 'Pcs';
    const cost = Number(prompt('Cost price (KES):', '0')) || 0;
    const sell = Number(prompt('Sell price (KES):', String(cost))) || cost;
    await supabase.from('handysam_products').insert({ description, category, uom, cost, sell, stock: 0, flagged: !cost });
    load();
  }

  return (
    <div className="card">
      <h2>Product & Price List</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="search" placeholder="Search product..." value={q} onChange={e => setQ(e.target.value)} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ minWidth: 180 }}>
          <option value="all">All categories</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn gold" onClick={addProduct}>+ Add Product</button>
      </div>
      <div style={{ maxHeight: 560, overflow: 'auto' }}>
        <table>
          <thead><tr><th>Category</th><th>Description</th><th>UOM</th><th>Cost</th><th>Sell Price</th><th>Stock</th><th></th></tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id}>
                <td className="muted">{p.category}</td>
                <td>{p.description}{p.flagged && <div className="flag">⚑ cost not confirmed</div>}</td>
                <td>{p.uom}</td>
                <td><input type="number" style={{ width: 90 }} defaultValue={p.cost ?? ''} onBlur={e => updateField(p.id, 'cost', e.target.value)} /></td>
                <td><input type="number" style={{ width: 90 }} defaultValue={p.sell ?? ''} onBlur={e => updateField(p.id, 'sell', e.target.value)} /></td>
                <td><input type="number" style={{ width: 70 }} defaultValue={p.stock ?? 0} onBlur={e => updateField(p.id, 'stock', e.target.value)} /></td>
                <td><button className="btn danger sm" onClick={() => deleteProduct(p.id)}>Delete</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="empty">No products match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

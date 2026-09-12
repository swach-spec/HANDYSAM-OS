import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadProductPhoto } from '../lib/storage';
import { lazy, Suspense } from 'react';
const CameraScanner = lazy(() => import('./CameraScanner'));

export default function Products() {
  const [products, setProducts] = useState([]);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [scanningFor, setScanningFor] = useState(null); // product id currently receiving a camera scan
  const fileInputs = useRef({});

  async function load() {
    const { data, error } = await supabase.from('handysam_products').select('*').order('category').order('description');
    if (!error) setProducts(data);
  }
  useEffect(() => { load(); }, []);

  const cats = [...new Set(products.map(p => p.category))];
  const rows = products.filter(p =>
    (cat === 'all' || p.category === cat) &&
    (p.description.toLowerCase().includes(q.toLowerCase()) || (p.sku || '').toLowerCase().includes(q.toLowerCase()) || (p.barcode || '').includes(q))
  );

  async function updateField(id, field, value) {
    const patch = { [field]: value === '' ? null : Number(value) };
    if (field === 'cost') patch.flagged = !patch.cost;
    setProducts(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));
    await supabase.from('handysam_products').update(patch).eq('id', id);
  }

  async function updateBarcode(id, value) {
    const barcode = value.trim() || null;
    setProducts(ps => ps.map(p => p.id === id ? { ...p, barcode } : p));
    const { error } = await supabase.from('handysam_products').update({ barcode }).eq('id', id);
    if (error) alert('Could not save barcode — it may already be used on another product.');
  }

  async function handlePhotoChange(id, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadProductPhoto(supabase, id, file);
      await supabase.from('handysam_products').update({ photo_url: url }).eq('id', id);
      setProducts(ps => ps.map(p => p.id === id ? { ...p, photo_url: url } : p));
    } catch (err) {
      alert('Photo upload failed: ' + err.message);
    }
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
        <input className="search" placeholder="Search description, SKU or barcode..." value={q} onChange={e => setQ(e.target.value)} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ minWidth: 180 }}>
          <option value="all">All categories</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn gold" onClick={addProduct}>+ Add Product</button>
      </div>
      <div style={{ maxHeight: 560, overflow: 'auto' }}>
        <table>
          <thead><tr><th>Photo</th><th>SKU</th><th>Category</th><th>Description</th><th>Barcode</th><th>UOM</th><th>Cost</th><th>Sell Price</th><th>Stock</th><th></th></tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id}>
                <td>
                  <div
                    onClick={() => fileInputs.current[p.id]?.click()}
                    style={{ width: 36, height: 36, borderRadius: 6, background: '#f0f1f3', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                    title="Click to upload a photo"
                  >
                    {p.photo_url
                      ? <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 16, color: '#bbb' }}>＋</span>}
                  </div>
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    ref={el => { fileInputs.current[p.id] = el; }}
                    onChange={e => handlePhotoChange(p.id, e)} />
                </td>
                <td className="muted">{p.sku}</td>
                <td className="muted">{p.category}</td>
                <td>{p.description}{p.flagged && <div className="flag">⚑ cost not confirmed</div>}</td>
                <td>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input key={p.id + '-' + (p.barcode || '')} placeholder="Scan or type…" style={{ width: 100 }} defaultValue={p.barcode || ''}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                      onBlur={e => updateBarcode(p.id, e.target.value)} />
                    <button className="btn ghost sm" title="Scan with phone camera" onClick={() => setScanningFor(p.id)}>📷</button>
                  </div>
                </td>
                <td>{p.uom}</td>
                <td><input type="number" style={{ width: 90 }} defaultValue={p.cost ?? ''} onBlur={e => updateField(p.id, 'cost', e.target.value)} /></td>
                <td><input type="number" style={{ width: 90 }} defaultValue={p.sell ?? ''} onBlur={e => updateField(p.id, 'sell', e.target.value)} /></td>
                <td><input type="number" style={{ width: 70 }} defaultValue={p.stock ?? 0} onBlur={e => updateField(p.id, 'stock', e.target.value)} /></td>
                <td><button className="btn danger sm" onClick={() => deleteProduct(p.id)}>Delete</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="empty">No products match.</td></tr>}
          </tbody>
        </table>
      </div>

      {scanningFor && (
        <Suspense fallback={null}>
          <CameraScanner
            onDetect={(code) => { updateBarcode(scanningFor, code); setScanningFor(null); }}
            onClose={() => setScanningFor(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

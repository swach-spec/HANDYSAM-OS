import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmt, calcTotals } from '../lib/format';
import { buildReceiptPDF } from '../lib/pdf';

export default function POS() {
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState([]); // [{productId, description, uom, price, qty}]
  const [customer, setCustomer] = useState('');
  const [discountPct, setDiscountPct] = useState(0);
  const [payment, setPayment] = useState(null);
  const [charging, setCharging] = useState(false);
  const [sale, setSale] = useState(null); // {invoiceNumber, receiptNumber, total}

  useEffect(() => {
    supabase.from('handysam_settings').select('*').eq('venture', 'handysam').single().then(({ data }) => setSettings(data));
    supabase.from('handysam_products').select('*').order('description').then(({ data }) => setProducts(data || []));
  }, []);

  const categories = useMemo(() => ['All', ...new Set(products.map(p => p.category).filter(Boolean))], [products]);
  const visible = products.filter(p =>
    (category === 'All' || p.category === category) && p.description.toLowerCase().includes(search.toLowerCase())
  );

  const t = calcTotals(cart, discountPct);

  function addToCart(p) {
    setCart(c => {
      const idx = c.findIndex(x => x.productId === p.id);
      if (idx >= 0) { const copy = c.slice(); copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 }; return copy; }
      return [...c, { productId: p.id, description: p.description, uom: p.uom, price: p.sell || p.cost || 0, qty: 1 }];
    });
  }
  function setQty(idx, qty) {
    setCart(c => { if (qty <= 0) return c.filter((_, i) => i !== idx); const copy = c.slice(); copy[idx] = { ...copy[idx], qty }; return copy; });
  }
  function removeLine(idx) { setCart(c => c.filter((_, i) => i !== idx)); }

  async function charge() {
    if (cart.length === 0 || !payment) return;
    setCharging(true);
    const { data, error } = await supabase.rpc('handysam_pos_sale', {
      p_client: customer, p_items: cart.map(it => ({ product_id: it.productId, description: it.description, uom: it.uom, qty: it.qty, price: it.price })),
      p_discount_pct: discountPct, p_payment_method: payment,
    });
    setCharging(false);
    if (error) { alert(error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    setSale(row);
  }

  function downloadReceipt() {
    const doc = buildReceiptPDF(settings, {
      number: sale.receipt_number, date: new Date().toISOString().slice(0, 10),
      client: customer || 'Walk-in Customer', amount: sale.total, method: payment, invoiceNumber: sale.invoice_number,
    });
    doc.save(sale.receipt_number + '.pdf');
  }

  function newSale() {
    setSale(null); setCart([]); setCustomer(''); setDiscountPct(0); setPayment(null); setSearch(''); setCategory('All');
  }

  if (!settings) return <div className="card">Loading…</div>;

  return (
    <div className="pos-shell">
      <div className="pos-catalog">
        <div className="pos-catalog-header">
          <input placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        </div>
        <div className="pos-cats">
          {categories.map(c => (
            <button key={c} className={`pos-cat-pill ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
        <div className="pos-grid">
          {visible.map(p => (
            <button key={p.id} className="pos-tile" onClick={() => addToCart(p)}>
              <span className="name">{p.description}</span>
              <span className="price">{fmt(p.sell || p.cost || 0)}</span>
              {(p.stock || 0) <= 3 && (p.stock || 0) > 0 && <span className="low">Low stock: {p.stock}</span>}
            </button>
          ))}
          {visible.length === 0 && <div className="muted" style={{ padding: 20 }}>No products match.</div>}
        </div>
      </div>

      <div className="pos-register">
        {sale ? (
          <div className="pos-success">
            <div className="check">✓</div>
            <div>Sale complete</div>
            <div className="amt">{fmt(sale.total)}</div>
            <div className="muted" style={{ color: '#999' }}>{sale.invoice_number} · {sale.receipt_number}</div>
            <button className="btn gold" onClick={downloadReceipt} style={{ width: '100%' }}>Download Receipt PDF</button>
            <button className="pos-charge" onClick={newSale} style={{ width: '100%' }}>New Sale</button>
          </div>
        ) : (
          <>
            <h3>Current Sale</h3>
            <div className="pos-cart">
              {cart.length === 0 && <div className="pos-cart-empty">Tap a product to add it</div>}
              {cart.map((it, idx) => (
                <div className="pos-line" key={idx}>
                  <div className="desc">{it.description}<span className="unit">{fmt(it.price)} / {it.uom || 'unit'}</span></div>
                  <div className="pos-qty">
                    <button onClick={() => setQty(idx, it.qty - 1)}>−</button>
                    <span>{it.qty}</span>
                    <button onClick={() => setQty(idx, it.qty + 1)}>+</button>
                  </div>
                  <div className="linetotal">{fmt(it.qty * it.price)}</div>
                  <span className="rm" onClick={() => removeLine(idx)}>✕</span>
                </div>
              ))}
            </div>

            <div className="pos-customer">
              <input placeholder="Customer (optional — defaults to Walk-in)" value={customer} onChange={e => setCustomer(e.target.value)} />
            </div>

            <div className="pos-totals">
              <div><span>Subtotal</span><span>{fmt(t.subtotal)}</span></div>
              {t.discount > 0 && <div><span>Discount ({t.discountPct}%)</span><span>-{fmt(t.discount)}</span></div>}
              <div><span>VAT (16%)</span><span>{fmt(t.vat)}</span></div>
              <div className="total"><span>Total</span><span>{fmt(t.total)}</span></div>
            </div>

            <div className="pos-pay">
              {['Cash', 'M-Pesa', 'Bank/Card'].map(m => (
                <button key={m} className={payment === m ? 'active' : ''} onClick={() => setPayment(m)}>{m}</button>
              ))}
            </div>

            <button className="pos-charge" disabled={cart.length === 0 || !payment || charging} onClick={charge}>
              {charging ? 'Processing…' : `Charge ${fmt(t.total)}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

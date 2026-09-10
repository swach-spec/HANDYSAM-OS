import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmt } from '../lib/format';

export default function Dashboard({ goTo }) {
  const [snap, setSnap] = useState(null);

  async function load() {
    const { data, error } = await supabase.from('handysam_dashboard_snapshot').select('*').single();
    if (!error) setSnap(data);
  }
  useEffect(() => {
    load();
    // live-refresh whenever anything relevant changes — same tables Command Center subscribes to
    const channel = supabase.channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handysam_invoices' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handysam_receipts' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handysam_expenses' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handysam_products' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  if (!snap) return <div className="card">Loading…</div>;

  return (
    <>
      <div className="grid grid-4">
        <div className="stat"><div className="num">{snap.product_count}</div><div className="lbl">Products in catalog</div></div>
        <div className="stat"><div className="num">{snap.open_quotations}</div><div className="lbl">Open quotations</div></div>
        <div className="stat"><div className="num">{fmt(snap.unpaid_amount)}</div><div className="lbl">{snap.unpaid_invoices} unpaid invoice(s)</div></div>
        <div className="stat"><div className="num">{fmt(snap.month_income - snap.month_expense)}</div><div className="lbl">Net cash flow — this month</div></div>
      </div>
      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>This month</h2>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Income received</span><b style={{ color: 'var(--green)' }}>{fmt(snap.month_income)}</b></div>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Expenses recorded</span><b style={{ color: 'var(--red)' }}>{fmt(snap.month_expense)}</b></div>
        </div>
        <div className="card">
          <h2>Needs attention</h2>
          <div className="muted">{snap.unconfirmed_price_count} product(s) still missing a confirmed cost price.</div>
          <div className="muted">{snap.low_stock_count} product(s) at low stock (≤3 units).</div>
          <div className="muted">{snap.unpaid_invoices} invoice(s) awaiting payment.</div>
        </div>
      </div>
      <div className="card">
        <h2>Quick actions</h2>
        <div className="row">
          <button className="btn gold" onClick={() => goTo('quotations')}>+ New Quotation</button>
          <button className="btn ghost" onClick={() => goTo('expenses')}>+ Log Expense</button>
          <button className="btn ghost" onClick={() => goTo('inventory')}>+ Stock In</button>
        </div>
      </div>
    </>
  );
}

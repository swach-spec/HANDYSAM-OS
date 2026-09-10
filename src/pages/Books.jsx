import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmt } from '../lib/format';

export default function Books() {
  const [monthly, setMonthly] = useState([]);
  const [entries, setEntries] = useState([]);

  async function load() {
    const [{ data: m }, { data: receipts }, { data: expenses }] = await Promise.all([
      supabase.from('handysam_monthly_summary').select('*'),
      supabase.from('handysam_receipts').select('*, handysam_invoices(number)'),
      supabase.from('handysam_expenses').select('*'),
    ]);
    setMonthly(m || []);
    const combined = [
      ...(receipts || []).map(r => ({ date: r.date, type: 'Income', desc: `Payment — ${r.handysam_invoices?.number || ''} (${r.client})`, amount: r.amount })),
      ...(expenses || []).map(e => ({ date: e.date, type: 'Expense', desc: e.category + (e.vendor ? ' — ' + e.vendor : ''), amount: -Number(e.amount) })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    setEntries(combined.map(e => { running += e.amount; return { ...e, running }; }));
  }
  useEffect(() => { load(); }, []);

  function exportBackup() {
    supabase.from('handysam_products').select('*').then(({ data: products }) => {
      const blob = new Blob([JSON.stringify({ products, entries, monthly }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'handysam-books-export-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
    });
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Monthly Summary</h2>
          <button className="btn ghost" onClick={exportBackup}>Export data (JSON)</button>
        </div>
        <table>
          <thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Net</th></tr></thead>
          <tbody>
            {monthly.map(r => (
              <tr key={r.month}>
                <td>{r.month?.slice(0, 7)}</td>
                <td style={{ color: 'var(--green)' }}>{fmt(r.income)}</td>
                <td style={{ color: 'var(--red)' }}>{fmt(r.expense)}</td>
                <td><b>{fmt(r.net)}</b></td>
              </tr>
            ))}
            {monthly.length === 0 && <tr><td colSpan={4} className="empty">No activity yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>Ledger</h2>
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th><th>Running Balance</th></tr></thead>
          <tbody>
            {entries.slice().reverse().map((r, i) => (
              <tr key={i}>
                <td>{r.date}</td>
                <td><span className={`badge ${r.type === 'Income' ? 'ok' : 'unpaid'}`}>{r.type}</span></td>
                <td>{r.desc}</td>
                <td style={{ color: r.amount < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(r.amount)}</td>
                <td>{fmt(r.running)}</td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={5} className="empty">Nothing recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="footer-note">
        This same data (handysam_monthly_summary, handysam_dashboard_snapshot) is what Meide Command Center reads for live HandySam analytics — no separate export needed for that.
      </div>
    </>
  );
}

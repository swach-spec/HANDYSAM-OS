import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmt, todayISO } from '../lib/format';

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState({ date: todayISO(), category: '', vendor: '', amount: '', note: '' });

  async function load() {
    const { data } = await supabase.from('handysam_expenses').select('*').order('date', { ascending: false });
    setExpenses(data || []);
  }
  useEffect(() => { load(); }, []);

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

  async function addExpense() {
    if (!form.amount) { alert('Enter an amount.'); return; }
    await supabase.from('handysam_expenses').insert({
      date: form.date, category: form.category || 'Uncategorised', vendor: form.vendor,
      amount: Number(form.amount), note: form.note,
    });
    setForm({ date: todayISO(), category: '', vendor: '', amount: '', note: '' });
    load();
  }

  async function deleteExpense(id) {
    await supabase.from('handysam_expenses').delete().eq('id', id);
    load();
  }

  return (
    <>
      <div className="card">
        <h2>Log an expense</h2>
        <div className="row">
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <input placeholder="Category (e.g. Materials, Transport, Labour)" style={{ width: 220 }}
            value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
          <input placeholder="Paid to / Vendor" style={{ width: 180 }}
            value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} />
          <input type="number" placeholder="Amount (KES)" style={{ width: 140 }}
            value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          <input placeholder="Note" style={{ width: 200 }}
            value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
          <button className="btn gold" onClick={addExpense}>Add</button>
        </div>
      </div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Expenses</h2>
          <b>Total: {fmt(total)}</b>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Amount</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {expenses.map(e => (
              <tr key={e.id}>
                <td>{e.date}</td><td>{e.category}</td><td>{e.vendor}</td><td>{fmt(e.amount)}</td>
                <td className="muted">{e.note}</td>
                <td><button className="btn danger sm" onClick={() => deleteExpense(e.id)}>✕</button></td>
              </tr>
            ))}
            {expenses.length === 0 && <tr><td colSpan={6} className="empty">No expenses logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Settings({ role }) {
  const [s, setS] = useState(null);
  const [users, setUsers] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('accountant');

  async function load() {
    const { data } = await supabase.from('handysam_settings').select('*').eq('venture', 'handysam').single();
    setS(data);
  }
  async function loadUsers() {
    if (role !== 'admin') return;
    const { data, error } = await supabase.rpc('handysam_list_user_roles');
    if (!error) setUsers(data || []);
  }
  useEffect(() => { load(); loadUsers(); }, []);

  async function save() {
    const { id, ...patch } = s;
    await supabase.from('handysam_settings').update(patch).eq('id', id);
    alert('Saved.');
  }

  async function assignRole() {
    if (!newEmail) { alert('Enter an email.'); return; }
    const { error } = await supabase.rpc('handysam_assign_role', { p_email: newEmail, p_role: newRole });
    if (error) { alert(error.message); return; }
    setNewEmail('');
    loadUsers();
  }

  if (!s) return <div className="card">Loading…</div>;
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });

  return (
    <>
      <div className="card">
        <h2>Company details</h2>
        <div className="muted" style={{ marginBottom: 10 }}>These appear on every quotation, invoice and receipt PDF.</div>
        <div className="grid grid-2">
          <div><label className="muted">Company name</label><br /><input style={{ width: '100%' }} value={s.name || ''} onChange={set('name')} /></div>
          <div><label className="muted">Tagline</label><br /><input style={{ width: '100%' }} value={s.tagline || ''} onChange={set('tagline')} /></div>
          <div><label className="muted">Address</label><br /><input style={{ width: '100%' }} value={s.address || ''} onChange={set('address')} /></div>
          <div><label className="muted">Phone</label><br /><input style={{ width: '100%' }} value={s.phone || ''} onChange={set('phone')} /></div>
          <div><label className="muted">Email</label><br /><input style={{ width: '100%' }} value={s.email || ''} onChange={set('email')} /></div>
        </div>
      </div>
      <div className="card">
        <h2>Pay-to bank details</h2>
        <div className="grid grid-2">
          <div><label className="muted">Bank name</label><br /><input style={{ width: '100%' }} value={s.bank_name || ''} onChange={set('bank_name')} /></div>
          <div><label className="muted">Account name</label><br /><input style={{ width: '100%' }} value={s.account_name || ''} onChange={set('account_name')} /></div>
          <div><label className="muted">Account number</label><br /><input style={{ width: '100%' }} value={s.account_number || ''} onChange={set('account_number')} /></div>
        </div>
      </div>
      <div className="card">
        <h2>Terms & conditions</h2>
        <div className="muted" style={{ marginBottom: 6 }}>Printed at the bottom of every quotation and invoice, below the total.</div>
        <textarea style={{ width: '100%' }} rows={3} value={s.terms || ''} onChange={set('terms')} />
      </div>
      <div className="row"><button className="btn gold" onClick={save}>Save settings</button></div>

      {role === 'admin' && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Manage Users</h2>
          <div className="muted" style={{ marginBottom: 10 }}>
            The person must have signed in at least once (via the login screen or a magic link) before you can assign them a role.
          </div>
          <div className="row">
            <input placeholder="user@email.com" style={{ width: 240 }} value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            <select value={newRole} onChange={e => setNewRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="accountant">Accountant</option>
              <option value="procurement">Procurement</option>
            </select>
            <button className="btn gold" onClick={assignRole}>Assign</button>
          </div>
          <table style={{ marginTop: 14 }}>
            <thead><tr><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id}><td>{u.email}</td><td style={{ textTransform: 'capitalize' }}>{u.role}</td></tr>
              ))}
              {users.length === 0 && <tr><td colSpan={2} className="empty">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

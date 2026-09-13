import { useState } from 'react';
import { supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Quotations from './pages/Quotations';
import Invoices from './pages/Invoices';
import CreditNotes from './pages/CreditNotes';
import Bills from './pages/Bills';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import Expenses from './pages/Expenses';
import Books from './pages/Books';
import Settings from './pages/Settings';

const TABS = [
  { id: 'pos', label: 'POS' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'products', label: 'Products' },
  { id: 'quotations', label: 'Quotations' },
  { id: 'invoices', label: 'Invoices & Receipts' },
  { id: 'credit-notes', label: 'Credit Notes' },
  { id: 'bills', label: 'Bills' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'books', label: 'Books' },
  { id: 'settings', label: 'Settings' },
];

const ROLE_TABS = {
  admin: TABS.map(t => t.id),
  accountant: ['pos', 'dashboard', 'quotations', 'invoices', 'credit-notes', 'bills', 'expenses', 'books'],
  procurement: ['products', 'inventory', 'bills'],
  sales: ['pos'],
};

export default function App({ session, role }) {
  const allowed = ROLE_TABS[role] || [];
  const [tab, setTab] = useState(allowed[0] || 'dashboard');

  return (
    <>
      <header className="app-header">
        <div>
          <h1>HandySam OS</h1>
          <div className="tag">Business ERP · live on Supabase</div>
        </div>
        <span className="muted" style={{ color: '#cfd2d8' }}>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <div className="row">
          <span className="muted" style={{ color: '#cfd2d8' }}>{session?.user?.email} · <span style={{ textTransform: 'capitalize' }}>{role}</span></span>
          <button onClick={() => supabase.auth.signOut()}
            style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid #ed6a23', background: 'transparent', color: '#ed6a23', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </header>
      <nav className="tabs">
        {TABS.filter(t => allowed.includes(t.id)).map(t => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      <main style={tab === 'pos' ? { padding: 0, maxWidth: 'none' } : undefined}>
        {tab === 'pos' && <POS />}
        {tab === 'dashboard' && <Dashboard goTo={setTab} />}
        {tab === 'products' && <Products />}
        {tab === 'quotations' && <Quotations />}
        {tab === 'invoices' && <Invoices />}
        {tab === 'credit-notes' && <CreditNotes />}
        {tab === 'bills' && <Bills role={role} />}
        {tab === 'inventory' && <Inventory />}
        {tab === 'expenses' && <Expenses />}
        {tab === 'books' && <Books />}
        {tab === 'settings' && <Settings role={role} />}
      </main>
      <div className="footer-note">HandySam OS — data lives in Supabase, shared live with Meide Command Center.</div>
    </>
  );
}

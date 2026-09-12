import { useState } from 'react';
import { supabase } from './lib/supabase';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signInPassword(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  }

  async function sendMagicLink() {
    if (!email) { setError('Enter your email first.'); return; }
    setError(''); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setBusy(false);
    if (error) setError(error.message); else setSent(true);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a' }}>
      <form onSubmit={signInPassword} style={{ background: '#fff', borderRadius: 8, padding: 32, width: 340 }}>
        <h2 style={{ marginTop: 0, color: '#1a1a1a' }}>HandySam OS</h2>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: -8 }}>Sign in with your Command Center account</p>

        <label className="muted">Email</label>
        <input type="email" required style={{ width: '100%', marginBottom: 10, marginTop: 4 }}
          value={email} onChange={e => setEmail(e.target.value)} />

        <label className="muted">Password</label>
        <input type="password" style={{ width: '100%', marginBottom: 14, marginTop: 4 }}
          value={password} onChange={e => setPassword(e.target.value)} />

        {error && <div style={{ color: '#c0392b', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        {sent && <div style={{ color: '#1f8a4c', fontSize: 12.5, marginBottom: 10 }}>Magic link sent — check your email.</div>}

        <button type="submit" disabled={busy}
          style={{ width: '100%', marginBottom: 8, padding: '11px 14px', borderRadius: 6, border: 'none',
                   background: '#ed6a23', color: '#ffffff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button type="button" onClick={sendMagicLink} disabled={busy}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #d0d0d0',
                   background: '#ffffff', color: '#1a1a1a', fontSize: 13.5, cursor: 'pointer' }}>
          Email me a magic link instead
        </button>
      </form>
    </div>
  );
}

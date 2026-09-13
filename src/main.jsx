import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Auth from './Auth.jsx';
import { supabase } from './lib/supabase.js';
import './styles.css';

function Root() {
  const [session, setSession] = useState(undefined); // undefined = not checked yet
  const [role, setRole] = useState(undefined); // undefined = not checked yet, null = no role assigned

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setRole(undefined); return; }
    supabase.from('handysam_user_roles').select('role').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => setRole(data?.role || null));
  }, [session]);

  if (session === undefined) return null; // brief flash while checking existing session
  if (!session) return <Auth />;
  if (role === undefined) return null; // brief flash while checking role
  if (role === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', color: '#fff', textAlign: 'center', padding: 20 }}>
        <div>
          <h2>No role assigned yet</h2>
          <p style={{ color: '#aaa', maxWidth: 360 }}>You're signed in as {session.user.email}, but an admin needs to assign you a role (admin, accountant, or procurement) before you can use HandySam OS.</p>
          <button onClick={() => supabase.auth.signOut()}
            style={{ padding: '9px 16px', borderRadius: 6, border: '1px solid #ed6a23', background: 'transparent', color: '#ed6a23', fontWeight: 600, cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </div>
    );
  }
  return <App session={session} role={role} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

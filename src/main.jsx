import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Auth from './Auth.jsx';
import { supabase } from './lib/supabase.js';
import './styles.css';

function Root() {
  const [session, setSession] = useState(undefined); // undefined = not checked yet

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null; // brief flash while checking existing session
  if (!session) return <Auth />;
  return <App session={session} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

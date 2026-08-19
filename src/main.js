/**
 * Project 800 – Main Entry Point
 * Initialises Supabase client and exposes it as window._sb
 * Then loads app.js (which contains all UI logic)
 */
import { sb } from './lib/supabase.js';
import './styles/app.css';

// Expose globally so app.js inline functions can reach Supabase
window._sb = sb;

// Listen for auth state changes (e.g. session expiry)
sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    // Reset UI if session expires externally
    const loginScreen = document.getElementById('login-screen');
    const appEl       = document.getElementById('app');
    const footer      = document.getElementById('app-footer');
    if (loginScreen) loginScreen.classList.remove('hidden');
    if (appEl)       appEl.classList.add('hidden');
    if (footer)      footer.classList.add('hidden');
  }
});

/**
 * Project 800 – Main Entry Point
 * Loads Supabase config from the server, then exposes the client as window._sb
 */
import { createSb } from './lib/supabase.js';
import './styles/app.css';

(async () => {
  window._sb = await createSb();
  window.dispatchEvent(new Event('sb-ready'));

  window._sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      const loginScreen = document.getElementById('login-screen');
      const appEl       = document.getElementById('app');
      const footer      = document.getElementById('app-footer');
      if (loginScreen) loginScreen.classList.remove('hidden');
      if (appEl)       appEl.classList.add('hidden');
      if (footer)      footer.classList.add('hidden');
    }
  });
})();

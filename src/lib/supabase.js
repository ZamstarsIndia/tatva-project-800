import { createClient } from '@supabase/supabase-js';

export async function createSb() {
  const res = await fetch('/api/supabase-config');
  const cfg = res.ok ? await res.json() : {};
  const url = cfg.url || '';
  const key = cfg.key || '';

  if (!url || !key) {
    console.error(
      'Supabase config missing.\n' +
      'Set TATVA_SUPABASE_URL and TATVA_SUPABASE_PUBLISHABLE_KEY in .env (local) or Vercel env vars (production).'
    );
  }

  return createClient(url, key);
}

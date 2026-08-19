import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '⚠ Supabase env vars missing.\n' +
    'Copy .env.example → .env and fill in your project URL + anon key.\n' +
    'Get them from: https://supabase.com/dashboard/project/_/settings/api'
  );
}

export const sb = createClient(SUPABASE_URL || '', SUPABASE_KEY || '');

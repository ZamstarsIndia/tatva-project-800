/**
 * Server-only config. Reads SUPABASE_* from the environment (no VITE_ prefix)
 * so Vercel does not bake the key into the static JS bundle.
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    url: process.env.TATVA_SUPABASE_URL || '',
    key: process.env.TATVA_SUPABASE_PUBLISHABLE_KEY || '',
  });
}

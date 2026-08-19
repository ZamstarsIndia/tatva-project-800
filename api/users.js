import { createClient } from '@supabase/supabase-js';

const ROLES = ['admin', 'master', 'editor', 'viewer'];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function publicClient() {
  const url = process.env.TATVA_SUPABASE_URL || '';
  const key = process.env.TATVA_SUPABASE_PUBLISHABLE_KEY || '';
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function adminClient() {
  const url = process.env.TATVA_SUPABASE_URL || '';
  const secret = process.env.TATVA_SUPABASE_SECRET_KEY || process.env.TATVA_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !secret) return null;
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireAdmin(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = String(header).startsWith('Bearer ') ? String(header).slice(7) : '';
  if (!token) return { error: 'Not signed in', status: 401 };

  const sb = publicClient();
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return { error: 'Invalid session', status: 401 };

  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: 'Admin only', status: 403 };

  return { user, token };
}

export default async function handler(req, res) {
  try {
    const admin = await requireAdmin(req);
    if (admin.error) return json(res, admin.status, { error: admin.error });

    const method = (req.method || 'GET').toUpperCase();
    const privileged = adminClient();

    if (method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const role = ROLES.includes(body.role) ? body.role : 'editor';

      if (!name || !email || !password) return json(res, 400, { error: 'Name, email and password are required' });
      if (password.length < 6) return json(res, 400, { error: 'Password must be at least 6 characters' });

      let userId = '';
      if (privileged) {
        const { data, error } = await privileged.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name },
        });
        if (error) return json(res, 400, { error: error.message });
        userId = data.user.id;
      } else {
        const { data, error } = await publicClient().auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (error) return json(res, 400, { error: error.message });
        if (!data.user?.id) return json(res, 400, { error: 'Could not create user. Add TATVA_SUPABASE_SECRET_KEY on the server.' });
        userId = data.user.id;
      }

      const writer = privileged || createClient(
        process.env.TATVA_SUPABASE_URL || '',
        process.env.TATVA_SUPABASE_PUBLISHABLE_KEY || '',
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${admin.token}` } },
        }
      );
      await writer.from('profiles').update({ name, role, email }).eq('id', userId);
      return json(res, 200, { ok: true, id: userId });
    }

    if (method === 'PATCH') {
      const body = await readBody(req);
      const id = String(body.id || '');
      const role = body.role;
      if (!id || !ROLES.includes(role)) return json(res, 400, { error: 'id and a valid role are required' });
      if (id === admin.user.id) return json(res, 400, { error: 'Cannot change your own role here' });

      const writer = privileged || createClient(
        process.env.TATVA_SUPABASE_URL || '',
        process.env.TATVA_SUPABASE_PUBLISHABLE_KEY || '',
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${admin.token}` } },
        }
      );
      const { error } = await writer.from('profiles').update({ role }).eq('id', id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { ok: true });
    }

    if (method === 'DELETE') {
      const body = await readBody(req);
      const id = String(body.id || '');
      if (!id) return json(res, 400, { error: 'id is required' });
      if (id === admin.user.id) return json(res, 400, { error: 'Cannot delete yourself' });
      if (!privileged) return json(res, 400, { error: 'Deleting users needs TATVA_SUPABASE_SECRET_KEY on the server' });
      const { error } = await privileged.auth.admin.deleteUser(id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return json(res, 500, { error: err.message || 'Server error' });
  }
}

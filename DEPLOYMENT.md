# Deployment Guide – Project 800

## Step-by-Step: Netlify + Supabase (Production)

### Step 1: Supabase project setup

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New Project**
2. Name it `project-800` (or similar), choose a region close to India (e.g. Singapore)
3. Note your **Project URL** and **anon (public) key** — you'll need these

### Step 2: Run database migrations

In **Supabase Dashboard → SQL Editor**, paste and run each file:

1. Run `supabase/migrations/001_schema.sql`
   - Creates all tables, RLS policies, triggers
2. Run `supabase/migrations/002_seed.sql`
   - Inserts all 82 activities

### Step 3: Create initial users

In **Authentication → Users → Add user**:

| Name | Email | Password | Role |
|------|-------|----------|------|
| Kuppachi | kuppachi@zamstars.com | (choose) | admin |
| Nikhita | nikhita@zamstars.com | (choose) | master |
| Vinodh | vinodh@zamstars.com | (choose) | editor |

Then set roles:
```sql
UPDATE profiles SET name = 'Kuppachi', role = 'admin'
  WHERE id = (SELECT id FROM auth.users WHERE email = 'kuppachi@zamstars.com');

UPDATE profiles SET name = 'Nikhita', role = 'master'
  WHERE id = (SELECT id FROM auth.users WHERE email = 'nikhita@zamstars.com');

UPDATE profiles SET name = 'Vinodh', role = 'editor'
  WHERE id = (SELECT id FROM auth.users WHERE email = 'vinodh@zamstars.com');
```

### Step 4: Push code to GitHub

```bash
cd project-800
git init
git add .
git commit -m "Initial commit: Project 800 v1.0"
git remote add origin https://github.com/YOUR_ORG/project-800.git
git push -u origin main
```

### Step 5: Deploy on Netlify

1. Go to [netlify.com](https://netlify.com) → **Add new site → Import from Git**
2. Select your GitHub repo
3. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Add environment variables under **Site Settings → Environment Variables**:
   ```
   TATVA_SUPABASE_URL              = https://xxxx.supabase.co
   TATVA_SUPABASE_PUBLISHABLE_KEY  = sb_publishable_...
   ```
5. **Deploy site** — takes ~60 seconds
6. Your app is live at `https://random-name.netlify.app`
7. Optionally set a custom domain under **Domain Management**

---

## Step-by-Step: Vercel + Supabase

Steps 1-4 are identical to Netlify above.

5. Go to [vercel.com/new](https://vercel.com/new) → **Import Git Repository**
6. Select your repo — Vercel auto-detects Vite
7. Add env vars:
   - `TATVA_SUPABASE_URL`
   - `TATVA_SUPABASE_PUBLISHABLE_KEY`
8. **Deploy** — live in ~30 seconds

---

## Sharing the app with the team

Once deployed, share the URL. Each team member:
1. Gets an invite email (or you create their account in Supabase Auth)
2. Logs in with their email + password
3. Sees only what their role allows

**All users share the same live database** — changes made by one user are visible to others within seconds (after next page load or save action).

---

## Custom Domain (optional)

In Netlify: **Domain Management → Add domain** → follow DNS instructions

Recommended format: `p800.tatvaglobalschool.com` or `marketing.tatvaglobalschool.com`

---

## Security Checklist

- [x] Supabase RLS is enabled on all tables (see 001_schema.sql)
- [x] Anon key is safe to expose — it only allows operations permitted by RLS
- [x] Admin operations require the `admin` role (enforced server-side)
- [x] Passwords stored by Supabase (bcrypt hashed), not in the app
- [ ] Enable email confirmation in Supabase Auth for production (`enable_confirmations = true`)
- [ ] Set up Supabase backup schedule (Dashboard → Settings → Backups)
- [ ] Restrict Supabase auth to `tatvaglobalschool.com` + `zamstars.com` domains (Auth → URL Configuration)

---

## Updating the App

```bash
# Make changes locally
npm run dev         # test
npm run build       # verify build succeeds
git add .
git commit -m "describe your change"
git push            # auto-deploys to Netlify/Vercel
```

---

## Migrating Existing Data (from localStorage)

If you have existing data saved in a browser's localStorage from the old standalone HTML version:

1. Open the old app in a browser
2. Open DevTools → Console, run:
   ```javascript
   copy(localStorage.getItem('p800_v6'))
   ```
3. Paste the JSON and run the migration script in `scripts/migrate_local_to_supabase.md`

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Login failed" | Check Supabase Auth → user exists with correct email |
| Blank page on load | Check browser console for env var errors — `.env` not configured |
| "Save error" | Check Supabase Dashboard → Table Editor → activities for row count |
| "No profile found" | Run the UPDATE profiles SQL in Step 3 above |
| Build fails | Run `npm install` then `npm run build` again |

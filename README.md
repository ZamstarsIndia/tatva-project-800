# Project 800 – Marketing Activity Tracker

> Tatva Global School × ZamStars · FY 2026-27

A full-stack web app for tracking all 82 marketing activities of Project 800 — with budget management, calendar view, owner dashboards, task tracking, Google Drive integration, and analytics.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS + Vite (no framework) |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Charts | Chart.js |
| Export | SheetJS (XLSX) |
| Deploy | Netlify / Vercel / Supabase Storage |

## Quick Start

### 1. Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) account (free tier works)

### 2. Clone & install
```bash
git clone https://github.com/YOUR_ORG/project-800.git
cd project-800
npm install
```

### 3. Set up Supabase
1. Create a new project at [supabase.com](https://supabase.com/dashboard)
2. Go to **SQL Editor** and run migrations in order:
   ```
   supabase/migrations/001_schema.sql   ← tables, RLS, triggers
   supabase/migrations/002_seed.sql     ← 82 activities
   ```
3. Create your first user under **Authentication → Users → Add user** (email + password)
4. Set the user's **role** in the `profiles` table:
   ```sql
   UPDATE profiles SET name = 'Your Name', role = 'admin'
   WHERE id = 'paste-user-uuid-here';
   ```
   Roles: `admin` (full access), `master` (budget + edit), `editor` (edit only), `viewer` (read only)

### 4. Configure environment
```bash
cp .env.example .env
```
Edit `.env`:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```
Get these values from: **Supabase Dashboard → Settings → API**

### 5. Run locally
```bash
npm run dev
# App opens at http://localhost:3000
```

### 6. Build for production
```bash
npm run build
# Output in dist/
```

---

## Deployment

### Option A — Netlify (recommended, 1 click)
1. Push this repo to GitHub
2. Connect to [Netlify](https://netlify.com), import the repo
3. Set environment variables in **Site Settings → Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy — Netlify reads `netlify.toml` automatically

### Option B — Vercel
1. Push to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add the same two environment variables
4. Deploy — Vercel reads `vercel.json` automatically

### Option C — Supabase Storage (static CDN)
```bash
npm run build
# Upload contents of dist/ to a public Supabase Storage bucket
# Set index.html as the default document
```

---

## Project Structure

```
project-800/
├── index.html              # App shell (HTML only)
├── src/
│   ├── main.js             # Entry: Supabase init, auth listener
│   ├── app.js              # All app logic (UI, charts, modals)
│   ├── styles/
│   │   └── app.css         # All styles (DM Sans, brand colours)
│   └── lib/
│       └── supabase.js     # Supabase client
├── supabase/
│   ├── config.toml         # Local dev config
│   └── migrations/
│       ├── 001_schema.sql  # Tables, RLS policies, triggers
│       └── 002_seed.sql    # 82 activities seed data
├── .env.example            # Environment variable template
├── netlify.toml            # Netlify deploy config
├── vercel.json             # Vercel deploy config
└── vite.config.js          # Build config
```

---

## User Roles

| Role | Capabilities |
|------|-------------|
| `admin` | Full access: edit activities, budgets, manage users & LOVs, delete |
| `master` | Edit activities + budgets, add activities, view all |
| `editor` | Edit activities, view all |
| `viewer` | Read-only access |

---

## Data Architecture

### Sync Model
- **App (Supabase DB)** → live tracking: status, budget, spend, sub-tasks, MOM
- **Google Drive Doc** → formatted brief: creative notes, stakeholder version, history
- The two systems are independent; the app links to each activity's Google Doc

### Tables
- `activities` — 82 marketing activities with budget, months, status
- `sub_tasks` — action items per activity
- `moms` — minutes of meeting per activity
- `assets` — file/link assets per activity
- `profiles` — user profiles with role (extends Supabase Auth)
- `app_settings` — master budget, admissions count, LOV lists

---

## Adding Users

In Supabase Dashboard:
1. **Authentication → Users → Add user** (invite or email+password)
2. A `profiles` row is auto-created by a database trigger
3. Set the role manually:
   ```sql
   UPDATE profiles SET role = 'editor' WHERE id = 'user-uuid';
   ```

---

## Local Development with Supabase CLI

```bash
npm install -g supabase
supabase login
supabase init          # already done — supabase/ dir exists
supabase start         # starts local Postgres + Auth + Studio
supabase db push       # runs migrations against remote project
```

---

## License
Proprietary — Tatva Global School × ZamStars. All rights reserved.

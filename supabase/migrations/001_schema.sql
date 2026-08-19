-- Project 800 – Supabase Schema
-- Run this first in Supabase SQL Editor (or via supabase db push)

-- ─────────────────────────────────────────────
-- 1. Profiles (extends Supabase Auth users)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL DEFAULT '',
  role    TEXT NOT NULL DEFAULT 'editor'
            CHECK (role IN ('admin','master','editor','viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), 'editor')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─────────────────────────────────────────────
-- 2. Activities
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
  id               SERIAL PRIMARY KEY,
  no               INTEGER NOT NULL UNIQUE,
  name             TEXT NOT NULL DEFAULT '',
  details          TEXT DEFAULT '',
  need             TEXT DEFAULT 'Must',
  type             TEXT DEFAULT 'Digital',
  channel          TEXT DEFAULT '',
  paid             TEXT DEFAULT 'Paid',
  main_bucket      TEXT DEFAULT '',
  sub_bucket       TEXT DEFAULT '',
  exec             TEXT DEFAULT 'Zamstars',
  owner            TEXT DEFAULT 'TBD',
  last_spend       BIGINT DEFAULT 0,
  budget           BIGINT DEFAULT 0,
  notes            TEXT DEFAULT '',
  months           INTEGER[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0],
  month_budget     JSONB DEFAULT '{}',
  month_spent      JSONB DEFAULT '{}',
  remarks          JSONB DEFAULT '{}',
  status           TEXT DEFAULT 'Planned',
  last_yr          BOOLEAN DEFAULT FALSE,
  stage            TEXT DEFAULT 'Planning',
  drive_doc_id     TEXT DEFAULT '',
  drive_doc_url    TEXT DEFAULT '',
  next_sub_task_id INTEGER DEFAULT 1,
  next_mom_id      INTEGER DEFAULT 1,
  next_asset_id    INTEGER DEFAULT 1,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 3. Sub-tasks
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sub_tasks (
  id          SERIAL PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  local_id    INTEGER NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  owner       TEXT DEFAULT '',
  due_date    DATE,
  status      TEXT DEFAULT 'To Do',
  budget      BIGINT DEFAULT 0,
  spent       BIGINT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(activity_id, local_id)
);

-- ─────────────────────────────────────────────
-- 4. Minutes of Meeting
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS moms (
  id           SERIAL PRIMARY KEY,
  activity_id  INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  local_id     INTEGER NOT NULL,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  attendees    TEXT DEFAULT '',
  discussion   TEXT DEFAULT '',
  action_items TEXT DEFAULT '',
  owner        TEXT DEFAULT '',
  deadline     DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(activity_id, local_id)
);

-- ─────────────────────────────────────────────
-- 5. Assets / Links
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id          SERIAL PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  local_id    INTEGER NOT NULL,
  name        TEXT DEFAULT '',
  url         TEXT DEFAULT '',
  type        TEXT DEFAULT '',
  added_date  DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(activity_id, local_id)
);

-- ─────────────────────────────────────────────
-- 6. App Settings (admissions count, LOVs, etc.)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default settings
INSERT INTO app_settings (key, value) VALUES
  ('master_budget', '{"value": 12000000}'),
  ('admissions',    '{"value": 0}'),
  ('target_admissions', '{"value": 800}'),
  ('lovs', '{
    "owners":["Ranjith","Arathi","Deepthi","Gopal","Nikhita","Vinodh","TBD"],
    "exec":["Zamstars","Tatva","Zamstars + Tatva"],
    "types":["Digital","Offline","Media","School Activity","School Event","Partner"],
    "channels":["Adbeets","Banners","Cinemas","Community","Corporate Offices","Dhobhis","Digital","Email","Email + WhatsApp","Facebook","Google Ads","Hoardings","Instagram","Jioads","LinkedIn","Meta(FB+Insta)","Milk Vendors","Multi-channel","Other Schools","Paid Collaboration","Platform Ads","Preschools","Print","Radio","Reddit","Research","Residential Societies","SMS","School","Schools Portal","TOI","Tatva Website","Transit Media","Website","WhatsApp/WATI","YouTube/Social"],
    "mainBuckets":["Paid Digital","Organic Digital","Organic Social","Organic / Paid Digital","Content Marketing","PR & Media","OOH Campaigns","Offline Activation","Community Outreach","Direct Outreach","Events & Fests","Holiday Campaigns","Influencer","Digital + Community"]
  }')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────
-- 7. Updated-at triggers
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS activities_updated_at ON activities;
CREATE TRIGGER activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS settings_updated_at ON app_settings;
CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- 8. Row Level Security (RLS)
-- ─────────────────────────────────────────────
ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_tasks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE moms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Helper function: get caller's role from profiles
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- profiles: authenticated users can read all; update only own row
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- activities: all authenticated can read; editors/masters/admins can write
CREATE POLICY "activities_select" ON activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "activities_insert" ON activities FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin','master','editor'));
CREATE POLICY "activities_update" ON activities FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin','master','editor'));
CREATE POLICY "activities_delete" ON activities FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- sub_tasks, moms, assets: same write rules as activities
CREATE POLICY "sub_tasks_select" ON sub_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "sub_tasks_write" ON sub_tasks FOR ALL TO authenticated
  USING (get_my_role() IN ('admin','master','editor'))
  WITH CHECK (get_my_role() IN ('admin','master','editor'));

CREATE POLICY "moms_select" ON moms FOR SELECT TO authenticated USING (true);
CREATE POLICY "moms_write" ON moms FOR ALL TO authenticated
  USING (get_my_role() IN ('admin','master','editor'))
  WITH CHECK (get_my_role() IN ('admin','master','editor'));

CREATE POLICY "assets_select" ON assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "assets_write" ON assets FOR ALL TO authenticated
  USING (get_my_role() IN ('admin','master','editor'))
  WITH CHECK (get_my_role() IN ('admin','master','editor'));

-- app_settings: all can read; only admin/master can write
CREATE POLICY "settings_select" ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_write" ON app_settings FOR ALL TO authenticated
  USING (get_my_role() IN ('admin','master'))
  WITH CHECK (get_my_role() IN ('admin','master'));

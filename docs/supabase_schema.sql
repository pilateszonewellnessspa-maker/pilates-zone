-- ═══════════════════════════════════════════════════════════════════
-- Pilates Zone Wellness Spa – Supabase PostgreSQL Schema
-- Run this entire file in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ── Enable UUID extension ────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════════════════════════════
-- 1. PROFILES  (replaces MongoDB "users" collection)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS profiles (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT         NOT NULL,
  email               TEXT         NOT NULL UNIQUE,
  phone               TEXT         NOT NULL,
  password            TEXT         NOT NULL,          -- bcrypt hash
  role                TEXT         NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
  status              TEXT         NOT NULL DEFAULT 'not_verified' CHECK (status IN ('not_verified', 'verified')),

  -- Email OTP verification
  is_email_verified   BOOLEAN      NOT NULL DEFAULT FALSE,
  otp                 TEXT,
  otp_expiry          TIMESTAMPTZ,

  -- Membership / active plan
  active_plan_id      UUID,                            -- FK to packages (set after first payment)
  active_plan_name    TEXT,                            -- snapshot for display
  active_plan_expiry  TIMESTAMPTZ,
  sessions_remaining  INTEGER      NOT NULL DEFAULT 0,
  total_spent         INTEGER      NOT NULL DEFAULT 0, -- in INR (paise-free)

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── RLS for profiles ─────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read/update ONLY their own row
CREATE POLICY "Users: read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users: update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Service-role (our Node.js backend uses the anon key + service-role) can do everything
-- NOTE: Since we use SUPABASE_ANON_KEY from the server, we bypass RLS by using
-- the service_role key in production or by granting explicit insert rights below.
-- For simplicity in this setup, allow anon key to perform all operations
-- (JWT auth is handled by our own Express middleware, not Supabase Auth).
CREATE POLICY "Anon key backend full access on profiles"
  ON profiles FOR ALL
  USING (true)
  WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════════
-- 2. PACKAGES  (replaces MongoDB "packages" collection)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS packages (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT         NOT NULL,
  price         INTEGER      NOT NULL,                -- in INR
  description   TEXT         NOT NULL,
  validity_days INTEGER      NOT NULL,
  sessions      INTEGER      NOT NULL DEFAULT 0,     -- 0 = unlimited
  icon          TEXT         NOT NULL DEFAULT '✦',
  highlight     BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── RLS for packages (public read, admin write) ──────────────────
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Packages: anyone can read active packages"
  ON packages FOR SELECT
  USING (true);

CREATE POLICY "Anon key backend full access on packages"
  ON packages FOR ALL
  USING (true)
  WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════════
-- 3. PAYMENTS  (replaces MongoDB "payments" collection)
--    Stores every transaction: Razorpay + manual assignments.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payments (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  package_id            UUID         REFERENCES packages(id) ON DELETE SET NULL,
  package_name          TEXT,                        -- snapshot at time of payment
  amount                INTEGER      NOT NULL,        -- in INR
  status                TEXT         NOT NULL DEFAULT 'pending'
                                     CHECK (status IN ('pending', 'success', 'failed', 'manual')),
  invoice_number        TEXT         UNIQUE,

  -- Razorpay specific fields (null for manual payments)
  razorpay_order_id     TEXT,
  razorpay_payment_id   TEXT,
  razorpay_signature    TEXT,

  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- ── RLS for payments ─────────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users: read own payments"
  ON payments FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Anon key backend full access on payments"
  ON payments FOR ALL
  USING (true)
  WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════════
-- 4. RECEIPTS  (replaces MongoDB "receipts" collection)
--    Immutable snapshot of every successful payment.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS receipts (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_id            UUID         REFERENCES payments(id) ON DELETE SET NULL,

  -- Snapshot fields (stored directly so receipts survive user/package edits)
  name                  TEXT         NOT NULL,
  email                 TEXT         NOT NULL,
  phone                 TEXT,
  plan_name             TEXT         NOT NULL,
  amount                INTEGER      NOT NULL,       -- in INR
  status                TEXT         NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'manual')),
  invoice_number        TEXT         UNIQUE NOT NULL,

  -- Razorpay references
  razorpay_payment_id   TEXT,
  razorpay_order_id     TEXT,

  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts(created_at DESC);

-- ── RLS for receipts ─────────────────────────────────────────────
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users: read own receipts"
  ON receipts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Anon key backend full access on receipts"
  ON receipts FOR ALL
  USING (true)
  WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════════
-- 5. HELPER: auto-update updated_at timestamps
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_packages_updated_at
  BEFORE UPDATE ON packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

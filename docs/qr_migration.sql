-- ═══════════════════════════════════════════════════════════════
-- Pilates Zone — QR Payment Migration
-- Run this in Supabase SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Add missing columns to payments table
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by   UUID REFERENCES profiles(id);

-- 2. Expand status CHECK to include 'approved' and 'rejected'
--    (drop old constraint first, then re-add with new values)
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'success', 'failed', 'manual'));

-- 3. Add missing columns to receipts table
--    (the approve flow inserts package_id, package_name, transaction_id, valid_until, issued_at)
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS package_id     UUID REFERENCES packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_name   TEXT,
  ADD COLUMN IF NOT EXISTS transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS valid_until    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS issued_at      TIMESTAMPTZ DEFAULT NOW();

-- 4. Make name, email, phone, plan_name nullable
--    (they won't always be available at receipt creation time)
ALTER TABLE public.receipts
  ALTER COLUMN name     DROP NOT NULL,
  ALTER COLUMN email    DROP NOT NULL,
  ALTER COLUMN plan_name DROP NOT NULL;

-- Done! All columns are now in place.

-- ═══════════════════════════════════════════════════════════════
-- Pilates Zone — Password Reset Migration
-- Run in Supabase SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reset_token        TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ;

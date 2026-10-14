-- =============================================================================
-- Migration: 0010_notification_entity_links
-- Description: Make notifications navigable. Notification rows previously
--              carried no entity reference, so the inbox "view" actions had
--              nothing to consume and always fell back to list pages. Three
--              additive nullable columns (no RLS changes, no backfill: older
--              rows keep the safe list-page fallback).
-- =============================================================================

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS entity_type text;

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS entity_id uuid;

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS action_url text;

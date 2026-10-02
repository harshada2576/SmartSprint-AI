-- =============================================================================
-- Migration: 0008_backlog_commitments
-- Description: Connect backlog items to project commitments.
-- =============================================================================

ALTER TABLE public.backlog
ADD COLUMN IF NOT EXISTS commitment_id uuid;

ALTER TABLE public.backlog
DROP CONSTRAINT IF EXISTS backlog_commitment_id_fkey;

ALTER TABLE public.backlog
ADD CONSTRAINT backlog_commitment_id_fkey
FOREIGN KEY (commitment_id)
REFERENCES public.commitments(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_backlog_commitment_id
ON public.backlog(commitment_id);
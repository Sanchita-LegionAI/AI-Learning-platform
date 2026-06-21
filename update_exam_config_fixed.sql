-- =============================================================================
-- UPDATE EXAM CONFIG — 4-5 questions, 15-20 marks
-- SAFE VERSION: does NOT delete old configs (foreign key constraint)
-- Just deactivates old, inserts new ones
-- Run in: Supabase Dashboard → SQL Editor
-- =============================================================================

-- Deactivate old config (keep the row, just turn it off)
UPDATE public.exam_config SET active = false WHERE config_name = 'default_20marks';

-- Config for 4 questions (~15 marks): 1×2m + 1×3m + 2×5m = 15 marks
INSERT INTO public.exam_config (config_name, description, distribution, total_marks, active)
VALUES (
  '4q_15marks',
  '4-question paper: 1×2m + 1×3m + 2×5m = 15 marks',
  '[{"marks":2,"count":1},{"marks":3,"count":1},{"marks":5,"count":2}]',
  15,
  true
)
ON CONFLICT (config_name) DO UPDATE SET
  distribution = EXCLUDED.distribution,
  total_marks  = EXCLUDED.total_marks,
  active       = EXCLUDED.active;

-- Config for 5 questions (~17 marks): 2×2m + 1×3m + 2×5m = 17 marks
INSERT INTO public.exam_config (config_name, description, distribution, total_marks, active)
VALUES (
  '5q_17marks',
  '5-question paper: 2×2m + 1×3m + 2×5m = 17 marks',
  '[{"marks":2,"count":2},{"marks":3,"count":1},{"marks":5,"count":2}]',
  17,
  true
)
ON CONFLICT (config_name) DO UPDATE SET
  distribution = EXCLUDED.distribution,
  total_marks  = EXCLUDED.total_marks,
  active       = EXCLUDED.active;

-- Verify result
SELECT id, config_name, total_marks, active FROM public.exam_config ORDER BY id;

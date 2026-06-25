-- =============================================================================
-- BENGALI AI TUTOR — MIGRATION v3 → v4  (CLEAN SLATE)
-- Two-Part Exam Model: Touch-only Part 1 + Short-Write OCR Part 2
--
-- DESTROYS:
--   • All exam_sessions, evaluations, daily_usage, api_calls (test data)
--   • All questions (old format incompatible)
--   • All exam_config rows (old distribution-style)
--   • All curriculum except Class 7 Science (AMR_PRITHIBI, HIS7 removed)
--
-- KEEPS:
--   • users / auth
--   • providers
--   • Class 7 Science book + chapters (renamed + ch11 added)
--   • All RLS policies
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
-- Single transaction — if anything fails the whole thing rolls back.
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1 — WIPE TRANSACTIONAL DATA
-- Order matters: child tables before parents.
-- =============================================================================

TRUNCATE TABLE
  public.evaluations,
  public.exam_sessions,
  public.daily_usage,
  public.api_calls,
  public.chapter_stats
RESTART IDENTITY CASCADE;


-- =============================================================================
-- STEP 2 — DROP OLD questions + exam_config (and their dependent views)
-- =============================================================================

-- Drop ALL views first — avoids "cannot drop columns from view" on CREATE OR REPLACE
DROP VIEW IF EXISTS public.v_exam_config    CASCADE;
DROP VIEW IF EXISTS public.v_question_counts CASCADE;
DROP VIEW IF EXISTS public.v_curriculum      CASCADE;
DROP VIEW IF EXISTS public.v_cost_summary    CASCADE;
DROP VIEW IF EXISTS public.v_cost_projection CASCADE;

DROP TABLE IF EXISTS public.exam_config  CASCADE;
DROP TABLE IF EXISTS public.questions    CASCADE;


-- =============================================================================
-- STEP 3 — REMOVE old curriculum: AMR_PRITHIBI_7 and HIS7 subjects/books/chapters
-- Classes table keeps "Class 7" — only the Geography and History subjects go.
-- Cascade handles books → chapters automatically.
-- =============================================================================

DELETE FROM public.subjects
WHERE name IN ('Geography', 'History', 'Mathematics')
  AND class_id = (SELECT id FROM public.classes WHERE name = 'Class 7');

-- Belt-and-braces: remove any orphaned books not already cascade-deleted
DELETE FROM public.books
WHERE book_id_code IN ('AMR_PRITHIBI_7', 'HIS7_ATIT_O_OITIJHYA');


-- =============================================================================
-- STEP 4 — NEW ENUMS
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.question_type AS ENUM (
    'mcq', 'match_pairs', 'true_false',
    'tap_sequence', 'categorize', 'short_write'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.question_part AS ENUM ('part1', 'part2');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- STEP 5 — NEW questions TABLE
-- =============================================================================

CREATE TABLE public.questions (
  id               SERIAL                    PRIMARY KEY,
  question_code    TEXT                      NOT NULL UNIQUE,

  chapter_id       INT                       NOT NULL
                     REFERENCES public.chapters(id) ON DELETE CASCADE,

  q_type           public.question_type      NOT NULL,
  q_part           public.question_part      NOT NULL,

  marks            NUMERIC(5,2)              NOT NULL,
  marks_per_item   NUMERIC(5,2),                        -- categorize only

  difficulty       public.difficulty_level   NOT NULL DEFAULT 'Medium',
  topic_bn         TEXT,
  question_bn      TEXT                      NOT NULL,

  -- MCQ
  options          JSONB,            -- ["opt1","opt2",...]
  correct_answer   TEXT,             -- MCQ / true_false answer

  -- Match Pairs
  pairs            JSONB,            -- [{"left":"...","right":"..."},...]

  -- Tap Sequence
  items            JSONB,            -- shuffled display items
  correct_order    JSONB,            -- correct sequence

  -- Categorize
  categories       JSONB,            -- {"category":["item1","item2"],...}

  -- Short Write (Part 2)
  expected_answer  TEXT,
  max_words        INT,
  answer_slot_id   INT,

  active           BOOLEAN           NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX idx_questions_chapter    ON public.questions(chapter_id);
CREATE INDEX idx_questions_type       ON public.questions(q_type);
CREATE INDEX idx_questions_part       ON public.questions(q_part);
CREATE INDEX idx_questions_difficulty ON public.questions(difficulty);
CREATE INDEX idx_questions_active     ON public.questions(active);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions: auth read"
  ON public.questions FOR SELECT
  USING (auth.uid() IS NOT NULL AND active = true);

CREATE POLICY "questions: admin all"
  ON public.questions FOR ALL
  USING (public.current_user_role() = 'admin');


-- =============================================================================
-- STEP 6 — NEW exam_config TABLE
-- Marks per type are fixed (mcq=1, match=2, tf=1, seq=2, cat=2, sw=2).
-- Generated columns compute totals automatically.
-- =============================================================================

CREATE TABLE public.exam_config (
  id                    SERIAL        PRIMARY KEY,
  config_name           TEXT          NOT NULL UNIQUE,
  description           TEXT,
  active                BOOLEAN       NOT NULL DEFAULT false,

  -- Part 1 counts
  p1_mcq_count          INT           NOT NULL DEFAULT 10,
  p1_match_pairs_count  INT           NOT NULL DEFAULT 2,
  p1_true_false_count   INT           NOT NULL DEFAULT 5,
  p1_tap_sequence_count INT           NOT NULL DEFAULT 2,
  p1_categorize_count   INT           NOT NULL DEFAULT 1,

  -- Part 2 counts
  p2_short_write_count  INT           NOT NULL DEFAULT 5,

  -- Difficulty guidance (best-effort — backend respects if pool allows)
  difficulty_easy_pct   INT           NOT NULL DEFAULT 40
                          CHECK (difficulty_easy_pct   BETWEEN 0 AND 100),
  difficulty_medium_pct INT           NOT NULL DEFAULT 40
                          CHECK (difficulty_medium_pct BETWEEN 0 AND 100),
  difficulty_hard_pct   INT           NOT NULL DEFAULT 20
                          CHECK (difficulty_hard_pct   BETWEEN 0 AND 100),


  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Computed totals as a view — generated columns not supported in Supabase (PG15)
-- Marks per type: mcq=1, match_pairs=2, true_false=1, tap_sequence=2, categorize=2, short_write=2
CREATE OR REPLACE VIEW public.v_exam_config AS
SELECT
  *,
  (p1_mcq_count * 1 + p1_match_pairs_count * 2 + p1_true_false_count * 1 +
   p1_tap_sequence_count * 2 + p1_categorize_count * 2)         AS p1_max_marks,
  (p2_short_write_count * 2)                                     AS p2_max_marks,
  (p1_mcq_count * 1 + p1_match_pairs_count * 2 + p1_true_false_count * 1 +
   p1_tap_sequence_count * 2 + p1_categorize_count * 2 +
   p2_short_write_count * 2)                                     AS total_max_marks
FROM public.exam_config;


-- Three starter configs — only standard is active
INSERT INTO public.exam_config
  (config_name, description, active,
   p1_mcq_count, p1_match_pairs_count, p1_true_false_count,
   p1_tap_sequence_count, p1_categorize_count,
   p2_short_write_count,
   difficulty_easy_pct, difficulty_medium_pct, difficulty_hard_pct)
VALUES
  ('standard_25marks',
   'Standard — 10 MCQ + 2 Match + 5 T/F + 2 Seq + 1 Cat + 5 Short Write = 25 marks',
   true,  10, 2, 5, 2, 1, 5, 40, 40, 20),

  ('quick_15marks',
   'Quick — 5 MCQ + 1 Match + 3 T/F + 1 Seq + 0 Cat + 3 Short Write = 15 marks',
   false, 5,  1, 3, 1, 0, 3, 50, 35, 15),

  ('hard_30marks',
   'Hard — 12 MCQ + 3 Match + 6 T/F + 2 Seq + 2 Cat + 5 Short Write = 30 marks',
   false, 12, 3, 6, 2, 2, 5, 20, 40, 40);

ALTER TABLE public.exam_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_config: auth read"
  ON public.exam_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "exam_config: admin all"
  ON public.exam_config FOR ALL
  USING (public.current_user_role() = 'admin');


-- =============================================================================
-- STEP 7 — REBUILD exam_sessions (clean, no legacy columns)
-- =============================================================================

DROP TABLE IF EXISTS public.exam_sessions CASCADE;

CREATE TABLE public.exam_sessions (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID          NOT NULL
                            REFERENCES public.users(id) ON DELETE CASCADE,
  chapter_id              INT           NOT NULL
                            REFERENCES public.chapters(id),
  exam_config_id          INT
                            REFERENCES public.exam_config(id) ON DELETE SET NULL,

  started_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  submitted_at            TIMESTAMPTZ,

  -- Part 1 — touch questions (stored as selected from DB, no LLM rephrase)
  part1_questions         JSONB,        -- array of question objects sent to frontend
  part1_answers           JSONB,        -- {question_id: student_answer_value}
  part1_score_awarded     NUMERIC(6,2),
  part1_score_max         NUMERIC(6,2),
  part1_completed         BOOLEAN       NOT NULL DEFAULT false,

  -- Part 2 — short write (OCR)
  part2_questions         JSONB,        -- array of short_write question objects
  answer_image_key        TEXT,         -- R2 object key
  answer_image_url        TEXT,         -- short-lived signed URL
  answer_image_expires_at TIMESTAMPTZ,
  part2_ocr_answers       JSONB,        -- {slot_id: ocr_text} after review
  part2_score_awarded     NUMERIC(6,2),
  part2_score_max         NUMERIC(6,2),
  part2_completed         BOOLEAN       NOT NULL DEFAULT false,

  -- Overall (sum of both parts — set when both completed)
  score_awarded           NUMERIC(6,2),
  score_max               NUMERIC(6,2),
  grade                   TEXT,
  completed               BOOLEAN       NOT NULL DEFAULT false,

  schema_version          INT           NOT NULL DEFAULT 4
);

CREATE INDEX idx_sessions_user      ON public.exam_sessions(user_id);
CREATE INDEX idx_sessions_chapter   ON public.exam_sessions(chapter_id);
CREATE INDEX idx_sessions_started   ON public.exam_sessions(started_at DESC);
CREATE INDEX idx_sessions_completed ON public.exam_sessions(completed);

ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions: own select" ON public.exam_sessions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "sessions: own insert" ON public.exam_sessions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "sessions: own update" ON public.exam_sessions FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "sessions: admin all"  ON public.exam_sessions FOR ALL    USING (public.current_user_role() = 'admin');


-- =============================================================================
-- STEP 8 — REBUILD evaluations (clean)
-- One row per question, covers both parts.
-- =============================================================================

DROP TABLE IF EXISTS public.evaluations CASCADE;

CREATE TABLE public.evaluations (
  id                  SERIAL        PRIMARY KEY,
  session_id          UUID          NOT NULL
                        REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  question_index      INT           NOT NULL,   -- position within its part
  q_type              TEXT          NOT NULL,   -- 'mcq' | 'match_pairs' | etc.
  q_part              TEXT          NOT NULL,   -- 'part1' | 'part2'
  question_bn         TEXT          NOT NULL,
  student_answer      TEXT,                     -- what the student answered
  correct_answer      TEXT,                     -- correct value (for display)
  marks_awarded       NUMERIC(6,2)  NOT NULL DEFAULT 0,
  marks_max           NUMERIC(6,2)  NOT NULL,
  is_correct          BOOLEAN,
  feedback_bn         TEXT,                     -- Bengali encouragement (Part 2 only)
  UNIQUE(session_id, q_part, question_index)
);

CREATE INDEX idx_evaluations_session ON public.evaluations(session_id);

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eval: own select" ON public.evaluations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.exam_sessions s
    WHERE s.id = evaluations.session_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "eval: own insert" ON public.evaluations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.exam_sessions s
    WHERE s.id = evaluations.session_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "eval: admin all" ON public.evaluations FOR ALL
  USING (public.current_user_role() = 'admin');


-- =============================================================================
-- STEP 9 — REBUILD chapter_stats (clean)
-- =============================================================================

DROP TABLE IF EXISTS public.chapter_stats CASCADE;

CREATE TABLE public.chapter_stats (
  chapter_id      INT           PRIMARY KEY
                    REFERENCES public.chapters(id) ON DELETE CASCADE,
  total_attempts  INT           NOT NULL DEFAULT 0,
  average_score   FLOAT,
  last_updated    TIMESTAMPTZ
);

ALTER TABLE public.chapter_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stats: auth read" ON public.chapter_stats FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "stats: admin all" ON public.chapter_stats FOR ALL    USING (public.current_user_role() = 'admin');

-- Trigger: update stats when a session is marked completed
CREATE OR REPLACE FUNCTION public.update_chapter_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.completed = true AND (OLD.completed = false OR OLD.completed IS NULL) THEN
    INSERT INTO public.chapter_stats (chapter_id, total_attempts, average_score, last_updated)
    SELECT
      NEW.chapter_id,
      COUNT(*),
      ROUND(AVG(
        CASE WHEN score_max > 0 THEN score_awarded::FLOAT / score_max * 100 ELSE 0 END
      )::NUMERIC, 1),
      now()
    FROM public.exam_sessions
    WHERE chapter_id = NEW.chapter_id AND completed = true
    ON CONFLICT (chapter_id) DO UPDATE SET
      total_attempts = EXCLUDED.total_attempts,
      average_score  = EXCLUDED.average_score,
      last_updated   = EXCLUDED.last_updated;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_session_completed ON public.exam_sessions;
CREATE TRIGGER on_session_completed
  AFTER UPDATE OF completed ON public.exam_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_chapter_stats();


-- =============================================================================
-- STEP 10 — FIX SCIENCE curriculum (book_id_code, chapter names, add ch11)
-- =============================================================================

-- Correct the book_id_code to match new JSON files
UPDATE public.books
SET book_id_code = 'paribesh_o_bigyan',
    total_chapters = 11
WHERE book_id_code = 'PARIBESH_BIGYAN_7';

-- Fix all chapter names to match actual textbook titles
DO $$
DECLARE v_book_id INT;
BEGIN
  SELECT id INTO v_book_id FROM public.books WHERE book_id_code = 'paribesh_o_bigyan';
  IF v_book_id IS NULL THEN
    RAISE EXCEPTION 'Book paribesh_o_bigyan not found — was curriculum seeded?';
  END IF;

  UPDATE public.chapters SET
    name_bn = 'ভৌত পরিবেশ - তাপ',
    subtitle_bn = 'তাপ, উষ্ণতা, তাপমাত্রার স্কেল ও লীন তাপ'
  WHERE book_id = v_book_id AND chapter_number = 1;

  UPDATE public.chapters SET
    name_bn = 'ভৌত পরিবেশ - আলো',
    subtitle_bn = 'আলোর প্রতিফলন, প্রতিসরণ ও বর্ণালী'
  WHERE book_id = v_book_id AND chapter_number = 2;

  UPDATE public.chapters SET
    name_bn = 'চুম্বক',
    subtitle_bn = 'চুম্বকের ধর্ম, চুম্বকক্ষেত্র ও ব্যবহার'
  WHERE book_id = v_book_id AND chapter_number = 3;

  UPDATE public.chapters SET
    name_bn = 'ভৌত পরিবেশ: তড়িৎ',
    subtitle_bn = 'তড়িৎপ্রবাহ, বর্তনী ও তড়িৎ রাসায়নিক বিক্রিয়া'
  WHERE book_id = v_book_id AND chapter_number = 4;

  UPDATE public.chapters SET
    name_bn = 'ভৌত পরিবেশ — পরিবেশবান্ধব শক্তি',
    subtitle_bn = 'নবায়নযোগ্য ও অনবায়নযোগ্য শক্তির উৎস'
  WHERE book_id = v_book_id AND chapter_number = 5;

  UPDATE public.chapters SET
    name_bn = 'সময় ও গতি',
    subtitle_bn = 'গতির পরিমাপ, দূরত্ব, বেগ ও সময়'
  WHERE book_id = v_book_id AND chapter_number = 6;

  UPDATE public.chapters SET
    name_bn = 'পরমাণু, অণু ও রাসায়নিক বিক্রিয়া',
    subtitle_bn = 'পরমাণু মডেল, মৌল, যৌগ ও বিক্রিয়ার ধরন'
  WHERE book_id = v_book_id AND chapter_number = 7;

  UPDATE public.chapters SET
    name_bn = 'পরিবেশ গঠনে পদার্থের ভূমিকা',
    subtitle_bn = 'বায়ু, জল, মাটি ও তাদের গুণাবলী'
  WHERE book_id = v_book_id AND chapter_number = 8;

  UPDATE public.chapters SET
    name_bn = 'মানুষের খাদ্য',
    subtitle_bn = 'খাদ্য উপাদান, পুষ্টি ও পাচনতন্ত্র'
  WHERE book_id = v_book_id AND chapter_number = 9;

  UPDATE public.chapters SET
    name_bn = 'পরিবেশের সজীব উপাদানের গঠনগত বৈচিত্র্য ও কার্যগত প্রক্রিয়া',
    subtitle_bn = 'কোষ, টিস্যু, অঙ্গ ও তন্ত্র'
  WHERE book_id = v_book_id AND chapter_number = 10;

  -- ch11 was missing from the original seed — insert it
  INSERT INTO public.chapters (book_id, chapter_number, name_bn, subtitle_bn, active)
  VALUES (
    v_book_id, 11,
    'পরিবেশের সংকট, উদ্ভিদ ও পরিবেশের সংরক্ষণ',
    'দূষণ, জলবায়ু পরিবর্তন ও সংরক্ষণের উপায়',
    true
  )
  ON CONFLICT (book_id, chapter_number) DO UPDATE SET
    name_bn     = EXCLUDED.name_bn,
    subtitle_bn = EXCLUDED.subtitle_bn;

END $$;


-- =============================================================================
-- STEP 11 — DEACTIVATE question_generation providers (no longer used)
-- =============================================================================

UPDATE public.providers SET active = false WHERE purpose = 'question_generation';


-- =============================================================================
-- STEP 12 — REBUILD VIEWS
-- =============================================================================

CREATE OR REPLACE VIEW public.v_curriculum AS
SELECT
  cl.id    AS class_id,   cl.name              AS class_name,
  s.id     AS subject_id, s.display_name_bn    AS subject_bn,
  b.id     AS book_id,    b.book_id_code,       b.title_bn,
  ch.id    AS chapter_id, ch.chapter_number,
  ch.name_bn,             ch.subtitle_bn,       ch.active,

  COUNT(q.id)                                               AS total_questions,
  COUNT(q.id) FILTER (WHERE q.q_type = 'mcq')              AS q_mcq,
  COUNT(q.id) FILTER (WHERE q.q_type = 'match_pairs')      AS q_match_pairs,
  COUNT(q.id) FILTER (WHERE q.q_type = 'true_false')       AS q_true_false,
  COUNT(q.id) FILTER (WHERE q.q_type = 'tap_sequence')     AS q_tap_sequence,
  COUNT(q.id) FILTER (WHERE q.q_type = 'categorize')       AS q_categorize,
  COUNT(q.id) FILTER (WHERE q.q_type = 'short_write')      AS q_short_write,
  COUNT(q.id) FILTER (WHERE q.difficulty = 'Easy')         AS q_easy,
  COUNT(q.id) FILTER (WHERE q.difficulty = 'Medium')       AS q_medium,
  COUNT(q.id) FILTER (WHERE q.difficulty = 'Hard')         AS q_hard,

  -- Ready when it can serve standard_25marks config
  CASE WHEN
    COUNT(q.id) FILTER (WHERE q.q_type = 'mcq')          >= 10 AND
    COUNT(q.id) FILTER (WHERE q.q_type = 'match_pairs')  >= 2  AND
    COUNT(q.id) FILTER (WHERE q.q_type = 'true_false')   >= 5  AND
    COUNT(q.id) FILTER (WHERE q.q_type = 'tap_sequence') >= 2  AND
    COUNT(q.id) FILTER (WHERE q.q_type = 'categorize')   >= 1  AND
    COUNT(q.id) FILTER (WHERE q.q_type = 'short_write')  >= 5
  THEN true ELSE false END                                  AS ready_for_exam

FROM public.classes  cl
JOIN public.subjects s  ON s.class_id   = cl.id
JOIN public.books    b  ON b.subject_id = s.id
JOIN public.chapters ch ON ch.book_id   = b.id
LEFT JOIN public.questions q ON q.chapter_id = ch.id AND q.active = true
GROUP BY
  cl.id, cl.name, s.id, s.display_name_bn,
  b.id, b.book_id_code, b.title_bn,
  ch.id, ch.chapter_number, ch.name_bn, ch.subtitle_bn, ch.active
ORDER BY cl.id, s.id, b.id, ch.chapter_number;


CREATE OR REPLACE VIEW public.v_cost_summary AS
SELECT
  DATE(timestamp)                          AS day,
  call_type, provider, model,
  COUNT(*)                                 AS calls,
  SUM(input_tokens)                        AS total_input_tokens,
  SUM(output_tokens)                       AS total_output_tokens,
  ROUND(SUM(cost_usd)::NUMERIC, 4)         AS total_cost_usd,
  ROUND(SUM(cost_inr)::NUMERIC, 2)         AS total_cost_inr
FROM public.api_calls
WHERE timestamp > now() - INTERVAL '30 days' AND success = true
GROUP BY 1, 2, 3, 4
ORDER BY 1 DESC, total_cost_inr DESC;


-- =============================================================================
-- STEP 13 — VERIFY (uncomment and run each SELECT after COMMIT to confirm)
-- =============================================================================

-- Check enum types
-- SELECT typname FROM pg_type WHERE typname IN ('question_type','question_part');

-- Check exam_config computed totals (via view)
-- SELECT config_name, p1_max_marks, p2_max_marks, total_max_marks, active FROM public.v_exam_config;

-- Check only Science subject remains
-- SELECT s.name, b.book_id_code, COUNT(ch.id) AS chapters
-- FROM public.subjects s
-- JOIN public.books b ON b.subject_id = s.id
-- JOIN public.chapters ch ON ch.book_id = b.id
-- GROUP BY s.name, b.book_id_code;

-- Check chapter names corrected (expect 11 rows)
-- SELECT chapter_number, name_bn FROM public.chapters
-- JOIN public.books ON books.id = chapters.book_id
-- WHERE books.book_id_code = 'paribesh_o_bigyan'
-- ORDER BY chapter_number;

-- Check providers status
-- SELECT purpose, provider_name, model_name, active FROM public.providers ORDER BY purpose;

-- Check questions table structure
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'questions' ORDER BY ordinal_position;


COMMIT;

-- =============================================================================
-- AFTER THIS MIGRATION — NEXT STEPS
-- =============================================================================
-- 1. Update backend/app/routers/admin.py  → new JSON import format
-- 2. Copy CLASS_7/paribesh_o_bigyan/ into backend/question_bank/class_7/paribesh_o_bigyan/
-- 3. Admin Dashboard → Import Questions  → verify 11 chapters × 150 questions = 1,650 rows
-- 4. Build backend services: question_service, part1_evaluator, exam.py endpoints
-- 5. Build frontend: Part1Page, question components, TransitionPage, Part2Page
-- =============================================================================

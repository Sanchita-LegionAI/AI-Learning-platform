-- =============================================================================
-- BENGALI AI LEARNING PLATFORM — SUPABASE SCHEMA v3
-- Matches updated architecture:
--   - question_bank/ JSON files imported via seed_questions.py
--   - Program randomly selects questions by marks distribution (no LLM)
--   - Selected stems sent to GPT-4.1 Nano to rephrase/merge into fresh paper
--   - Vision LLM evaluates handwritten answer photo
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- =============================================================================


-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE user_role         AS ENUM ('student', 'teacher', 'admin');
CREATE TYPE difficulty_level  AS ENUM ('Easy', 'Medium', 'Hard');
CREATE TYPE provider_name     AS ENUM ('openai', 'anthropic');
CREATE TYPE provider_purpose  AS ENUM ('question_generation', 'evaluation', 'tutor');
CREATE TYPE subject_type      AS ENUM ('core', 'optional', 'additional');


-- =============================================================================
-- USERS
-- Extends Supabase auth.users
-- Auto-created via trigger on every signup method:
--   Phone OTP  → role = student
--   Google OAuth → role = student
--   Email + password → role = admin
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone            TEXT        UNIQUE,
  display_name     TEXT,
  role             user_role   NOT NULL DEFAULT 'student',
  class_preference INT         CHECK (class_preference BETWEEN 1 AND 12),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active      TIMESTAMPTZ
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, phone, display_name, role)
  VALUES (
    NEW.id,
    NEW.phone,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',  -- Google OAuth display name
      NEW.email,                              -- Email/password (admin)
      NEW.phone                               -- Phone OTP (student)
    ),
    CASE
      WHEN NEW.email IS NOT NULL AND NEW.phone IS NULL THEN 'admin'::user_role
      ELSE 'student'::user_role
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update last_active on session refresh
CREATE OR REPLACE FUNCTION public.handle_user_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users SET last_active = now() WHERE id = NEW.id;
  RETURN NEW;
END;
$$;


-- =============================================================================
-- CURRICULUM
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.classes (
  id              SERIAL      PRIMARY KEY,
  name            TEXT        NOT NULL UNIQUE,       -- "Class 7"
  display_name_bn TEXT        NOT NULL,              -- "সপ্তম শ্রেণী"
  active          BOOLEAN     NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.subjects (
  id              SERIAL       PRIMARY KEY,
  class_id        INT          NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name            TEXT         NOT NULL,             -- "Geography"
  display_name_bn TEXT         NOT NULL,             -- "ভূগোল"
  subject_type    subject_type NOT NULL DEFAULT 'core',
  active          BOOLEAN      NOT NULL DEFAULT true,
  UNIQUE(class_id, name)
);

CREATE TABLE IF NOT EXISTS public.books (
  id              SERIAL      PRIMARY KEY,
  subject_id      INT         NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  book_id_code    TEXT        NOT NULL UNIQUE,       -- e.g. AMR_PRITHIBI_7
  title_bn        TEXT        NOT NULL,
  total_chapters  INT         NOT NULL DEFAULT 0,
  active          BOOLEAN     NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.chapters (
  id              SERIAL      PRIMARY KEY,
  book_id         INT         NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_number  INT         NOT NULL,
  name_bn         TEXT        NOT NULL,
  subtitle_bn     TEXT,
  source_file     TEXT,                              -- original PDF filename
  images_path     TEXT,                              -- R2 folder path for chapter JPEGs
  difficulty_avg  FLOAT,
  active          BOOLEAN     NOT NULL DEFAULT true,
  UNIQUE(book_id, chapter_number)
);

CREATE INDEX IF NOT EXISTS idx_chapters_book   ON public.chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_chapters_active ON public.chapters(active);


-- =============================================================================
-- QUESTION BANK
-- Imported from question_bank/ JSON folder structure via seed_questions.py
-- Structure:
--   question_bank/
--     CLASS_7/
--       AMR_PRITHIBI7/
--         AMR_PRITHIBI7_CH01_questions.json   ← 100 questions per file
--         AMR_PRITHIBI7_CH02_questions.json
--       HIS7_ATIT_O_OITIJHYA/
--         ...
--
-- At runtime: FastAPI randomly selects N questions by marks distribution
-- (e.g. 3×2m + 2×3m + 2×5m = 20 marks total) — NO LLM involved here.
-- Selected stems are then sent to LLM to rephrase/merge into fresh exam paper.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.questions (
  id              SERIAL           PRIMARY KEY,
  question_code   TEXT             NOT NULL UNIQUE,  -- e.g. CH01_Q001
  chapter_id      INT              NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  question_bn     TEXT             NOT NULL,
  marks           INT              NOT NULL CHECK (marks IN (2, 3, 5)),
  difficulty      difficulty_level NOT NULL DEFAULT 'Medium',
  topic_tag       TEXT,
  expected_lines  TEXT,                              -- e.g. "2-3"
  active          BOOLEAN          NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_chapter    ON public.questions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_questions_marks      ON public.questions(marks);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON public.questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_active     ON public.questions(active);

-- Helper view: question counts per chapter (used in admin dashboard + seed validation)
CREATE OR REPLACE VIEW public.v_question_counts AS
SELECT
  ch.id                                            AS chapter_id,
  ch.name_bn,
  b.book_id_code,
  COUNT(*)                                         AS total_questions,
  COUNT(*) FILTER (WHERE q.marks = 2)              AS q_2mark,
  COUNT(*) FILTER (WHERE q.marks = 3)              AS q_3mark,
  COUNT(*) FILTER (WHERE q.marks = 5)              AS q_5mark,
  COUNT(*) FILTER (WHERE q.difficulty = 'Easy')    AS easy,
  COUNT(*) FILTER (WHERE q.difficulty = 'Medium')  AS medium,
  COUNT(*) FILTER (WHERE q.difficulty = 'Hard')    AS hard
FROM public.chapters ch
JOIN public.books b ON b.id = ch.book_id
LEFT JOIN public.questions q ON q.chapter_id = ch.id AND q.active = true
GROUP BY ch.id, ch.name_bn, b.book_id_code
ORDER BY b.book_id_code, ch.chapter_number;


-- =============================================================================
-- MARKS DISTRIBUTION CONFIG
-- Controls how many questions of each type the program picks per exam.
-- Admin can adjust without code changes.
-- Example: 3×2m + 2×3m + 2×5m = 20 marks total
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.exam_config (
  id              SERIAL      PRIMARY KEY,
  config_name     TEXT        NOT NULL UNIQUE,       -- e.g. "default_20marks"
  description     TEXT,
  distribution    JSONB       NOT NULL,              -- [{"marks":2,"count":3},{"marks":3,"count":2},{"marks":5,"count":2}]
  total_marks     INT         NOT NULL,
  active          BOOLEAN     NOT NULL DEFAULT false
);

-- Seed default config
INSERT INTO public.exam_config (config_name, description, distribution, total_marks, active)
VALUES (
  'default_20marks',
  'Standard 20-mark paper: 3 × 2m + 2 × 3m + 2 × 5m',
  '[{"marks":2,"count":3},{"marks":3,"count":2},{"marks":5,"count":2}]',
  20,
  true
)
ON CONFLICT (config_name) DO NOTHING;


-- =============================================================================
-- LLM PROVIDERS (runtime-switchable, no restart needed)
-- Both question_generation and evaluation default to GPT-4.1 Nano
-- Fallback for both: Claude Haiku 4.5
--
-- question_generation purpose:
--   Input: selected question stems (~400-600 tokens)
--   Task:  rephrase / merge / reframe into fresh unique exam paper
--   Output: JSON array of final questions
--
-- evaluation purpose:
--   Input: generated questions + R2 image URL of handwritten answer sheet
--   Task:  score each question, generate Bengali feedback + model answers
--   Output: JSON with per-question scores and overall grade
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.providers (
  id                SERIAL           PRIMARY KEY,
  provider_name     provider_name    NOT NULL,
  model_name        TEXT             NOT NULL,
  purpose           provider_purpose NOT NULL,
  api_key_env_var   TEXT             NOT NULL,        -- env var name, NOT the key itself
  active            BOOLEAN          NOT NULL DEFAULT false,
  vision_enabled    BOOLEAN          NOT NULL DEFAULT false,
  cost_input_per_m  FLOAT            NOT NULL DEFAULT 0,   -- USD per 1M input tokens
  cost_output_per_m FLOAT            NOT NULL DEFAULT 0,   -- USD per 1M output tokens
  max_tokens        INT              NOT NULL DEFAULT 1500,
  temperature       FLOAT            NOT NULL DEFAULT 0.7,
  UNIQUE(provider_name, model_name, purpose)
);

INSERT INTO public.providers
  (provider_name, model_name, purpose, api_key_env_var,
   active, vision_enabled, cost_input_per_m, cost_output_per_m, max_tokens, temperature)
VALUES
  -- Question rephrasing: GPT-4.1 Nano (default)
  ('openai',    'gpt-4.1-nano',              'question_generation', 'OPENAI_API_KEY',    true,  false, 0.10, 0.40, 1000, 0.8),
  -- Question rephrasing: Claude Haiku fallback
  ('anthropic', 'claude-haiku-4-5-20251001', 'question_generation', 'ANTHROPIC_API_KEY', false, false, 0.80, 4.00, 1000, 0.8),

  -- Evaluation: GPT-4.1 Nano vision (default)
  ('openai',    'gpt-4.1-nano',              'evaluation',          'OPENAI_API_KEY',    true,  true,  0.10, 0.40, 2000, 0.3),
  -- Evaluation: Claude Haiku fallback (vision)
  ('anthropic', 'claude-haiku-4-5-20251001', 'evaluation',          'ANTHROPIC_API_KEY', false, true,  0.80, 4.00, 2000, 0.3),

  -- Tutor: Phase 2 placeholders (both inactive)
  ('openai',    'gpt-4.1-mini',              'tutor',               'OPENAI_API_KEY',    false, false, 0.40, 1.60, 4000, 0.7),
  ('anthropic', 'claude-haiku-4-5-20251001', 'tutor',               'ANTHROPIC_API_KEY', false, false, 0.80, 4.00, 4000, 0.7)
ON CONFLICT (provider_name, model_name, purpose) DO NOTHING;


-- =============================================================================
-- EXAM SESSIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chapter_id              INT         NOT NULL REFERENCES public.chapters(id),
  exam_config_id          INT         REFERENCES public.exam_config(id),
  started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at            TIMESTAMPTZ,

  -- Step 2: question IDs randomly selected from bank by program
  source_question_ids     INT[]       NOT NULL DEFAULT '{}',

  -- Step 3: LLM-rephrased final paper (JSON array)
  -- [{"id":1,"question":"...","marks":2,"topic":"...","source_ids":["CH01_Q003","CH01_Q007"]}]
  generated_questions     JSONB,

  -- Step 4: answer image (R2)
  answer_image_url        TEXT,                              -- short-lived signed URL
  answer_image_key        TEXT,                              -- R2 object key for re-signing
  answer_image_expires_at TIMESTAMPTZ,
  answer_image_delete_at  TIMESTAMPTZ,                       -- set by backend to started_at + 30 days

  -- Step 5: evaluation results
  score_awarded           INT,
  score_max               INT,
  grade                   TEXT,
  overall_feedback        TEXT,
  completed               BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_sessions_user      ON public.exam_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_chapter   ON public.exam_sessions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started   ON public.exam_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_completed ON public.exam_sessions(completed);


-- =============================================================================
-- PER-QUESTION EVALUATIONS
-- One row per question in the generated paper
-- model_answer generated at eval time by LLM — never pre-stored
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.evaluations (
  id                    SERIAL      PRIMARY KEY,
  session_id            UUID        NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  question_index        INT         NOT NULL,          -- position in generated_questions array
  generated_question    TEXT        NOT NULL,          -- LLM-rephrased question text
  source_question_id    INT         REFERENCES public.questions(id) ON DELETE SET NULL,
  marks_awarded         INT         NOT NULL DEFAULT 0,
  marks_max             INT         NOT NULL,
  feedback              TEXT,                          -- Bengali, 2-3 encouraging sentences
  model_answer          TEXT,                          -- ideal answer, generated at eval time
  show_answer_requested BOOLEAN     NOT NULL DEFAULT false,
  UNIQUE(session_id, question_index)
);

CREATE INDEX IF NOT EXISTS idx_evaluations_session ON public.evaluations(session_id);


-- =============================================================================
-- DAILY USAGE COUNTER
-- Rate limiting: max 10 exam sessions per user per day (reset at midnight IST)
-- increment_daily_usage() is called atomically before creating a session
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.daily_usage (
  user_id    UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  usage_date DATE    NOT NULL DEFAULT CURRENT_DATE,
  exam_count INT     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

-- Returns TRUE if allowed (under limit), FALSE if limit reached
CREATE OR REPLACE FUNCTION public.increment_daily_usage(
  p_user_id UUID,
  p_limit   INT DEFAULT 10
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  INSERT INTO public.daily_usage (user_id, usage_date, exam_count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET exam_count = daily_usage.exam_count + 1
  RETURNING exam_count INTO v_count;
  RETURN v_count <= p_limit;
END;
$$;


-- =============================================================================
-- API COST LOG
-- Every LLM call logged here (both question_generation and evaluation)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.api_calls (
  id            SERIAL      PRIMARY KEY,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  ip_address    TEXT,
  call_type     TEXT        NOT NULL,   -- generate_questions | evaluate_answers | tutor
  provider      TEXT        NOT NULL,
  model         TEXT        NOT NULL,
  input_tokens  INT         NOT NULL DEFAULT 0,
  output_tokens INT         NOT NULL DEFAULT 0,
  cost_usd      FLOAT       NOT NULL DEFAULT 0,
  cost_inr      FLOAT       NOT NULL DEFAULT 0,
  session_id    UUID        REFERENCES public.exam_sessions(id) ON DELETE SET NULL,
  success       BOOLEAN     NOT NULL DEFAULT true,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_calls_timestamp ON public.api_calls(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_calls_user      ON public.api_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_api_calls_session   ON public.api_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_api_calls_type      ON public.api_calls(call_type);


-- =============================================================================
-- CHAPTER STATS
-- Updated automatically by trigger when a session is marked completed
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.chapter_stats (
  chapter_id     INT         PRIMARY KEY REFERENCES public.chapters(id) ON DELETE CASCADE,
  total_attempts INT         NOT NULL DEFAULT 0,
  average_score  FLOAT,
  average_grade  TEXT,
  hardest_topic  TEXT,       -- topic_tag with lowest avg marks_awarded/marks_max ratio
  last_updated   TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public.update_chapter_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.completed = true AND (OLD.completed = false OR OLD.completed IS NULL) THEN
    INSERT INTO public.chapter_stats (chapter_id, total_attempts, average_score, last_updated)
    SELECT
      NEW.chapter_id,
      COUNT(*),
      ROUND(AVG(score_awarded::FLOAT / NULLIF(score_max, 0) * 100)::NUMERIC, 1),
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
-- ROW LEVEL SECURITY
-- Frontend (anon/student JWT): restricted to own data via policies below
-- Backend (SUPABASE_SERVICE_KEY): bypasses RLS entirely — used for all writes
-- Never expose SUPABASE_SERVICE_KEY to the React frontend
-- =============================================================================

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_usage    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_calls      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_stats  ENABLE ROW LEVEL SECURITY;

-- Role helper (avoids repeated subqueries in every policy)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- ── users ──────────────────────────────────────────────────────────────────
CREATE POLICY "users: own read"   ON public.users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users: own update" ON public.users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "users: admin all"  ON public.users FOR ALL    USING (public.current_user_role() = 'admin');

-- ── curriculum — read-only for everyone, admin can write ───────────────────
CREATE POLICY "classes: read all"     ON public.classes   FOR SELECT USING (true);
CREATE POLICY "classes: admin write"  ON public.classes   FOR ALL    USING (public.current_user_role() = 'admin');

CREATE POLICY "subjects: read all"    ON public.subjects  FOR SELECT USING (true);
CREATE POLICY "subjects: admin write" ON public.subjects  FOR ALL    USING (public.current_user_role() = 'admin');

CREATE POLICY "books: read all"       ON public.books     FOR SELECT USING (true);
CREATE POLICY "books: admin write"    ON public.books     FOR ALL    USING (public.current_user_role() = 'admin');

CREATE POLICY "chapters: auth read"   ON public.chapters  FOR SELECT USING (auth.uid() IS NOT NULL AND active = true);
CREATE POLICY "chapters: admin all"   ON public.chapters  FOR ALL    USING (public.current_user_role() = 'admin');

-- ── questions — authenticated users can read (backend needs stems for LLM) ─
CREATE POLICY "questions: auth read"  ON public.questions FOR SELECT USING (auth.uid() IS NOT NULL AND active = true);
CREATE POLICY "questions: admin all"  ON public.questions FOR ALL    USING (public.current_user_role() = 'admin');

-- ── exam_config — read for authenticated, write for admin ──────────────────
CREATE POLICY "exam_config: auth read"  ON public.exam_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "exam_config: admin all"  ON public.exam_config FOR ALL    USING (public.current_user_role() = 'admin');

-- ── providers — admin only ─────────────────────────────────────────────────
CREATE POLICY "providers: admin only" ON public.providers FOR ALL USING (public.current_user_role() = 'admin');

-- ── exam_sessions — own rows only ─────────────────────────────────────────
CREATE POLICY "sessions: own select" ON public.exam_sessions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "sessions: own insert" ON public.exam_sessions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "sessions: own update" ON public.exam_sessions FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "sessions: admin all"  ON public.exam_sessions FOR ALL    USING (public.current_user_role() = 'admin');

-- ── evaluations — own sessions only ───────────────────────────────────────
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
CREATE POLICY "eval: admin all"  ON public.evaluations FOR ALL USING (public.current_user_role() = 'admin');

-- ── daily_usage ────────────────────────────────────────────────────────────
CREATE POLICY "usage: own"       ON public.daily_usage FOR ALL USING (user_id = auth.uid());
CREATE POLICY "usage: admin all" ON public.daily_usage FOR ALL USING (public.current_user_role() = 'admin');

-- ── api_calls — admin only ─────────────────────────────────────────────────
CREATE POLICY "api_calls: admin only" ON public.api_calls FOR ALL USING (public.current_user_role() = 'admin');

-- ── chapter_stats — all authenticated users can read ──────────────────────
CREATE POLICY "stats: auth read"  ON public.chapter_stats FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "stats: admin all"  ON public.chapter_stats FOR ALL    USING (public.current_user_role() = 'admin');


-- =============================================================================
-- ADMIN VIEWS
-- =============================================================================

-- Full curriculum tree with question readiness per chapter
CREATE OR REPLACE VIEW public.v_curriculum AS
SELECT
  cl.id   AS class_id,    cl.name           AS class_name,
  s.id    AS subject_id,  s.display_name_bn AS subject_bn,
  b.id    AS book_id,     b.book_id_code,   b.title_bn,
  ch.id   AS chapter_id,  ch.chapter_number,
  ch.name_bn,             ch.subtitle_bn,   ch.active,
  COUNT(q.id)                                              AS total_questions,
  COUNT(q.id) FILTER (WHERE q.marks = 2)                  AS q_2mark,
  COUNT(q.id) FILTER (WHERE q.marks = 3)                  AS q_3mark,
  COUNT(q.id) FILTER (WHERE q.marks = 5)                  AS q_5mark
FROM public.classes   cl
JOIN public.subjects  s  ON s.class_id   = cl.id
JOIN public.books     b  ON b.subject_id = s.id
JOIN public.chapters  ch ON ch.book_id   = b.id
LEFT JOIN public.questions q ON q.chapter_id = ch.id AND q.active = true
GROUP BY cl.id, cl.name, s.id, s.display_name_bn, b.id, b.book_id_code,
         b.title_bn, ch.id, ch.chapter_number, ch.name_bn, ch.subtitle_bn, ch.active
ORDER BY cl.id, s.id, b.id, ch.chapter_number;

-- Cost summary — last 30 days (admin dashboard)
CREATE OR REPLACE VIEW public.v_cost_summary AS
SELECT
  DATE(timestamp)                          AS day,
  call_type,
  provider,
  model,
  COUNT(*)                                 AS calls,
  SUM(input_tokens)                        AS total_input_tokens,
  SUM(output_tokens)                       AS total_output_tokens,
  ROUND(SUM(cost_usd)::NUMERIC, 4)         AS total_cost_usd,
  ROUND(SUM(cost_inr)::NUMERIC, 2)         AS total_cost_inr,
  ROUND(AVG(cost_usd)::NUMERIC, 6)         AS avg_cost_usd_per_call
FROM public.api_calls
WHERE timestamp > now() - INTERVAL '30 days'
  AND success = true
GROUP BY 1, 2, 3, 4
ORDER BY 1 DESC, total_cost_inr DESC;

-- Cost projection (admin dashboard cost estimator)
CREATE OR REPLACE VIEW public.v_cost_projection AS
WITH daily AS (
  SELECT ROUND(AVG(cost_usd)::NUMERIC, 6) AS avg_cost_per_session
  FROM public.api_calls
  WHERE timestamp > now() - INTERVAL '7 days'
    AND call_type IN ('generate_questions', 'evaluate_answers')
    AND success = true
)
SELECT
  avg_cost_per_session,
  ROUND((avg_cost_per_session * 1000  * 30 * 84)::NUMERIC, 0) AS inr_1k_per_month,
  ROUND((avg_cost_per_session * 5000  * 30 * 84)::NUMERIC, 0) AS inr_5k_per_month,
  ROUND((avg_cost_per_session * 10000 * 30 * 84)::NUMERIC, 0) AS inr_10k_per_month
FROM daily;


-- =============================================================================
-- SUPABASE AUTH — manual dashboard configuration (cannot be done via SQL)
-- =============================================================================
-- Auth → Providers → Phone      Enable + set Twilio / MessageBird SMS credentials
-- Auth → Providers → Google     Enable + set Google OAuth Client ID & Secret
-- Auth → Providers → Email      Enable for admin (Email + Password)
-- Auth → Settings → JWT expiry  3600 (1 hour)
-- Auth → Settings → Refresh tokens  enabled (students stay logged in)
-- Auth → Settings → Site URL    https://<your>.pages.dev
-- Auth → Settings → Redirect URLs   https://<your>.pages.dev/**
-- =============================================================================

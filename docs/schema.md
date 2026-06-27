# Bengali AI Tutor — Database Schema Reference
> Supabase / PostgreSQL · Schema version 4 · Last updated June 2026

Paste this file at the top of any Claude chat to provide full DB context instantly.

---

## Entity Hierarchy

```
classes
  └── subjects          (class_id → classes.id)
        └── books       (subject_id → subjects.id)
              └── chapters  (book_id → books.id)
                    └── questions  (chapter_id → chapters.id)
```

---

## Enums (application-level only)

| Enum | Values |
|------|--------|
| `question_type` | `mcq`, `match_pairs`, `true_false`, `tap_sequence`, `categorize`, `short_write` |
| `question_part` | `part1`, `part2` |
| `difficulty_level` | `Easy`, `Medium`, `Hard` |
| `subject_type` | `core`, `optional`, `additional` |
| `user_role` | `student`, `teacher`, `admin` |
| `provider_name` | `openai`, `anthropic`, `gemini`, `none` |
| `provider_purpose` | `question_generation`, `evaluation`, `tutor`, `ocr` |

---

## Tables

### `classes`
| Column | Type | Notes |
|--------|------|-------|
| `id` | int4 PK | auto |
| `name` | text NOT NULL | e.g. `"Class 7"` |
| `display_name_bn` | text NOT NULL | e.g. `"সপ্তম শ্রেণী"` |
| `active` | bool | default true |

Current data: id=1 Class 7, id=2 Class 8

---

### `subjects`
| Column | Type | Notes |
|--------|------|-------|
| `id` | int4 PK | auto |
| `class_id` | int4 FK → classes.id | |
| `name` | text NOT NULL | English name e.g. `"History"` |
| `display_name_bn` | text NOT NULL | e.g. `"ইতিহাস"` |
| `subject_type` | subject_type | default `'core'` |
| `active` | bool | default true |

---

### `books`
| Column | Type | Notes |
|--------|------|-------|
| `id` | int4 PK | auto |
| `subject_id` | int4 FK → subjects.id | |
| `book_id_code` | text NOT NULL UNIQUE | e.g. `"otit_o_oitijhyo"` — used as key in question_code |
| `title_bn` | text NOT NULL | e.g. `"অতীত ও ঐতিহ্য"` |
| `total_chapters` | int4 | default 0 |
| `active` | bool | default true |

---

### `chapters`
| Column | Type | Notes |
|--------|------|-------|
| `id` | int4 PK | auto |
| `book_id` | int4 FK → books.id | |
| `chapter_number` | int4 NOT NULL | 1-based |
| `name_bn` | text NOT NULL | Bengali chapter title |
| `subtitle_bn` | text | optional |
| `source_file` | text | original PDF filename |
| `images_path` | text | unused currently |
| `difficulty_avg` | float8 | computed |
| `active` | bool | default true |

UNIQUE constraint: `(book_id, chapter_number)`

---

### `questions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | int4 PK | auto |
| `question_code` | text UNIQUE | format: `{book_id_code}__{json_question_id}` e.g. `paribesh_o_bigyan__paribesh_o_bigyan_ch01_mcq_001` |
| `chapter_id` | int4 FK → chapters.id | |
| `q_type` | question_type enum | `mcq`/`match_pairs`/`true_false`/`tap_sequence`/`categorize`/`short_write` |
| `q_part` | question_part enum | `part1` or `part2` |
| `marks` | numeric NOT NULL | 1 for mcq/true_false, 2 for others |
| `marks_per_item` | numeric | 0.5 for categorize |
| `difficulty` | difficulty_level | `Easy`/`Medium`/`Hard` — default `Medium` |
| `topic_bn` | text | Bengali topic tag |
| `question_bn` | text NOT NULL | Question text in Bengali |
| `options` | jsonb | MCQ: `["opt1","opt2","opt3","opt4","opt5"]` (always 5) |
| `correct_answer` | text | MCQ: one of options. true_false: `"true"`/`"false"` |
| `pairs` | jsonb | match_pairs: `[{"left":"...","right":"..."},...]` (4 pairs) |
| `items` | jsonb | tap_sequence: `["item1","item2","item3","item4"]` (shuffled) |
| `correct_order` | jsonb | tap_sequence: `["item1","item3","item2","item4"]` |
| `categories` | jsonb | categorize: `{"Cat A":["i1","i2","i3","i4"],"Cat B":["i1","i2","i3","i4"]}` |
| `expected_answer` | text | short_write: 1–3 Bengali words |
| `max_words` | int4 | short_write: 1, 2, or 3 |
| `answer_slot_id` | int4 | short_write: sequential 1→N within chapter |
| `active` | bool | default true |
| `created_at` | timestamptz | auto |

**Part assignment by type:**
- `part1`: mcq, match_pairs, true_false, tap_sequence, categorize
- `part2`: short_write only

---

### `exam_config`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | int4 PK | auto | |
| `config_name` | text | | e.g. `"standard_25marks"` |
| `description` | text | | |
| `active` | bool | false | only one active at a time |
| `p1_mcq_count` | int4 | 10 | questions to serve per exam |
| `p1_match_pairs_count` | int4 | 2 | |
| `p1_true_false_count` | int4 | 5 | |
| `p1_tap_sequence_count` | int4 | 2 | |
| `p1_categorize_count` | int4 | 1 | |
| `p2_short_write_count` | int4 | 5 | |
| `difficulty_easy_pct` | int4 | 40 | % of each type to be Easy |
| `difficulty_medium_pct` | int4 | 40 | |
| `difficulty_hard_pct` | int4 | 20 | |
| `created_at` / `updated_at` | timestamptz | now() | |

**Question pool policy (v4):** If a chapter has fewer questions than config requests for a type, all available are served. Hard fail only if chapter has zero questions total.

---

### `exam_sessions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | gen_random_uuid() |
| `user_id` | uuid FK → users.id | |
| `chapter_id` | int4 FK → chapters.id | |
| `exam_config_id` | int4 FK → exam_config.id | nullable |
| `started_at` | timestamptz | |
| `submitted_at` | timestamptz | nullable |
| `part1_questions` | jsonb | full question objects stored at session start |
| `part1_answers` | jsonb | student answers for part 1 |
| `part1_score_awarded` | numeric | |
| `part1_score_max` | numeric | |
| `part1_completed` | bool | default false |
| `part2_questions` | jsonb | short_write questions |
| `answer_image_key` | text | R2 storage key for uploaded answer sheet photo |
| `answer_image_url` | text | presigned URL |
| `answer_image_expires_at` | timestamptz | |
| `part2_ocr_answers` | jsonb | OCR-extracted answers from image |
| `part2_score_awarded` | numeric | |
| `part2_score_max` | numeric | |
| `part2_completed` | bool | default false |
| `score_awarded` | numeric | total |
| `score_max` | numeric | total |
| `grade` | text | A/B/C etc. |
| `completed` | bool | default false |
| `schema_version` | int4 | default 4 |

---

### `evaluations`
Per-question evaluation records linked to a session.

| Column | Type | Notes |
|--------|------|-------|
| `id` | int4 PK | |
| `session_id` | uuid FK → exam_sessions.id | |
| `question_index` | int4 | |
| `q_type` | text | |
| `q_part` | text | |
| `question_bn` | text | |
| `student_answer` | text | |
| `correct_answer` | text | |
| `marks_awarded` | numeric | default 0 |
| `marks_max` | numeric | |
| `is_correct` | bool | |
| `feedback_bn` | text | Bengali feedback from LLM |

---

### `users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | from Supabase Auth |
| `phone` | text | |
| `display_name` | text | |
| `role` | user_role | `student` / `admin` |
| `class_preference` | int4 FK → classes.id | student's preferred class |
| `created_at` | timestamptz | |
| `last_active` | timestamptz | |

---

### `providers`
LLM provider config — switched at runtime from admin panel.

| Column | Type | Notes |
|--------|------|-------|
| `id` | int4 PK | |
| `provider_name` | provider_name enum | OpenAI, Anthropic, Google etc. |
| `model_name` | text | e.g. `"gpt-4.1-nano"` |
| `purpose` | provider_purpose enum | `ocr`, `evaluation` etc. |
| `api_key_env_var` | text | env var name holding the key |
| `active` | bool | default false — one active per purpose |
| `vision_enabled` | bool | whether model supports image input |
| `cost_input_per_m` | float8 | USD per million input tokens |
| `cost_output_per_m` | float8 | USD per million output tokens |
| `max_tokens` | int4 | default 1500 |
| `temperature` | float8 | default 0.7 |

---

### `api_calls`
Cost & usage tracking log.

| Column | Type | Notes |
|--------|------|-------|
| `id` | int4 PK | |
| `timestamp` | timestamptz | default now() |
| `user_id` | uuid | nullable |
| `ip_address` | text | |
| `call_type` | text | e.g. `"ocr"`, `"evaluation"` |
| `provider` | text | |
| `model` | text | |
| `input_tokens` | int4 | default 0 |
| `output_tokens` | int4 | default 0 |
| `cost_usd` | float8 | default 0 |
| `cost_inr` | float8 | default 0 |
| `session_id` | uuid | nullable |
| `success` | bool | default true |
| `error_message` | text | |

---

### `chapter_stats`
Aggregated exam performance per chapter.

| Column | Type |
|--------|------|
| `chapter_id` | int4 PK FK → chapters.id |
| `total_attempts` | int4 default 0 |
| `average_score` | float8 |
| `last_updated` | timestamptz |

---

### `daily_usage`
Per-user per-day usage tracking (rate limiting for exams and AI evaluations).

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid FK → users.id | |
| `usage_date` | date | default CURRENT_DATE |
| `exam_count` | int4 | default 0 |
| `eval_count` | int4 | default 0 — max 1 AI evaluation per day |

---

### `ai_evaluations`
AI-generated evaluation reports based on the student's last 10 completed exams. One request allowed per user per day. Stored permanently so students can re-read past evaluations.

| Column | Type | Notes |
|--------|------|-------|
| `id` | int4 PK | auto |
| `user_id` | uuid FK → users.id | RLS enabled |
| `created_at` | timestamptz | default now() |
| `session_count` | int4 | how many exams were analysed (max 10) |
| `strengths_bn` | text | nullable — strength areas (Bengali) |
| `weaknesses_bn` | text | nullable — weakness areas (Bengali) |
| `advice_bn` | text | nullable — chapters/topics to revisit (Bengali) |
| `summary_bn` | text | nullable — 1-2 line overall summary (Bengali) |
| `full_response_bn` | text NOT NULL | complete LLM response stored as-is |

**Note:** `strengths_bn`, `weaknesses_bn`, `advice_bn`, `summary_bn` are reserved for structured parsing in future. Currently the full Bengali LLM response is stored in `full_response_bn` and displayed as-is.

---

## Views

### `v_curriculum`
Full curriculum tree with per-chapter question counts. Used by admin curriculum tree and exam selection UI.

Key computed columns:
- `total_questions` — count of active questions
- `q_mcq`, `q_match_pairs`, `q_true_false`, `q_tap_sequence`, `q_categorize`, `q_short_write` — count per type
- `q_easy`, `q_medium`, `q_hard` — count per difficulty
- `ready_for_exam` — bool: true only if mcq≥10, match_pairs≥2, true_false≥5, tap_sequence≥2, categorize≥1, short_write≥5

### `v_exam_config`
exam_config + computed marks:
- `p1_max_marks` = (mcq×1) + (match×2) + (tf×1) + (seq×2) + (cat×2)
- `p2_max_marks` = short_write × 2
- `total_max_marks`

### `v_cost_summary`
Last 30 days of successful API calls grouped by day/type/provider/model.
Columns: `day`, `call_type`, `provider`, `model`, `calls`, `total_input_tokens`, `total_output_tokens`, `total_cost_usd`, `total_cost_inr`

---

## Question JSON Format (for import via Admin UI)

### chapters seed JSON (Step 1 — Add Book)
```json
{
  "book_id_code": "otit_o_oitijhyo",
  "title_bn": "অতীত ও ঐতিহ্য",
  "subject_name": "History",
  "subject_display_bn": "ইতিহাস",
  "class_name": "Class 7",
  "total_chapters": 9,
  "chapters": [
    { "chapter_number": 1, "name_bn": "ইতিহাসের ধারণা", "subtitle_bn": "" }
  ]
}
```

### questions JSON (Step 2 — Import Questions)
```json
{
  "book_id": "otit_o_oitijhyo",
  "chapter_no": 1,
  "chapter_title_bn": "ইতিহাসের ধারণা",
  "questions": {
    "mcq": [
      {
        "id": "otit_o_oitijhyo_ch01_mcq_001",
        "type": "mcq",
        "part": 1,
        "marks": 1,
        "difficulty": "easy",
        "topic_bn": "...",
        "question_bn": "...",
        "options": ["opt1","opt2","opt3","opt4","opt5"],
        "correct_answer": "opt2"
      }
    ],
    "match_pairs": [
      {
        "id": "otit_o_oitijhyo_ch01_match_001",
        "type": "match_pairs", "part": 1, "marks": 2,
        "difficulty": "medium", "topic_bn": "...", "question_bn": "...",
        "pairs": [
          {"left": "...", "right": "..."},
          {"left": "...", "right": "..."},
          {"left": "...", "right": "..."},
          {"left": "...", "right": "..."}
        ]
      }
    ],
    "true_false": [
      {
        "id": "otit_o_oitijhyo_ch01_tf_001",
        "type": "true_false", "part": 1, "marks": 1,
        "difficulty": "easy", "topic_bn": "...", "question_bn": "...",
        "correct_answer": "true"
      }
    ],
    "tap_sequence": [
      {
        "id": "otit_o_oitijhyo_ch01_seq_001",
        "type": "tap_sequence", "part": 1, "marks": 2,
        "difficulty": "medium", "topic_bn": "...", "question_bn": "...",
        "items": ["b","d","a","c"],
        "correct_order": ["a","b","c","d"]
      }
    ],
    "categorize": [
      {
        "id": "otit_o_oitijhyo_ch01_cat_001",
        "type": "categorize", "part": 1, "marks": 2, "marks_per_item": 0.5,
        "difficulty": "medium", "topic_bn": "...", "question_bn": "...",
        "categories": {
          "বিভাগ ক": ["item1","item2","item3","item4"],
          "বিভাগ খ": ["item5","item6","item7","item8"]
        }
      }
    ],
    "short_write": [
      {
        "id": "otit_o_oitijhyo_ch01_sw_001",
        "type": "short_write", "part": 2, "marks": 2,
        "difficulty": "easy", "topic_bn": "...", "question_bn": "...",
        "expected_answer": "সংক্ষিপ্ত উত্তর",
        "max_words": 3,
        "answer_slot_id": 1
      }
    ]
  }
}
```

**Difficulty values in JSON:** `"easy"` / `"medium"` / `"hard"` (lowercase) — the seeder capitalises to `Easy`/`Medium`/`Hard` for the DB enum.

**question_code in DB:** `{book_id_code}__{json_id}` e.g. `otit_o_oitijhyo__otit_o_oitijhyo_ch01_mcq_001`

---

## Foreign Keys

| Table | Column | → Foreign Table | → Column |
|-------|--------|-----------------|----------|
| `subjects` | `class_id` | `classes` | `id` |
| `books` | `subject_id` | `subjects` | `id` |
| `chapters` | `book_id` | `books` | `id` |
| `questions` | `chapter_id` | `chapters` | `id` |
| `chapter_stats` | `chapter_id` | `chapters` | `id` |
| `exam_sessions` | `user_id` | `users` | `id` |
| `exam_sessions` | `chapter_id` | `chapters` | `id` |
| `exam_sessions` | `exam_config_id` | `exam_config` | `id` |
| `evaluations` | `session_id` | `exam_sessions` | `id` |
| `api_calls` | `user_id` | `users` | `id` |
| `daily_usage` | `user_id` | `users` | `id` |

---

## How to use this document

Paste the entire contents of this file at the start of any Claude chat session to provide full DB context. Example opener:

```
Here is my database schema for context:
[paste schema.md contents]

Now help me with: [your question]
```


1. **ready_for_exam** requires: MCQ≥10, match_pairs≥2, true_false≥5, tap_sequence≥2, categorize≥1, short_write≥5 per chapter
2. **Graceful exam serving:** if pool < config count for a type, serve all available (no error). Only fail if chapter has zero questions total.
3. **Standard exam config:** 10 MCQ + 2 match + 5 T/F + 2 tap_seq + 1 cat (Part 1) + 5 short_write (Part 2) = 25 marks total
4. **Part 2 optional skip:** student can skip Part 2 — deducts 1 mark (floor 0), completes session immediately, no LLM call. `POST /api/exam/skip-part2`.
5. **Part 2 full flow:** student writes answers on paper → photographs → uploads → OCR → LLM word-match evaluation
6. **Provider switching:** change active provider per purpose at runtime via admin panel, no restart needed
7. **question_code** must be globally unique across all books
8. **AI Evaluation:** once per day per user (`daily_usage.eval_count`). Analyses last 10 completed sessions. Calls `evaluation` provider. Stored permanently in `ai_evaluations`. Full Bengali response shown as accordion on SelectPage and ResultsPage.

---

## Exam Flow (v4)

```
generate → Part 1 (touch) → submit-part1
                                ↓
                    [skip-part2] ──────────────────→ results (-1 mark)
                                ↓
                    Part 2 (write on paper)
                                ↓
                    upload-answer (R2)
                                ↓
                    ocr (Gemini)
                                ↓
                    submit-ocr-answers (student confirms)
                                ↓
                    evaluate-part2 (LLM word-match)
                                ↓
                            results
```

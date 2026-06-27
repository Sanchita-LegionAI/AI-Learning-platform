# AI Pathshala — Project Context Prompt
# Paste this at the start of any new Claude chat for full project context.
# Last updated: June 2026

---

## What is this project?

**AI Pathshala** (ai-pathshala.pages.dev) is a Bengali-medium AI-powered exam tutor platform for West Bengal Board students (currently Class 7 and Class 8). Students take chapter-wise exams, get instant machine evaluation on Part 1, and AI-evaluated written answers on Part 2. An AI evaluation feature analyses their last 10 exams and gives Bengali feedback on strengths/weaknesses.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + Tailwind CSS, deployed on **Cloudflare Pages** |
| Backend | FastAPI (Python), deployed on **Render** |
| Database | **Supabase** (PostgreSQL) |
| Auth | Supabase Auth (Google OAuth + phone OTP) |
| File storage | Cloudflare R2 (answer sheet images) |
| LLM | OpenAI / Anthropic / Gemini — switchable at runtime via admin panel |
| Repo | GitHub: `Sanchita-LegionAI/AI-Learning-platform` |

---

## Repository Structure

```
AI-Learning-platform/
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── SelectPage.jsx          # Home — class/subject/chapter picker + AI eval card
│       │   ├── Part1Page.jsx           # Touch-based MCQ/match/T-F/tap/categorize exam
│       │   ├── TransitionPage.jsx      # Between Part 1 and Part 2
│       │   ├── Part2Page.jsx           # Short-write questions (optional, skip = -1 mark)
│       │   ├── UploadPage.jsx          # Photo upload of handwritten answers
│       │   ├── OcrReviewPage.jsx       # Student confirms OCR results
│       │   ├── ResultsPage.jsx         # Score, grade, per-question breakdown + AI eval card
│       │   ├── MyExamsPage.jsx         # Session history — resume/delete/view
│       │   ├── LoginPage.jsx           # Google OAuth + phone OTP
│       │   ├── PaperPage.jsx           # Printable answer sheet
│       │   └── admin/
│       │       ├── AdminDashboard.jsx  # 5-tab admin: Overview/Curriculum/Analytics/Models/Logs
│       │       └── AdminLogin.jsx
│       ├── components/
│       │   ├── AiEvaluationCard.jsx    # AI evaluation accordion (used in Select + Results)
│       │   ├── ProgressBar.jsx         # Step indicator: বিষয়→অংশ১→বিরতি→অংশ২→ফলাফল
│       │   ├── ErrorMessage.jsx
│       │   ├── LoadingMessage.jsx
│       │   └── questions/
│       │       ├── McqQuestion.jsx
│       │       ├── MatchPairsQuestion.jsx
│       │       ├── TrueFalseQuestion.jsx
│       │       ├── TapSequenceQuestion.jsx
│       │       └── CategorizeQuestion.jsx
│       ├── context/AuthContext.jsx
│       └── lib/
│           ├── api.js                  # All backend API calls
│           └── supabase.js
│
├── backend/
│   └── app/
│       ├── routers/
│       │   ├── exam.py                 # All exam endpoints
│       │   ├── admin.py                # Admin endpoints incl. curriculum manager
│       │   ├── curriculum.py           # Student-facing curriculum endpoint
│       │   └── auth.py
│       ├── services/
│       │   ├── question_service.py     # Graceful question selection (no hard fail on pool size)
│       │   ├── evaluation_service.py   # Part 2 LLM word-match evaluation
│       │   ├── part1_evaluator.py      # Part 1 machine evaluation (no LLM)
│       │   ├── ocr_service.py          # Gemini OCR of handwritten answers
│       │   ├── llm_router.py           # Provider routing (openai/anthropic/gemini)
│       │   └── r2_service.py           # Cloudflare R2 image upload
│       └── core/
│           ├── auth.py
│           └── supabase.py
│
├── backend/question_bank/
│   └── class_7/
│       ├── paribesh_o_bigyan/          # 12 chapters × 150 questions = 1,800 questions
│       │   └── paribesh_o_bigyan_ch01_questions.json ... ch12
│       └── otit_o_oitijhyo/            # 9 chapters × 150 questions (ch01 has only 20)
│           └── otit_o_oitijhyo_ch01_questions.json ... ch09
│
└── docs/
    └── schema.md                       # Full DB schema reference (keep updated)
```

---

## Database Schema (v4)

### Enums
| Enum | Values |
|------|--------|
| `question_type` | `mcq`, `match_pairs`, `true_false`, `tap_sequence`, `categorize`, `short_write` |
| `question_part` | `part1`, `part2` |
| `difficulty_level` | `Easy`, `Medium`, `Hard` |
| `subject_type` | `core`, `optional`, `additional` |
| `user_role` | `student`, `teacher`, `admin` |
| `provider_name` | `openai`, `anthropic`, `gemini`, `none` |
| `provider_purpose` | `question_generation`, `evaluation`, `tutor`, `ocr` |

### Entity Hierarchy
```
classes → subjects → books → chapters → questions
```

### Key Tables

**classes** — `id`, `name` ("Class 7"), `display_name_bn` ("সপ্তম শ্রেণী"), `active`

**subjects** — `id`, `class_id`, `name` (English), `display_name_bn` (Bengali), `subject_type`, `active`

**books** — `id`, `subject_id`, `book_id_code` (unique, e.g. "otit_o_oitijhyo"), `title_bn`, `total_chapters`, `active`

**chapters** — `id`, `book_id`, `chapter_number`, `name_bn`, `subtitle_bn`, `source_file`, `active`
UNIQUE: `(book_id, chapter_number)`

**questions** — `id`, `question_code` (UNIQUE: `{book_id_code}__{json_id}`), `chapter_id`, `q_type`, `q_part`, `marks`, `marks_per_item`, `difficulty`, `topic_bn`, `question_bn`, `active`, `created_at`
Type-specific JSONB fields: `options`, `correct_answer`, `pairs`, `items`, `correct_order`, `categories`, `expected_answer`, `max_words`, `answer_slot_id`

**exam_config** — `id`, `config_name`, `active`, `p1_mcq_count`(10), `p1_match_pairs_count`(2), `p1_true_false_count`(5), `p1_tap_sequence_count`(2), `p1_categorize_count`(1), `p2_short_write_count`(5), `difficulty_easy_pct`(40), `difficulty_medium_pct`(40), `difficulty_hard_pct`(20)

**exam_sessions** — `id`(uuid), `user_id`, `chapter_id`, `exam_config_id`, `started_at`, `submitted_at`, `part1_questions`(jsonb), `part1_answers`(jsonb), `part1_score_awarded`, `part1_score_max`, `part1_completed`, `part2_questions`(jsonb), `answer_image_key`, `answer_image_url`, `part2_ocr_answers`(jsonb), `part2_score_awarded`, `part2_score_max`, `part2_completed`, `score_awarded`, `score_max`, `grade`, `completed`, `schema_version`(4)

**evaluations** — `id`, `session_id`, `question_index`, `q_type`, `q_part`, `question_bn`, `student_answer`, `correct_answer`, `marks_awarded`, `marks_max`, `is_correct`, `feedback_bn`

**users** — `id`(uuid, Supabase Auth), `phone`, `display_name`, `role`, `class_preference`, `created_at`, `last_active`

**providers** — `id`, `provider_name`, `model_name`, `purpose`, `api_key_env_var`, `active`, `vision_enabled`, `cost_input_per_m`, `cost_output_per_m`, `max_tokens`, `temperature`

**api_calls** — `id`, `timestamp`, `user_id`, `ip_address`, `call_type`, `provider`, `model`, `input_tokens`, `output_tokens`, `cost_usd`, `cost_inr`, `session_id`, `success`, `error_message`

**chapter_stats** — `chapter_id`(PK), `total_attempts`, `average_score`, `last_updated`

**daily_usage** — `user_id`, `usage_date`, `exam_count`, `eval_count`(max 1 AI eval/day)

**ai_evaluations** — `id`, `user_id`, `created_at`, `session_count`, `strengths_bn`, `weaknesses_bn`, `advice_bn`, `summary_bn`, `full_response_bn`(NOT NULL). RLS enabled.

### Views
- **v_curriculum** — full tree with question counts per type + `ready_for_exam` bool
- **v_exam_config** — exam_config + computed p1_max_marks, p2_max_marks, total_max_marks
- **v_cost_summary** — last 30 days API costs grouped by day/type/provider/model

### Foreign Keys
`subjects.class_id→classes`, `books.subject_id→subjects`, `chapters.book_id→books`, `questions.chapter_id→chapters`, `chapter_stats.chapter_id→chapters`, `exam_sessions.chapter_id→chapters`, `exam_sessions.user_id→users`, `evaluations.session_id→exam_sessions`, `ai_evaluations.user_id→users`, `daily_usage.user_id→users`, `api_calls.user_id→users`

---

## API Endpoints

### Exam (student-facing) — `/api/exam/`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/generate` | Create exam session, select questions |
| POST | `/submit-part1` | Machine-evaluate Part 1, store scores |
| POST | `/skip-part2` | Skip Part 2, deduct 1 mark, complete session |
| POST | `/upload-answer` | Upload handwritten answer photo to R2 |
| POST | `/ocr` | Gemini OCR of uploaded image |
| POST | `/submit-ocr-answers` | Store student-confirmed OCR answers |
| POST | `/evaluate-part2` | LLM word-match evaluate Part 2 |
| POST | `/ai-evaluation` | Generate AI progress report (once/day) |
| GET | `/ai-evaluations` | List all saved AI evaluations for user |
| GET | `/session/{id}` | Full session + evaluations |
| GET | `/my-sessions` | All sessions for current user |
| DELETE | `/session/{id}` | Delete incomplete session |

### Admin — `/api/admin/`
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/config` | LLM provider switching |
| GET | `/usage-summary` | Cost summary (30 days) |
| GET | `/usage-logs` | Filterable API call logs |
| DELETE | `/logs` | Clear all logs |
| GET | `/chapters` | All chapters with question counts |
| GET | `/chapter-stats` | Per-chapter attempt counts + avg scores |
| GET | `/exam-sessions` | All completed exam sessions (admin analytics) |
| POST | `/questions/import` | Trigger legacy seed_questions.py |
| POST | `/curriculum/seed-class` | Create a new class |
| POST | `/curriculum/seed-book` | Create subject + book + chapters |
| POST | `/curriculum/seed-questions` | Import questions from chapter JSON |
| GET | `/curriculum/tree` | Full curriculum tree with question counts |
| DELETE | `/curriculum/book/{code}` | Delete book + all chapters + questions |

### Curriculum (student-facing) — `/api/curriculum/`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Full curriculum tree for exam selection |

---

## Exam Flow

```
generate → Part 1 (touch) → submit-part1
                                ↓
                    [skip-part2] ──────────→ results (-1 mark penalty)
                                ↓
                    Part 2 (write on paper)
                                ↓
                    upload-answer → ocr → submit-ocr-answers → evaluate-part2
                                ↓
                            results
```

---

## Question Bank JSON Format

### chapters seed (for Admin → Add Book)
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

### questions JSON (for Admin → Import Questions)
```json
{
  "book_id": "otit_o_oitijhyo",
  "chapter_no": 1,
  "chapter_title_bn": "ইতিহাসের ধারণা",
  "questions": {
    "mcq": [{ "id": "otit_o_oitijhyo_ch01_mcq_001", "type": "mcq", "part": 1, "marks": 1, "difficulty": "easy", "topic_bn": "...", "question_bn": "...", "options": ["a","b","c","d","e"], "correct_answer": "b" }],
    "match_pairs": [{ "id": "..._match_001", "type": "match_pairs", "part": 1, "marks": 2, "difficulty": "medium", "topic_bn": "...", "question_bn": "...", "pairs": [{"left":"...","right":"..."}] }],
    "true_false": [{ "id": "..._tf_001", "type": "true_false", "part": 1, "marks": 1, "difficulty": "easy", "topic_bn": "...", "question_bn": "...", "correct_answer": "true" }],
    "tap_sequence": [{ "id": "..._seq_001", "type": "tap_sequence", "part": 1, "marks": 2, "difficulty": "medium", "topic_bn": "...", "question_bn": "...", "items": ["b","d","a","c"], "correct_order": ["a","b","c","d"] }],
    "categorize": [{ "id": "..._cat_001", "type": "categorize", "part": 1, "marks": 2, "marks_per_item": 0.5, "difficulty": "medium", "topic_bn": "...", "question_bn": "...", "categories": {"Cat A": ["i1","i2","i3","i4"], "Cat B": ["i5","i6","i7","i8"]} }],
    "short_write": [{ "id": "..._sw_001", "type": "short_write", "part": 2, "marks": 2, "difficulty": "easy", "topic_bn": "...", "question_bn": "...", "expected_answer": "সংক্ষিপ্ত উত্তর", "max_words": 3, "answer_slot_id": 1 }]
  }
}
```

**Standard counts per chapter:** 50 MCQ + 10 match_pairs + 20 true_false + 10 tap_sequence + 10 categorize + 50 short_write = **150 questions total**

**Difficulty:** JSON uses lowercase `easy/medium/hard` → seeder capitalises to `Easy/Medium/Hard` for DB enum

**question_code in DB:** `{book_id_code}__{json_id}` e.g. `otit_o_oitijhyo__otit_o_oitijhyo_ch01_mcq_001`

---

## Key Business Rules

1. **ready_for_exam** (v_curriculum view): MCQ≥10, match_pairs≥2, true_false≥5, tap_sequence≥2, categorize≥1, short_write≥5
2. **Graceful question serving:** serve `min(available, requested)` per type — never hard-fail on pool size. Only fail if chapter has zero questions at all.
3. **Standard exam = 25 marks:** 10 MCQ(×1) + 2 match(×2) + 5 T/F(×1) + 2 tap(×2) + 1 cat(×2) + 5 SW(×2)
4. **Part 2 is optional:** skip → -1 mark penalty (floor 0), instant completion, zero LLM cost
5. **AI Evaluation:** once per day per user, analyses last 10 completed sessions, full Bengali response, stored in `ai_evaluations` permanently
6. **Provider switching:** runtime via admin, no restart needed
7. **question_code** globally unique across all books

---

## Admin Dashboard Tabs

1. **Overview** — API cost summary last 30 days, projection cards
2. **Curriculum** — Two-panel: left tree (Class→Subject→Book→Chapter with question counts), right panel (Add Class / Add Book / Add Chapters / Import Questions). Zero SQL.
3. **Analytics** — Student exam history table (searchable/filterable) + Chapter Stats sub-tab
4. **Models** — LLM provider switching per purpose (ocr, evaluation, tutor, question_generation)
5. **Logs** — Filterable API call log with cost per call

---

## Current Content

| Class | Subject | Book | Chapters | Questions |
|-------|---------|------|----------|-----------|
| Class 7 | পরিবেশ ও বিজ্ঞান | paribesh_o_bigyan | 12/12 ready | 1,800 |
| Class 7 | ইতিহাস | otit_o_oitijhyo | 8/9 ready (ch01 has only 20 Qs) | ~1,370 |

---

## Design System (Tailwind)

Custom tokens used throughout (defined in tailwind.config.js / index.css):
- `bg-cream` — page background
- `text-ink` / `text-ink-light` — primary/secondary text
- `bg-saffron` / `text-saffron` / `border-saffron` — primary action colour (orange/amber)
- `bg-forest` / `text-forest` — success/correct colour (green)
- `bg-saffron-light` / `bg-forest-light` — light tinted backgrounds
- `border-border` — standard border colour
- `max-w-app` — max content width
- `.bn` — Bengali font class
- `.card` — standard card style
- `.btn-primary` / `.btn-secondary` — button styles
- `.label` — section label style
- `.page-enter` — page transition class

---

## Pending / Known Issues

- **otit_o_oitijhyo ch01** has only 20 questions (poor quality, answers visible in questions). Needs regeneration from PDF.
- `chapter_stats` table is updated by a trigger or manually — verify trigger exists in DB.
- `daily_usage.eval_count` added via migration — confirm column exists before using AI eval feature.
- `ai_evaluations` has RLS enabled — backend uses service role key (correct).

---

## How to add a new book (zero SQL workflow)

1. Admin → Curriculum tab → **+ Class** (if class doesn't exist)
2. Admin → Curriculum tab → **+ Book** → fill form (class, subject, book_id_code, title, chapters)
3. Generate question JSONs from PDFs (150 questions per chapter, 6 types)
4. Admin → Curriculum tab → click book → **↑ Import Questions** → drop JSON files

---

## How to generate question JSONs

Use this prompt in a new Claude chat with the chapter PDF uploaded:

```
You are generating a structured Bengali question bank for [BOOK NAME] Class 7.
Chapter [N]: [CHAPTER TITLE]

Generate a JSON exactly matching this schema. Output ONLY raw JSON, no markdown fences.

[paste the questions JSON format from above]

Rules:
- All text in Bengali
- difficulty: "easy"/"medium"/"hard" (40%/40%/20%)  
- MCQ: exactly 5 options, correct_answer must be one of them
- match_pairs: exactly 4 pairs
- tap_sequence: 4 items (shuffled), correct_order (right order)
- categorize: exactly 2 categories, exactly 4 items each, marks_per_item: 0.5
- short_write: expected_answer 1-3 Bengali words, answer_slot_id increments 1→50
- Counts: 50 MCQ, 10 match, 20 true_false, 10 tap_sequence, 10 categorize, 50 short_write
- IDs: {book_id_code}_ch{NN}_{type}_{NNN}
```

\# Bengali AI Tutor — Database Schema Reference

> Supabase / PostgreSQL · Schema version 4 · Last updated June 2026



Paste this file at the top of any Claude chat to provide full DB context instantly.



\---



\## Entity Hierarchy



```

classes

&#x20; └── subjects          (class\_id → classes.id)

&#x20;       └── books       (subject\_id → subjects.id)

&#x20;             └── chapters  (book\_id → books.id)

&#x20;                   └── questions  (chapter\_id → chapters.id)

```



\---



\## Enums (application-level only)



| Enum | Values |

|------|--------|

| `question\_type` | `mcq`, `match\_pairs`, `true\_false`, `tap\_sequence`, `categorize`, `short\_write` |

| `question\_part` | `part1`, `part2` |

| `difficulty\_level` | `Easy`, `Medium`, `Hard` |

| `subject\_type` | `core`, `optional`, `additional` |

| `user\_role` | `student`, `teacher`, `admin` |

| `provider\_name` | `openai`, `anthropic`, `gemini`, `none` |

| `provider\_purpose` | `question\_generation`, `evaluation`, `tutor`, `ocr` |



\---



\## Tables



\### `classes`

| Column | Type | Notes |

|--------|------|-------|

| `id` | int4 PK | auto |

| `name` | text NOT NULL | e.g. `"Class 7"` |

| `display\_name\_bn` | text NOT NULL | e.g. `"সপ্তম শ্রেণী"` |

| `active` | bool | default true |



Current data: id=1 Class 7, id=2 Class 8



\---



\### `subjects`

| Column | Type | Notes |

|--------|------|-------|

| `id` | int4 PK | auto |

| `class\_id` | int4 FK → classes.id | |

| `name` | text NOT NULL | English name e.g. `"History"` |

| `display\_name\_bn` | text NOT NULL | e.g. `"ইতিহাস"` |

| `subject\_type` | subject\_type | default `'core'` |

| `active` | bool | default true |



\---



\### `books`

| Column | Type | Notes |

|--------|------|-------|

| `id` | int4 PK | auto |

| `subject\_id` | int4 FK → subjects.id | |

| `book\_id\_code` | text NOT NULL UNIQUE | e.g. `"otit\_o\_oitijhyo"` — used as key in question\_code |

| `title\_bn` | text NOT NULL | e.g. `"অতীত ও ঐতিহ্য"` |

| `total\_chapters` | int4 | default 0 |

| `active` | bool | default true |



\---



\### `chapters`

| Column | Type | Notes |

|--------|------|-------|

| `id` | int4 PK | auto |

| `book\_id` | int4 FK → books.id | |

| `chapter\_number` | int4 NOT NULL | 1-based |

| `name\_bn` | text NOT NULL | Bengali chapter title |

| `subtitle\_bn` | text | optional |

| `source\_file` | text | original PDF filename |

| `images\_path` | text | unused currently |

| `difficulty\_avg` | float8 | computed |

| `active` | bool | default true |



UNIQUE constraint: `(book\_id, chapter\_number)`



\---



\### `questions`

| Column | Type | Notes |

|--------|------|-------|

| `id` | int4 PK | auto |

| `question\_code` | text UNIQUE | format: `{book\_id\_code}\_\_{json\_question\_id}` e.g. `paribesh\_o\_bigyan\_\_paribesh\_o\_bigyan\_ch01\_mcq\_001` |

| `chapter\_id` | int4 FK → chapters.id | |

| `q\_type` | question\_type enum | `mcq`/`match\_pairs`/`true\_false`/`tap\_sequence`/`categorize`/`short\_write` |

| `q\_part` | question\_part enum | `part1` or `part2` |

| `marks` | numeric NOT NULL | 1 for mcq/true\_false, 2 for others |

| `marks\_per\_item` | numeric | 0.5 for categorize |

| `difficulty` | difficulty\_level | `Easy`/`Medium`/`Hard` — default `Medium` |

| `topic\_bn` | text | Bengali topic tag |

| `question\_bn` | text NOT NULL | Question text in Bengali |

| `options` | jsonb | MCQ: `\["opt1","opt2","opt3","opt4","opt5"]` (always 5) |

| `correct\_answer` | text | MCQ: one of options. true\_false: `"true"`/`"false"` |

| `pairs` | jsonb | match\_pairs: `\[{"left":"...","right":"..."},...]` (4 pairs) |

| `items` | jsonb | tap\_sequence: `\["item1","item2","item3","item4"]` (shuffled) |

| `correct\_order` | jsonb | tap\_sequence: `\["item1","item3","item2","item4"]` |

| `categories` | jsonb | categorize: `{"Cat A":\["i1","i2","i3","i4"],"Cat B":\["i1","i2","i3","i4"]}` |

| `expected\_answer` | text | short\_write: 1–3 Bengali words |

| `max\_words` | int4 | short\_write: 1, 2, or 3 |

| `answer\_slot\_id` | int4 | short\_write: sequential 1→N within chapter |

| `active` | bool | default true |

| `created\_at` | timestamptz | auto |



\*\*Part assignment by type:\*\*

\- `part1`: mcq, match\_pairs, true\_false, tap\_sequence, categorize

\- `part2`: short\_write only



\---



\### `exam\_config`

| Column | Type | Default | Notes |

|--------|------|---------|-------|

| `id` | int4 PK | auto | |

| `config\_name` | text | | e.g. `"standard\_25marks"` |

| `description` | text | | |

| `active` | bool | false | only one active at a time |

| `p1\_mcq\_count` | int4 | 10 | questions to serve per exam |

| `p1\_match\_pairs\_count` | int4 | 2 | |

| `p1\_true\_false\_count` | int4 | 5 | |

| `p1\_tap\_sequence\_count` | int4 | 2 | |

| `p1\_categorize\_count` | int4 | 1 | |

| `p2\_short\_write\_count` | int4 | 5 | |

| `difficulty\_easy\_pct` | int4 | 40 | % of each type to be Easy |

| `difficulty\_medium\_pct` | int4 | 40 | |

| `difficulty\_hard\_pct` | int4 | 20 | |

| `created\_at` / `updated\_at` | timestamptz | now() | |



\*\*Question pool policy (v4):\*\* If a chapter has fewer questions than config requests for a type, all available are served. Hard fail only if chapter has zero questions total.



\---



\### `exam\_sessions`

| Column | Type | Notes |

|--------|------|-------|

| `id` | uuid PK | gen\_random\_uuid() |

| `user\_id` | uuid FK → users.id | |

| `chapter\_id` | int4 FK → chapters.id | |

| `exam\_config\_id` | int4 FK → exam\_config.id | nullable |

| `started\_at` | timestamptz | |

| `submitted\_at` | timestamptz | nullable |

| `part1\_questions` | jsonb | full question objects stored at session start |

| `part1\_answers` | jsonb | student answers for part 1 |

| `part1\_score\_awarded` | numeric | |

| `part1\_score\_max` | numeric | |

| `part1\_completed` | bool | default false |

| `part2\_questions` | jsonb | short\_write questions |

| `answer\_image\_key` | text | R2 storage key for uploaded answer sheet photo |

| `answer\_image\_url` | text | presigned URL |

| `answer\_image\_expires\_at` | timestamptz | |

| `part2\_ocr\_answers` | jsonb | OCR-extracted answers from image |

| `part2\_score\_awarded` | numeric | |

| `part2\_score\_max` | numeric | |

| `part2\_completed` | bool | default false |

| `score\_awarded` | numeric | total |

| `score\_max` | numeric | total |

| `grade` | text | A/B/C etc. |

| `completed` | bool | default false |

| `schema\_version` | int4 | default 4 |



\---



\### `evaluations`

Per-question evaluation records linked to a session.



| Column | Type | Notes |

|--------|------|-------|

| `id` | int4 PK | |

| `session\_id` | uuid FK → exam\_sessions.id | |

| `question\_index` | int4 | |

| `q\_type` | text | |

| `q\_part` | text | |

| `question\_bn` | text | |

| `student\_answer` | text | |

| `correct\_answer` | text | |

| `marks\_awarded` | numeric | default 0 |

| `marks\_max` | numeric | |

| `is\_correct` | bool | |

| `feedback\_bn` | text | Bengali feedback from LLM |



\---



\### `users`

| Column | Type | Notes |

|--------|------|-------|

| `id` | uuid PK | from Supabase Auth |

| `phone` | text | |

| `display\_name` | text | |

| `role` | user\_role | `student` / `admin` |

| `class\_preference` | int4 FK → classes.id | student's preferred class |

| `created\_at` | timestamptz | |

| `last\_active` | timestamptz | |



\---



\### `providers`

LLM provider config — switched at runtime from admin panel.



| Column | Type | Notes |

|--------|------|-------|

| `id` | int4 PK | |

| `provider\_name` | provider\_name enum | OpenAI, Anthropic, Google etc. |

| `model\_name` | text | e.g. `"gpt-4.1-nano"` |

| `purpose` | provider\_purpose enum | `ocr`, `evaluation` etc. |

| `api\_key\_env\_var` | text | env var name holding the key |

| `active` | bool | default false — one active per purpose |

| `vision\_enabled` | bool | whether model supports image input |

| `cost\_input\_per\_m` | float8 | USD per million input tokens |

| `cost\_output\_per\_m` | float8 | USD per million output tokens |

| `max\_tokens` | int4 | default 1500 |

| `temperature` | float8 | default 0.7 |



\---



\### `api\_calls`

Cost \& usage tracking log.



| Column | Type | Notes |

|--------|------|-------|

| `id` | int4 PK | |

| `timestamp` | timestamptz | default now() |

| `user\_id` | uuid | nullable |

| `ip\_address` | text | |

| `call\_type` | text | e.g. `"ocr"`, `"evaluation"` |

| `provider` | text | |

| `model` | text | |

| `input\_tokens` | int4 | default 0 |

| `output\_tokens` | int4 | default 0 |

| `cost\_usd` | float8 | default 0 |

| `cost\_inr` | float8 | default 0 |

| `session\_id` | uuid | nullable |

| `success` | bool | default true |

| `error\_message` | text | |



\---



\### `chapter\_stats`

Aggregated exam performance per chapter.



| Column | Type |

|--------|------|

| `chapter\_id` | int4 PK FK → chapters.id |

| `total\_attempts` | int4 default 0 |

| `average\_score` | float8 |

| `last\_updated` | timestamptz |



\---



\### `daily\_usage`

Per-user per-day exam count (rate limiting).



| Column | Type |

|--------|------|

| `user\_id` | uuid FK → users.id |

| `usage\_date` | date default CURRENT\_DATE |

| `exam\_count` | int4 default 0 |



\---



\## Views



\### `v\_curriculum`

Full curriculum tree with per-chapter question counts. Used by admin curriculum tree and exam selection UI.



Key computed columns:

\- `total\_questions` — count of active questions

\- `q\_mcq`, `q\_match\_pairs`, `q\_true\_false`, `q\_tap\_sequence`, `q\_categorize`, `q\_short\_write` — count per type

\- `q\_easy`, `q\_medium`, `q\_hard` — count per difficulty

\- `ready\_for\_exam` — bool: true only if mcq≥10, match\_pairs≥2, true\_false≥5, tap\_sequence≥2, categorize≥1, short\_write≥5



\### `v\_exam\_config`

exam\_config + computed marks:

\- `p1\_max\_marks` = (mcq×1) + (match×2) + (tf×1) + (seq×2) + (cat×2)

\- `p2\_max\_marks` = short\_write × 2

\- `total\_max\_marks`



\### `v\_cost\_summary`

Last 30 days of successful API calls grouped by day/type/provider/model.

Columns: `day`, `call\_type`, `provider`, `model`, `calls`, `total\_input\_tokens`, `total\_output\_tokens`, `total\_cost\_usd`, `total\_cost\_inr`



\---



\## Question JSON Format (for import via Admin UI)



\### chapters seed JSON (Step 1 — Add Book)

```json

{

&#x20; "book\_id\_code": "otit\_o\_oitijhyo",

&#x20; "title\_bn": "অতীত ও ঐতিহ্য",

&#x20; "subject\_name": "History",

&#x20; "subject\_display\_bn": "ইতিহাস",

&#x20; "class\_name": "Class 7",

&#x20; "total\_chapters": 9,

&#x20; "chapters": \[

&#x20;   { "chapter\_number": 1, "name\_bn": "ইতিহাসের ধারণা", "subtitle\_bn": "" }

&#x20; ]

}

```



\### questions JSON (Step 2 — Import Questions)

```json

{

&#x20; "book\_id": "otit\_o\_oitijhyo",

&#x20; "chapter\_no": 1,

&#x20; "chapter\_title\_bn": "ইতিহাসের ধারণা",

&#x20; "questions": {

&#x20;   "mcq": \[

&#x20;     {

&#x20;       "id": "otit\_o\_oitijhyo\_ch01\_mcq\_001",

&#x20;       "type": "mcq",

&#x20;       "part": 1,

&#x20;       "marks": 1,

&#x20;       "difficulty": "easy",

&#x20;       "topic\_bn": "...",

&#x20;       "question\_bn": "...",

&#x20;       "options": \["opt1","opt2","opt3","opt4","opt5"],

&#x20;       "correct\_answer": "opt2"

&#x20;     }

&#x20;   ],

&#x20;   "match\_pairs": \[

&#x20;     {

&#x20;       "id": "otit\_o\_oitijhyo\_ch01\_match\_001",

&#x20;       "type": "match\_pairs", "part": 1, "marks": 2,

&#x20;       "difficulty": "medium", "topic\_bn": "...", "question\_bn": "...",

&#x20;       "pairs": \[

&#x20;         {"left": "...", "right": "..."},

&#x20;         {"left": "...", "right": "..."},

&#x20;         {"left": "...", "right": "..."},

&#x20;         {"left": "...", "right": "..."}

&#x20;       ]

&#x20;     }

&#x20;   ],

&#x20;   "true\_false": \[

&#x20;     {

&#x20;       "id": "otit\_o\_oitijhyo\_ch01\_tf\_001",

&#x20;       "type": "true\_false", "part": 1, "marks": 1,

&#x20;       "difficulty": "easy", "topic\_bn": "...", "question\_bn": "...",

&#x20;       "correct\_answer": "true"

&#x20;     }

&#x20;   ],

&#x20;   "tap\_sequence": \[

&#x20;     {

&#x20;       "id": "otit\_o\_oitijhyo\_ch01\_seq\_001",

&#x20;       "type": "tap\_sequence", "part": 1, "marks": 2,

&#x20;       "difficulty": "medium", "topic\_bn": "...", "question\_bn": "...",

&#x20;       "items": \["b","d","a","c"],

&#x20;       "correct\_order": \["a","b","c","d"]

&#x20;     }

&#x20;   ],

&#x20;   "categorize": \[

&#x20;     {

&#x20;       "id": "otit\_o\_oitijhyo\_ch01\_cat\_001",

&#x20;       "type": "categorize", "part": 1, "marks": 2, "marks\_per\_item": 0.5,

&#x20;       "difficulty": "medium", "topic\_bn": "...", "question\_bn": "...",

&#x20;       "categories": {

&#x20;         "বিভাগ ক": \["item1","item2","item3","item4"],

&#x20;         "বিভাগ খ": \["item5","item6","item7","item8"]

&#x20;       }

&#x20;     }

&#x20;   ],

&#x20;   "short\_write": \[

&#x20;     {

&#x20;       "id": "otit\_o\_oitijhyo\_ch01\_sw\_001",

&#x20;       "type": "short\_write", "part": 2, "marks": 2,

&#x20;       "difficulty": "easy", "topic\_bn": "...", "question\_bn": "...",

&#x20;       "expected\_answer": "সংক্ষিপ্ত উত্তর",

&#x20;       "max\_words": 3,

&#x20;       "answer\_slot\_id": 1

&#x20;     }

&#x20;   ]

&#x20; }

}

```



\*\*Difficulty values in JSON:\*\* `"easy"` / `"medium"` / `"hard"` (lowercase) — the seeder capitalises to `Easy`/`Medium`/`Hard` for the DB enum.



\*\*question\_code in DB:\*\* `{book\_id\_code}\_\_{json\_id}` e.g. `otit\_o\_oitijhyo\_\_otit\_o\_oitijhyo\_ch01\_mcq\_001`



\---



\## Foreign Keys



| Table | Column | → Foreign Table | → Column |

|-------|--------|-----------------|----------|

| `subjects` | `class\_id` | `classes` | `id` |

| `books` | `subject\_id` | `subjects` | `id` |

| `chapters` | `book\_id` | `books` | `id` |

| `questions` | `chapter\_id` | `chapters` | `id` |

| `chapter\_stats` | `chapter\_id` | `chapters` | `id` |

| `exam\_sessions` | `user\_id` | `users` | `id` |

| `exam\_sessions` | `chapter\_id` | `chapters` | `id` |

| `exam\_sessions` | `exam\_config\_id` | `exam\_config` | `id` |

| `evaluations` | `session\_id` | `exam\_sessions` | `id` |

| `api\_calls` | `user\_id` | `users` | `id` |

| `daily\_usage` | `user\_id` | `users` | `id` |



\---



\## How to use this document



Paste the entire contents of this file at the start of any Claude chat session to provide full DB context. Example opener:



```

Here is my database schema for context:

\[paste schema.md contents]



Now help me with: \[your question]

```





1\. \*\*ready\_for\_exam\*\* requires: MCQ≥10, match\_pairs≥2, true\_false≥5, tap\_sequence≥2, categorize≥1, short\_write≥5 per chapter

2\. \*\*Graceful exam serving:\*\* if pool < config count for a type, serve all available (no error). Only fail if chapter has zero questions total.

3\. \*\*Standard exam config:\*\* 10 MCQ + 2 match + 5 T/F + 2 tap\_seq + 1 cat (Part 1) + 5 short\_write (Part 2) = 25 marks total

4\. \*\*Part 2 flow:\*\* student writes answers on paper → photographs → uploads → OCR → LLM word-match evaluation

5\. \*\*Provider switching:\*\* change active provider per purpose at runtime via admin panel, no restart needed

6\. \*\*question\_code\*\* must be globally unique across all books




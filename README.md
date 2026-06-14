# Bengali AI Learning Platform 📚

AI-powered exam tutor for Bengali-medium West Bengal Board students (Class 7–8).  
Students take exams, photograph handwritten answers, and receive scored feedback with model answers — all in Bengali.

---

## How it works

```
question_bank/ JSONs
      ↓ seed_questions.py
  PostgreSQL (Supabase)
      ↓ FastAPI randomly selects by marks distribution
  7 question stems
      ↓ GPT-4.1 Nano rephrases / merges
  Fresh exam paper (never identical)
      ↓ Student writes answers on paper, photographs
  R2 image + questions
      ↓ GPT-4.1 Nano vision evaluates
  Scores + Bengali feedback + model answers
```

---

## Project structure

```
.
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── seed_curriculum.py        ← run once after schema
│   ├── seed_questions.py         ← run after adding JSON files
│   ├── question_bank/            ← drop chapter JSONs here
│   │   ├── CLASS_7/
│   │   │   ├── AMR_PRITHIBI7/
│   │   │   │   ├── AMR_PRITHIBI7_CH01_questions.json
│   │   │   │   └── ...
│   │   │   └── ...
│   │   └── CLASS_8/
│   │       └── ...
│   └── app/
│       ├── core/         config, auth, supabase client
│       ├── services/     llm_router, question_service, evaluation_service, r2_service
│       └── routers/      auth, curriculum, exam, admin
│
├── frontend/
│   ├── package.json
│   ├── .env.example
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── context/      AuthContext
│       ├── lib/          supabase.js, api.js
│       ├── components/   ProgressBar, LoadingMessage, ErrorMessage
│       └── pages/
│           ├── LoginPage, SelectPage, PaperPage, UploadPage, ResultsPage
│           └── admin/    AdminLogin, AdminDashboard
│
├── supabase_schema.sql   ← run first in Supabase SQL Editor
└── README.md
```

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.11+ | Backend |
| Node.js | 18+ | Frontend |
| Supabase account | — | free tier |
| Cloudflare account | — | R2 free tier |
| OpenAI API key | — | GPT-4.1 Nano |
| Anthropic API key | — | Claude Haiku fallback |

---

## Step 1 — Supabase setup

### 1a. Create project
1. Go to [supabase.com](https://supabase.com) → New project
2. Note your **Project URL** and both API keys (anon + service_role)
3. Note your **JWT Secret** (Settings → API → JWT Secret)

### 1b. Apply schema
1. Supabase Dashboard → **SQL Editor** → New Query
2. Paste the entire contents of `supabase_schema.sql`
3. Click **Run** — all tables, triggers, RLS policies, and seed providers are created

### 1c. Configure Auth providers
In Supabase Dashboard → **Authentication → Providers**:

**Phone (for students — OTP):**
- Enable Phone provider
- Set SMS provider: Twilio or MessageBird
- Add your Twilio Account SID, Auth Token, and phone number

**Google OAuth (for students):**
- Enable Google provider
- Create OAuth credentials at [console.cloud.google.com](https://console.cloud.google.com)
- Add Client ID and Client Secret
- Add authorised redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`

**Email (for admin only):**
- Enable Email provider
- Create admin user manually: Authentication → Users → Add User

### 1d. Auth settings
Authentication → **Settings**:
- Site URL: `https://<your>.pages.dev` (or `http://localhost:5173` for dev)
- Redirect URLs: add `https://<your>.pages.dev/**` and `http://localhost:5173/**`
- JWT expiry: `3600`

---

## Step 2 — Cloudflare R2 setup

1. Cloudflare Dashboard → **R2** → Create bucket
2. Name: `exam-answers`
3. Create **API token** with R2 Object Read/Write permissions
4. Note Account ID, Access Key ID, Secret Access Key
5. Set lifecycle rule: **delete objects after 30 days**
   - R2 → exam-answers → Settings → Lifecycle rules → Add rule
   - Prefix: `answers/`, Expiration: 30 days

---

## Step 3 — Backend local setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
```

Edit `.env`:
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret

OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-key-id
R2_SECRET_ACCESS_KEY=your-secret

R2_BUCKET_NAME=exam-answers
ENVIRONMENT=development
CORS_ORIGINS=http://localhost:5173
```

### Seed the database

```bash
# 1. Seed curriculum (classes, subjects, books, chapters)
python seed_curriculum.py

# 2. Validate question bank JSONs first (dry run — no DB writes)
python seed_questions.py --dry-run

# 3. Import questions into DB
python seed_questions.py
```

Expected output:
```
✓ Class: Class 7 (id=1)
  ✓ Subject: Geography (id=1)
    ✓ Book: AMR_PRITHIBI_7 (id=1)
      ✓ Ch01: পৃথিবীর পরিক্রমণ (id=1)
      ...
Summary: 2 classes · 7 subjects · 7 books · 79 chapters
```

### Run the backend

```bash
uvicorn main:app --reload --port 8000
```

API docs (development only): [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Step 4 — Frontend local setup

```bash
cd frontend
npm install

cp .env.example .env
```

Edit `.env`:
```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:8000
```

```bash
npm run dev
```

App: [http://localhost:5173](http://localhost:5173)  
Admin: [http://localhost:5173/admin](http://localhost:5173/admin)

---

## Step 5 — Adding question bank content

Place chapter JSON files in the correct folder:

```
backend/question_bank/CLASS_7/AMR_PRITHIBI7/AMR_PRITHIBI7_CH01_questions.json
```

Each JSON must follow this structure:
```json
{
  "book_id": "AMR_PRITHIBI_7",
  "class": 7,
  "chapter_no": 1,
  "chapter_title": "পৃথিবীর পরিক্রমণ",
  "questions": [
    {
      "id": "CH01_Q001",
      "marks": 2,
      "difficulty": "Easy",
      "topic": "বার্ষিক গতি",
      "expected_lines": "2-3",
      "question": "পৃথিবীর আকর্ষণ বলকে কী বলে?"
    }
  ]
}
```

Valid `marks` values: `2`, `3`, `5`  
Valid `difficulty` values: `Easy`, `Medium`, `Hard`

Then import:
```bash
python seed_questions.py                         # all books
python seed_questions.py --book AMR_PRITHIBI_7  # one book only
python seed_questions.py --dry-run               # validate only
```

Or trigger from the Admin Dashboard → Content → Import from JSON.

---

## Step 6 — Deploy to production

### Backend → Railway

1. Install Railway CLI: `npm install -g @railway/cli`
2. `railway login && railway init`
3. Set all environment variables in Railway dashboard (same as `.env` but with production values)
4. Update `CORS_ORIGINS` to your Cloudflare Pages URL
5. Deploy:
   ```bash
   railway up
   ```
6. Note your Railway URL (e.g. `https://your-app.railway.app`)

### Frontend → Cloudflare Pages

1. Push `frontend/` to a GitHub repository
2. Cloudflare Dashboard → **Pages** → Create a project → Connect to Git
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output: `dist`
   - Root directory: `frontend`
4. Add environment variables:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   VITE_API_URL=https://your-app.railway.app
   ```
5. Deploy — Cloudflare assigns a `*.pages.dev` URL

6. Update Supabase Auth settings with the Pages URL (Site URL + Redirect URLs)
7. Update Railway `CORS_ORIGINS` with the Pages URL

---

## Adding a new book or class

Zero code changes required:

1. Create JSON files for each chapter:
   ```
   backend/question_bank/CLASS_9/BIGYAN_9/BIGYAN_9_CH01_questions.json
   ```

2. Add curriculum entry to `seed_curriculum.py` (the `CURRICULUM` list at the top)

3. Run:
   ```bash
   python seed_curriculum.py    # adds new class/subject/book/chapters
   python seed_questions.py     # imports new questions
   ```

4. The new book appears immediately in the student app — no restart needed.

---

## Switching AI models (runtime, no restart)

Via Admin Dashboard → **Models** tab → Switch button.

Or directly via API:
```bash
curl -X POST https://your-app.railway.app/api/admin/config \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"purpose":"evaluation","provider_name":"anthropic","model_name":"claude-haiku-4-5-20251001"}'
```

---

## Cost reference

| Step | Model | Tokens in | Tokens out | Cost/session |
|---|---|---|---|---|
| Question rephrasing | GPT-4.1 Nano | ~500 | ~400 | ~₹0.03 |
| Answer evaluation | GPT-4.1 Nano (vision) | ~2,000 | ~800 | ~₹0.08 |
| **Total** | | | | **~₹0.11** |

5,000 students/day/month ≈ **₹16,500/month**

---

## Environment variables reference

### Backend `.env`

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✓ | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✓ | Service role key (bypasses RLS) |
| `SUPABASE_JWT_SECRET` | ✓ | JWT secret for token validation |
| `OPENAI_API_KEY` | ✓ | OpenAI API key |
| `ANTHROPIC_API_KEY` | ✓ | Anthropic API key (fallback) |
| `R2_ACCOUNT_ID` | ✓ | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | ✓ | R2 access key |
| `R2_SECRET_ACCESS_KEY` | ✓ | R2 secret key |
| `R2_BUCKET_NAME` | ✓ | R2 bucket name (default: `exam-answers`) |
| `ENVIRONMENT` | | `development` or `production` |
| `CORS_ORIGINS` | | Comma-separated allowed origins |
| `DAILY_EXAM_LIMIT` | | Max exams per user per day (default: `10`) |
| `INR_PER_USD` | | Exchange rate for cost logging (default: `84.0`) |
| `IMAGE_EXPIRY_SECONDS` | | Signed URL validity (default: `3600`) |

### Frontend `.env`

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | ✓ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✓ | Supabase anon/public key |
| `VITE_API_URL` | ✓ | FastAPI backend URL |

---

## API endpoints

```
POST /api/auth/verify              Validate JWT, return user profile
GET  /api/curriculum               Full class → subject → chapter tree
GET  /api/chapters/{book_id}       Chapters for a book

POST /api/exam/generate            Select from bank + LLM rephrase → session
POST /api/exam/upload-answer       Upload answer image to R2
POST /api/exam/evaluate            Vision LLM evaluation → scores + feedback
GET  /api/exam/session/{id}        Full session result

GET  /api/admin/config             Active providers per purpose
POST /api/admin/config             Switch active provider (no restart)
GET  /api/admin/usage-summary      30-day cost summary + projection
GET  /api/admin/usage-logs         Filterable API call log
DELETE /api/admin/logs             Clear logs
GET  /api/admin/chapters           Chapter list with question counts
GET  /api/admin/chapter-stats      Performance analytics
POST /api/admin/questions/import   Trigger seed_questions.py
```

---

## Phase 2 (planned)

- AI Tutor chat per chapter (streaming Bengali responses)
- Teacher dashboard with class analytics
- Redis question cache + rate limit counters
- Offline PWA mode
- Parent progress reports

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TailwindCSS |
| Backend | FastAPI (Python 3.11) |
| Database + Auth | Supabase (PostgreSQL + RLS) |
| Image storage | Cloudflare R2 |
| AI — primary | OpenAI GPT-4.1 Nano (text + vision) |
| AI — fallback | Anthropic Claude Haiku 4.5 |
| Frontend hosting | Cloudflare Pages |
| Backend hosting | Railway |
| Fonts | Hind Siliguri + Tiro Bangla (Google Fonts) |

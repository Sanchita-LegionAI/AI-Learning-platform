"""
seed_questions.py
=================
Walks the entire question_bank/ folder tree and imports all chapter JSON files
into the questions table. Safe to re-run — skips existing question_codes.

Folder structure expected:
    question_bank/
        CLASS_7/
            AMR_PRITHIBI7/
                AMR_PRITHIBI7_CH01_questions.json
                AMR_PRITHIBI7_CH02_questions.json
            HIS7_ATIT_O_OITIJHYA/
                HIS7_CH01_questions.json
            PARIBESH_BIGYAN_7/
                PARIBESH_BIGYAN7_CH01_questions.json
        CLASS_8/
            ...

Each JSON file structure:
    {
        "book_id": "AMR_PRITHIBI_7",
        "book_name": "Amader Prithibi",
        "book_name_bn": "আমাদের পৃথিবী",
        "subject": "Geography",
        "class": 7,
        "chapter_no": 1,
        "chapter_title": "পৃথিবীর পরিক্রমণ",
        "chapter_subtitle": "...",
        "source_file": "ch01.pdf",
        "question_count": 100,
        "distribution": {"2_marks": 40, "3_marks": 40, "5_marks": 20},
        "questions": [
            {
                "id": "CH01_Q001",
                "marks": 2,
                "difficulty": "Easy",
                "topic": "মহাকর্ষ ও অভিকর্ষ",
                "expected_lines": "2-3",
                "question": "পৃথিবীর আকর্ষণ বলকে কী বলে?"
            }
        ]
    }

Usage:
    python seed_questions.py
    python seed_questions.py --dry-run          # validate only, no DB writes
    python seed_questions.py --book AMR_PRITHIBI_7   # single book only
    python seed_questions.py --path ./question_bank  # custom folder path

Requirements:
    pip install supabase python-dotenv

Environment variables (.env):
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY=eyJ...
"""

import os
import sys
import json
import argparse
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# =============================================================================
# CONFIG
# =============================================================================

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
DEFAULT_BANK_PATH = Path(__file__).parent / "question_bank"
BATCH_SIZE = 50          # questions inserted per batch
VALID_MARKS = {2, 3, 5}
VALID_DIFFICULTY = {"Easy", "Medium", "Hard"}

# =============================================================================
# VALIDATION
# =============================================================================

def validate_question_file(data: dict, filepath: Path) -> list[str]:
    """Returns list of error strings. Empty list = valid."""
    errors = []

    required_top = ["book_id", "class", "chapter_no", "chapter_title", "questions"]
    for field in required_top:
        if field not in data:
            errors.append(f"Missing top-level field: '{field}'")

    if "questions" not in data:
        return errors  # can't validate questions without the key

    questions = data["questions"]
    if not isinstance(questions, list) or len(questions) == 0:
        errors.append("'questions' must be a non-empty list")
        return errors

    seen_ids = set()
    for i, q in enumerate(questions):
        prefix = f"questions[{i}]"

        if "id" not in q:
            errors.append(f"{prefix}: missing 'id'")
        elif q["id"] in seen_ids:
            errors.append(f"{prefix}: duplicate id '{q['id']}'")
        else:
            seen_ids.add(q["id"])

        if "question" not in q or not q["question"].strip():
            errors.append(f"{prefix}: missing or empty 'question'")

        if "marks" not in q:
            errors.append(f"{prefix}: missing 'marks'")
        elif q["marks"] not in VALID_MARKS:
            errors.append(f"{prefix}: invalid marks '{q['marks']}' — must be 2, 3, or 5")

        if "difficulty" in q and q["difficulty"] not in VALID_DIFFICULTY:
            errors.append(f"{prefix}: invalid difficulty '{q['difficulty']}'")

    return errors


# =============================================================================
# DB HELPERS
# =============================================================================

def get_chapter_id(supabase: Client, book_id_code: str, chapter_number: int) -> int | None:
    """Look up chapter.id by book_id_code + chapter_number (two-step lookup)."""
    # Step 1: get book.id from book_id_code
    book_res = (
        supabase.table("books")
        .select("id")
        .eq("book_id_code", book_id_code)
        .single()
        .execute()
    )
    if not book_res.data:
        return None
    book_id = book_res.data["id"]

    # Step 2: get chapter.id from book_id + chapter_number
    ch_res = (
        supabase.table("chapters")
        .select("id")
        .eq("book_id", book_id)
        .eq("chapter_number", chapter_number)
        .single()
        .execute()
    )
    if ch_res.data:
        return ch_res.data["id"]
    return None


def get_existing_question_codes(supabase: Client, chapter_id: int) -> set[str]:
    """Return set of question_codes already in DB for this chapter."""
    res = (
        supabase.table("questions")
        .select("question_code")
        .eq("chapter_id", chapter_id)
        .execute()
    )
    return {row["question_code"] for row in res.data}


def insert_questions_batch(supabase: Client, rows: list[dict]) -> int:
    """Insert a batch of question rows. Returns count inserted."""
    if not rows:
        return 0
    res = supabase.table("questions").insert(rows).execute()
    return len(res.data)


# =============================================================================
# PROCESS A SINGLE JSON FILE
# =============================================================================

def process_file(
    supabase: Client,
    filepath: Path,
    dry_run: bool = False,
    stats: dict = None,
) -> bool:
    """
    Process one chapter JSON file.
    Returns True on success, False on failure.
    """
    if stats is None:
        stats = {}

    print(f"\n  📄 {filepath.name}")

    # Load JSON
    try:
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"     ✗ JSON parse error: {e}")
        stats["errors"] = stats.get("errors", 0) + 1
        return False

    # Validate
    errors = validate_question_file(data, filepath)
    if errors:
        print(f"     ✗ Validation failed:")
        for err in errors:
            print(f"       - {err}")
        stats["errors"] = stats.get("errors", 0) + 1
        return False

    book_id_code   = data["book_id"]
    chapter_number = data["chapter_no"]
    questions      = data["questions"]

    if dry_run:
        print(f"     ✓ DRY RUN — {len(questions)} questions valid "
              f"(book={book_id_code}, ch={chapter_number})")
        stats["validated"] = stats.get("validated", 0) + len(questions)
        return True

    # Resolve chapter_id from DB
    chapter_id = get_chapter_id(supabase, book_id_code, chapter_number)
    if chapter_id is None:
        print(f"     ✗ Chapter not found in DB: book={book_id_code}, chapter={chapter_number}")
        print(f"       → Run seed_curriculum.py first")
        stats["errors"] = stats.get("errors", 0) + 1
        return False

    # Find already-imported question codes (idempotent re-runs)
    existing_codes = get_existing_question_codes(supabase, chapter_id)

    # Build rows to insert (skip existing)
    rows_to_insert = []
    skipped = 0

    for q in questions:
        question_code = q["id"]

        if question_code in existing_codes:
            skipped += 1
            continue

        rows_to_insert.append({
            "question_code": question_code,
            "chapter_id":    chapter_id,
            "question_bn":   q["question"].strip(),
            "marks":         q["marks"],
            "difficulty":    q.get("difficulty", "Medium"),
            "topic_tag":     q.get("topic", "").strip() or None,
            "expected_lines": q.get("expected_lines", "").strip() or None,
            "active":        True,
        })

    # Batch insert
    inserted = 0
    for i in range(0, len(rows_to_insert), BATCH_SIZE):
        batch = rows_to_insert[i : i + BATCH_SIZE]
        inserted += insert_questions_batch(supabase, batch)

    print(f"     ✓ inserted={inserted}  skipped={skipped}  "
          f"total_in_file={len(questions)}  chapter_id={chapter_id}")

    stats["inserted"] = stats.get("inserted", 0) + inserted
    stats["skipped"]  = stats.get("skipped", 0) + skipped
    stats["files"]    = stats.get("files", 0) + 1
    return True


# =============================================================================
# WALK THE FOLDER TREE
# =============================================================================

def walk_question_bank(
    supabase: Client,
    bank_path: Path,
    dry_run: bool = False,
    filter_book: str | None = None,
) -> dict:
    """
    Walk question_bank/ recursively, process every *_questions.json file.
    Returns stats dict.
    """
    stats = {
        "files": 0,
        "inserted": 0,
        "skipped": 0,
        "errors": 0,
        "validated": 0,
    }

    if not bank_path.exists():
        print(f"ERROR: question_bank folder not found at: {bank_path}")
        print("Create the folder and add your chapter JSON files.")
        sys.exit(1)

    # Find all *_questions.json files, sorted for deterministic order
    all_files = sorted(bank_path.rglob("*_questions.json"))

    if not all_files:
        print(f"No *_questions.json files found under: {bank_path}")
        return stats

    # Optional filter by book_id_code
    if filter_book:
        all_files = [f for f in all_files if filter_book.upper() in f.name.upper()]
        if not all_files:
            print(f"No files matched book filter: {filter_book}")
            return stats

    # Group by CLASS folder for readable output
    current_class = None
    for filepath in all_files:
        # Determine class label from path (e.g. CLASS_7)
        parts = filepath.relative_to(bank_path).parts
        class_folder = parts[0] if parts else "UNKNOWN"

        if class_folder != current_class:
            current_class = class_folder
            print(f"\n{'─'*50}")
            print(f"  {class_folder}")
            print(f"{'─'*50}")

        process_file(supabase, filepath, dry_run=dry_run, stats=stats)

    return stats


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Import question_bank/ JSON files into Supabase questions table"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Validate files only, no DB writes"
    )
    parser.add_argument(
        "--book", type=str, default=None,
        help="Filter by book_id_code (e.g. AMR_PRITHIBI_7)"
    )
    parser.add_argument(
        "--path", type=str, default=None,
        help="Path to question_bank folder (default: ./question_bank)"
    )
    args = parser.parse_args()

    # Validate env
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        sys.exit(1)

    bank_path = Path(args.path) if args.path else DEFAULT_BANK_PATH

    print("=" * 60)
    print("Bengali AI Learning Platform — Question Bank Seeder")
    print("=" * 60)
    print(f"  Bank path : {bank_path}")
    print(f"  Dry run   : {args.dry_run}")
    print(f"  Book filter: {args.book or 'all'}")

    if args.dry_run:
        print("\n  ⚠️  DRY RUN MODE — no data will be written to DB")
        supabase = None
    else:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    stats = walk_question_bank(
        supabase=supabase,
        bank_path=bank_path,
        dry_run=args.dry_run,
        filter_book=args.book,
    )

    # Summary
    print(f"\n{'='*60}")
    print("Summary")
    print(f"{'='*60}")
    if args.dry_run:
        print(f"  Files validated : {stats['files'] + stats.get('errors', 0)}")
        print(f"  Questions valid : {stats.get('validated', 0)}")
        print(f"  Files with errors: {stats.get('errors', 0)}")
    else:
        print(f"  Files processed : {stats['files']}")
        print(f"  Questions inserted: {stats['inserted']}")
        print(f"  Questions skipped : {stats['skipped']} (already in DB)")
        print(f"  Files with errors : {stats['errors']}")

    if stats.get("errors", 0) > 0:
        print(f"\n  ⚠️  {stats['errors']} file(s) had errors — check output above")
        sys.exit(1)
    else:
        print(f"\n  ✓ All done.")
        if not args.dry_run:
            print(f"\n  Next: start the FastAPI backend")
            print(f"        uvicorn main:app --reload")

"""
services/subject_evaluation_service.py
=======================================
Subject-wise DETERMINISTIC evaluation — pure Python, zero LLM cost.

Given a student (user_id) and a book (book_id):
  1. Fetch all chapters of the book
  2. Fetch the student's COMPLETED exam sessions on those chapters
  3. Fetch all per-question `evaluations` rows for those sessions
  4. Aggregate per question (stable questions.id):
        attempts / correct / wrong / last-attempt result
     and classify:
        repeatedly_wrong  — wrong on 2+ attempts
        wrong_last        — wrong on the most recent attempt (but < 2 wrongs)
        recovered         — wrong earlier, correct on latest attempt
        mastered          — correct on every attempt
  5. Roll up accuracy per topic_bn (via questions table) and per chapter
  6. Produce:
        - stats dict   → stored in ai_evaluations.stats_json, rendered by frontend
        - Bengali text → grounded prompt block for the LLM

Full question text is included ONLY for repeatedly-wrong questions
(capped) to keep token usage under control.
"""
from __future__ import annotations

from app.core.supabase import get_supabase

# Max repeatedly-wrong questions whose full text is sent to the LLM / frontend
MAX_REPEATED_WRONG_LISTED = 15

# A topic is flagged "weak" below this accuracy %
WEAK_TOPIC_THRESHOLD = 60.0

_BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")


def bn_digits(value) -> str:
    """Convert Western digits in a value to Bengali digits."""
    return str(value).translate(_BN_DIGITS)


# =============================================================================
# MAIN AGGREGATION
# =============================================================================

def build_subject_summary(user_id: str, book_id: int) -> dict | None:
    """
    Build the deterministic subject summary.

    Returns None if the student has no completed exams for this book.
    Otherwise returns:
        {
          "stats":       {...},   # JSON-safe dict for stats_json + frontend
          "prompt_text": "...",   # Bengali data block for the LLM
        }
    """
    supabase = get_supabase()

    # ── Book + subject info ──────────────────────────────────────────────────
    book_res = (
        supabase.table("books")
        .select("id, title_bn, subjects!inner(display_name_bn)")
        .eq("id", book_id)
        .single()
        .execute()
    )
    if not book_res.data:
        raise ValueError(f"Book not found: {book_id}")

    book       = book_res.data
    subject_bn = (book.get("subjects") or {}).get("display_name_bn", "?")

    # ── Chapters of this book ────────────────────────────────────────────────
    chapters_res = (
        supabase.table("chapters")
        .select("id, chapter_number, name_bn")
        .eq("book_id", book_id)
        .order("chapter_number")
        .execute()
    )
    chapter_map = {c["id"]: c for c in (chapters_res.data or [])}
    if not chapter_map:
        return None

    # ── Completed sessions on those chapters (oldest → newest) ──────────────
    sessions_res = (
        supabase.table("exam_sessions")
        .select("id, chapter_id, started_at, score_awarded, score_max, grade")
        .eq("user_id", user_id)
        .eq("completed", True)
        .in_("chapter_id", list(chapter_map.keys()))
        .order("started_at")
        .execute()
    )
    sessions = sessions_res.data or []
    if not sessions:
        return None

    session_order   = {s["id"]: i for i, s in enumerate(sessions)}
    session_chapter = {s["id"]: s["chapter_id"] for s in sessions}

    # ── Per-question evaluation rows for those sessions ─────────────────────
    evals_res = (
        supabase.table("evaluations")
        .select("session_id, question_id, q_type, q_part, question_bn, "
                "is_correct, marks_awarded, marks_max")
        .in_("session_id", [s["id"] for s in sessions])
        .execute()
    )
    eval_rows = evals_res.data or []
    if not eval_rows:
        return None

    # ── Topic / difficulty lookup from questions table ──────────────────────
    q_ids = sorted({r["question_id"] for r in eval_rows if r.get("question_id")})
    q_meta = {}
    if q_ids:
        q_res = (
            supabase.table("questions")
            .select("id, topic_bn, difficulty")
            .in_("id", q_ids)
            .execute()
        )
        q_meta = {q["id"]: q for q in (q_res.data or [])}

    # ── Aggregate per question ───────────────────────────────────────────────
    # Stable key: questions.id when present; otherwise fall back to
    # (chapter_id, question_bn) so old un-backfilled rows still aggregate.
    per_q: dict = {}
    for r in eval_rows:
        sid        = r["session_id"]
        chapter_id = session_chapter.get(sid)
        key = r["question_id"] if r.get("question_id") else f"bn::{chapter_id}::{r['question_bn']}"

        meta = q_meta.get(r.get("question_id"), {})
        rec  = per_q.setdefault(key, {
            "question_id": r.get("question_id"),
            "chapter_id":  chapter_id,
            "q_type":      r["q_type"],
            "q_part":      r.get("q_part"),
            "question_bn": r["question_bn"],
            "topic_bn":    meta.get("topic_bn"),
            "difficulty":  meta.get("difficulty"),
            "attempts":    0,
            "correct":     0,
            "wrong":       0,
            "_last_order": -1,
            "last_correct": None,
        })

        rec["attempts"] += 1
        if r.get("is_correct"):
            rec["correct"] += 1
        else:
            rec["wrong"] += 1

        order = session_order.get(sid, -1)
        if order >= rec["_last_order"]:
            rec["_last_order"]  = order
            rec["last_correct"] = bool(r.get("is_correct"))

    # ── Classify ─────────────────────────────────────────────────────────────
    repeatedly_wrong, wrong_last, recovered, mastered = [], [], [], []
    for rec in per_q.values():
        if rec["wrong"] >= 2:
            repeatedly_wrong.append(rec)
        elif rec["wrong"] == 0:
            mastered.append(rec)
        elif rec["last_correct"]:
            recovered.append(rec)
        else:
            wrong_last.append(rec)

    repeatedly_wrong.sort(key=lambda r: (-r["wrong"], -r["attempts"]))

    # ── Chapter rollup ───────────────────────────────────────────────────────
    chapter_stats: dict = {}
    for s in sessions:
        ch  = chapter_map[s["chapter_id"]]
        cst = chapter_stats.setdefault(s["chapter_id"], {
            "chapter_number": ch["chapter_number"],
            "name_bn":        ch["name_bn"],
            "exams":          0,
            "pct_sum":        0.0,
            "q_total":        0,
            "q_correct":      0,
        })
        cst["exams"] += 1
        s_max = float(s.get("score_max") or 0)
        if s_max > 0:
            cst["pct_sum"] += (float(s.get("score_awarded") or 0) / s_max) * 100

    for rec in per_q.values():
        cst = chapter_stats.get(rec["chapter_id"])
        if cst:
            cst["q_total"]   += rec["attempts"]
            cst["q_correct"] += rec["correct"]

    chapters_out = []
    for cst in sorted(chapter_stats.values(), key=lambda c: c["chapter_number"]):
        chapters_out.append({
            "chapter_number": cst["chapter_number"],
            "name_bn":        cst["name_bn"],
            "exams":          cst["exams"],
            "avg_pct":        round(cst["pct_sum"] / cst["exams"], 1) if cst["exams"] else 0.0,
            "accuracy_pct":   round(cst["q_correct"] / cst["q_total"] * 100, 1) if cst["q_total"] else 0.0,
        })

    # ── Topic rollup (only rows with known topic) ────────────────────────────
    topic_stats: dict = {}
    for rec in per_q.values():
        topic = rec.get("topic_bn")
        if not topic:
            continue
        ch  = chapter_map.get(rec["chapter_id"], {})
        tst = topic_stats.setdefault((rec["chapter_id"], topic), {
            "topic_bn":       topic,
            "chapter_number": ch.get("chapter_number"),
            "total":          0,
            "correct":        0,
        })
        tst["total"]   += rec["attempts"]
        tst["correct"] += rec["correct"]

    topics_out = []
    for tst in topic_stats.values():
        topics_out.append({
            **tst,
            "accuracy_pct": round(tst["correct"] / tst["total"] * 100, 1) if tst["total"] else 0.0,
        })
    topics_out.sort(key=lambda t: t["accuracy_pct"])  # weakest first

    # ── Overall numbers ──────────────────────────────────────────────────────
    total_attempts = sum(r["attempts"] for r in per_q.values())
    total_correct  = sum(r["correct"]  for r in per_q.values())

    def _q_public(rec: dict) -> dict:
        return {
            "question_bn":    rec["question_bn"],
            "q_type":         rec["q_type"],
            "topic_bn":       rec.get("topic_bn"),
            "chapter_number": chapter_map.get(rec["chapter_id"], {}).get("chapter_number"),
            "attempts":       rec["attempts"],
            "wrong":          rec["wrong"],
        }

    stats = {
        "book_id":              book["id"],
        "book_title_bn":        book["title_bn"],
        "subject_bn":           subject_bn,
        "exam_count":           len(sessions),
        "chapters_attempted":   len(chapter_stats),
        "chapters_total":       len(chapter_map),
        "questions_seen":       len(per_q),
        "total_attempts":       total_attempts,
        "overall_accuracy_pct": round(total_correct / total_attempts * 100, 1) if total_attempts else 0.0,
        "mastered_count":       len(mastered),
        "recovered_count":      len(recovered),
        "wrong_last_count":     len(wrong_last),
        "repeated_wrong_count": len(repeatedly_wrong),
        "chapters":             chapters_out,
        "topics":               topics_out,
        "repeatedly_wrong":     [_q_public(r) for r in repeatedly_wrong[:MAX_REPEATED_WRONG_LISTED]],
        "wrong_last":           [_q_public(r) for r in wrong_last[:MAX_REPEATED_WRONG_LISTED]],
    }

    return {
        "stats":       stats,
        "prompt_text": _build_prompt_text(stats),
    }


# =============================================================================
# LLM PROMPT BLOCK (Bengali, grounded in the numbers above)
# =============================================================================

def _build_prompt_text(stats: dict) -> str:
    lines = [
        f"বিষয়: {stats['subject_bn']} (বই: {stats['book_title_bn']})",
        f"মোট পরীক্ষা: {bn_digits(stats['exam_count'])}টি | "
        f"অধ্যায় চেষ্টা করেছে: {bn_digits(stats['chapters_attempted'])}/{bn_digits(stats['chapters_total'])} | "
        f"সামগ্রিক সঠিকতা: {bn_digits(stats['overall_accuracy_pct'])}%",
        "",
        "অধ্যায়ভিত্তিক ফলাফল:",
    ]
    for c in stats["chapters"]:
        lines.append(
            f"- অধ্যায় {bn_digits(c['chapter_number'])} ({c['name_bn']}): "
            f"{bn_digits(c['exams'])}টি পরীক্ষা, গড় নম্বর {bn_digits(c['avg_pct'])}%, "
            f"প্রশ্নভিত্তিক সঠিকতা {bn_digits(c['accuracy_pct'])}%"
        )

    weak_topics = [t for t in stats["topics"] if t["accuracy_pct"] < WEAK_TOPIC_THRESHOLD]
    if weak_topics:
        lines += ["", f"দুর্বল টপিক (সঠিকতা {bn_digits(WEAK_TOPIC_THRESHOLD)}%-এর নিচে):"]
        for t in weak_topics[:10]:
            lines.append(
                f"- {t['topic_bn']} (অধ্যায় {bn_digits(t['chapter_number'])}): "
                f"{bn_digits(t['correct'])}/{bn_digits(t['total'])} সঠিক "
                f"({bn_digits(t['accuracy_pct'])}%)"
            )

    if stats["repeatedly_wrong"]:
        lines += ["", "বারবার ভুল হওয়া প্রশ্ন (২ বা তার বেশি বার ভুল):"]
        for q in stats["repeatedly_wrong"]:
            lines.append(
                f"- [অধ্যায় {bn_digits(q['chapter_number'])}"
                + (f", টপিক: {q['topic_bn']}" if q.get("topic_bn") else "")
                + f"] {q['question_bn']} "
                  f"(ভুল {bn_digits(q['wrong'])} বার / {bn_digits(q['attempts'])} বার চেষ্টা)"
            )

    lines += [
        "",
        f"সম্পূর্ণ আয়ত্তে (সব চেষ্টায় সঠিক): {bn_digits(stats['mastered_count'])}টি প্রশ্ন",
        f"আগে ভুল, শেষবার সঠিক (উন্নতি): {bn_digits(stats['recovered_count'])}টি প্রশ্ন",
        f"শেষ চেষ্টায় ভুল: {bn_digits(stats['wrong_last_count'])}টি প্রশ্ন",
    ]
    return "\n".join(lines)


def build_evaluation_prompt(summary: dict) -> str:
    """Final user prompt for the LLM — strictly grounded in the stats."""
    return f"""তুমি একজন বাংলা মাধ্যমের অভিজ্ঞ শিক্ষক। নিচে একজন ছাত্র/ছাত্রীর একটি নির্দিষ্ট বিষয়ের পরীক্ষার নির্ভুল পরিসংখ্যান দেওয়া হলো। এই সংখ্যাগুলি সরাসরি ডেটাবেস থেকে গণনা করা — এগুলিই একমাত্র সত্য।

{summary['prompt_text']}

এই তথ্যের ভিত্তিতে বাংলায় একটি মূল্যায়ন লেখো। নিয়ম:
- শুধুমাত্র উপরের পরিসংখ্যানে যা আছে তার ভিত্তিতে লিখবে। নিজে থেকে কোনো দুর্বলতা বা শক্তি কল্পনা করবে না।
- "বারবার ভুল হওয়া প্রশ্ন" তালিকা থাকলে সেগুলির টপিকগুলিকে সবচেয়ে গুরুত্ব দাও।

মূল্যায়নে থাকবে:
১. **শক্তির দিক**: কোন অধ্যায়/টপিকে ভালো করছে (সংখ্যা উল্লেখ করে)।
২. **দুর্বলতার দিক**: কোন টপিক ও কোন ধরনের প্রশ্নে বারবার ভুল হচ্ছে।
৩. **পরামর্শ**: ঠিক কোন অধ্যায়ের কোন টপিক আবার পড়তে হবে এবং কীভাবে।
৪. **সামগ্রিক মন্তব্য**: উৎসাহমূলক সংক্ষিপ্ত মন্তব্য।

সহজ, উৎসাহমূলক ও স্পষ্ট ভাষায় লেখো। প্রতিটি অংশ আলাদা প্যারায় লেখো।"""

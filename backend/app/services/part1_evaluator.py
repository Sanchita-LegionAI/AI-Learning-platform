"""
services/part1_evaluator.py
============================
Server-side evaluation for Part 1 questions — zero LLM, zero cost.

Each question type has its own evaluation function.
All answers are submitted digitally by the student (no image, no OCR).

Answer format from frontend (part1_answers in session):
  {
    "<question_db_id>": <answer_value>
  }

Answer value types per question type:
  mcq:          "উষ্ণতা"                          (string — selected option text)
  true_false:   "true" | "false"                   (string)
  match_pairs:  {"left_item": "right_item", ...}   (dict)
  tap_sequence: ["item_a", "item_b", ...]           (list — student's order)
  categorize:   {"category": ["item1", ...], ...}  (dict of lists)
"""
from __future__ import annotations
from typing import Any


# =============================================================================
# PER-TYPE EVALUATORS
# =============================================================================

def _eval_mcq(q: dict, student_ans: Any) -> tuple[float, bool]:
    """Full marks if selected option matches correct_answer exactly."""
    correct = (q.get("correct_answer") or "").strip()
    given   = (str(student_ans or "")).strip()
    is_correct = given == correct
    return (float(q["marks"]) if is_correct else 0.0), is_correct


def _eval_true_false(q: dict, student_ans: Any) -> tuple[float, bool]:
    """Full marks if 'true'/'false' matches correct_answer."""
    correct = (q.get("correct_answer") or "").strip().lower()
    given   = (str(student_ans or "")).strip().lower()
    is_correct = given == correct
    return (float(q["marks"]) if is_correct else 0.0), is_correct


def _eval_match_pairs(q: dict, student_ans: Any) -> tuple[float, bool]:
    """
    Partial marks: each correctly matched pair = marks / n_pairs.
    student_ans: {"left_item": "matched_right_item", ...}
    """
    pairs = q.get("pairs") or []
    if not pairs:
        return 0.0, False

    correct_map = {p["left"]: p["right"] for p in pairs}
    student_map = student_ans if isinstance(student_ans, dict) else {}

    n_correct = sum(
        1 for left, right in student_map.items()
        if correct_map.get(left) == right
    )

    marks_max  = float(q["marks"])
    awarded    = round((n_correct / len(pairs)) * marks_max, 2)
    is_correct = n_correct == len(pairs)
    return awarded, is_correct


def _eval_tap_sequence(q: dict, student_ans: Any) -> tuple[float, bool]:
    """Full marks only if complete order matches correct_order exactly."""
    correct = q.get("correct_order") or []
    given   = student_ans if isinstance(student_ans, list) else []
    is_correct = given == correct
    return (float(q["marks"]) if is_correct else 0.0), is_correct


def _eval_categorize(q: dict, student_ans: Any) -> tuple[float, bool]:
    """
    Partial marks per correctly categorised item.
    marks_per_item used if present, otherwise marks / total_items.
    student_ans: {"category_name": ["item1", "item2", ...], ...}
    """
    categories = q.get("categories") or {}
    if not categories:
        return 0.0, False

    # Total items across all categories
    all_items = [item for items in categories.values() for item in items]
    n_total   = len(all_items)
    if n_total == 0:
        return 0.0, False

    marks_max = float(q["marks"])
    mpi       = float(q.get("marks_per_item") or 0) or round(marks_max / n_total, 4)

    student_map = student_ans if isinstance(student_ans, dict) else {}

    n_correct = 0
    for cat_name, correct_items in categories.items():
        student_items = set(student_map.get(cat_name) or [])
        n_correct += len(set(correct_items) & student_items)

    awarded    = round(min(n_correct * mpi, marks_max), 2)
    is_correct = awarded == marks_max
    return awarded, is_correct


# Dispatch table
_EVALUATORS = {
    "mcq":          _eval_mcq,
    "true_false":   _eval_true_false,
    "match_pairs":  _eval_match_pairs,
    "tap_sequence": _eval_tap_sequence,
    "categorize":   _eval_categorize,
}


# =============================================================================
# MAIN EVALUATOR
# =============================================================================

def evaluate_part1(
    questions: list[dict],
    answers:   dict,
) -> dict:
    """
    Evaluate all Part 1 questions server-side.

    Args:
        questions: list of question dicts as stored in session.part1_questions
        answers:   {str(question_db_id): answer_value}
                   Keys are strings because JSON object keys are always strings.

    Returns:
        {
          "score_awarded": float,
          "score_max":     float,
          "percentage":    float,
          "grade":         str,
          "results": [
            {
              "question_id":    int,
              "q_type":         str,
              "question_bn":    str,
              "topic_bn":       str | None,
              "marks_awarded":  float,
              "marks_max":      float,
              "is_correct":     bool,
              "student_answer": any,
              "correct_answer": any,   # type-appropriate
            },
            ...
          ]
        }
    """
    results       = []
    total_awarded = 0.0
    total_max     = 0.0

    for q in questions:
        q_id    = str(q["id"])
        q_type  = q["q_type"]
        marks   = float(q["marks"])
        student = answers.get(q_id)  # None if student didn't answer

        evaluator = _EVALUATORS.get(q_type)
        if evaluator is None:
            # Unknown type — skip silently, don't count toward score
            continue

        if student is None:
            # No answer submitted
            awarded    = 0.0
            is_correct = False
        else:
            awarded, is_correct = evaluator(q, student)

        total_awarded += awarded
        total_max     += marks

        # Build the "correct answer" value in a frontend-friendly shape
        correct_display = _correct_answer_for_display(q)

        results.append({
            "question_id":    q["id"],
            "q_type":         q_type,
            "question_bn":    q["question_bn"],
            "topic_bn":       q.get("topic_bn"),
            "marks_awarded":  awarded,
            "marks_max":      marks,
            "is_correct":     is_correct,
            "student_answer": student,
            "correct_answer": correct_display,
        })

    pct   = round((total_awarded / total_max * 100) if total_max > 0 else 0, 1)
    grade = _assign_grade(pct)

    return {
        "score_awarded": total_awarded,
        "score_max":     total_max,
        "percentage":    pct,
        "grade":         grade,
        "results":       results,
    }


def _correct_answer_for_display(q: dict) -> Any:
    """Return the correct answer in a shape the frontend can render."""
    q_type = q["q_type"]
    if q_type in ("mcq", "true_false"):
        return q.get("correct_answer")
    if q_type == "match_pairs":
        return {p["left"]: p["right"] for p in (q.get("pairs") or [])}
    if q_type == "tap_sequence":
        return q.get("correct_order")
    if q_type == "categorize":
        return q.get("categories")
    return None


def _assign_grade(pct: float) -> str:
    if pct >= 90: return "A+"
    if pct >= 80: return "A"
    if pct >= 70: return "B+"
    if pct >= 60: return "B"
    if pct >= 50: return "C"
    return "D"

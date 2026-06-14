"""
seed_curriculum.py
==================
Seeds the static curriculum data: classes, subjects, books, chapters.

Run this ONCE after applying supabase_schema.sql, then again any time
you add a new class, subject, or book (it upserts, so safe to re-run).

Usage:
    python seed_curriculum.py

Requirements:
    pip install supabase python-dotenv

Environment variables (.env):
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY=eyJ...          # service role key — bypasses RLS
"""

import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# =============================================================================
# CURRICULUM DATA
# To add a new class/subject/book: add it here and re-run the script.
# No code changes elsewhere needed.
# =============================================================================

CURRICULUM = [
    {
        "class": {
            "name": "Class 7",
            "display_name_bn": "সপ্তম শ্রেণী",
        },
        "subjects": [
            {
                "name": "Geography",
                "display_name_bn": "ভূগোল",
                "subject_type": "core",
                "books": [
                    {
                        "book_id_code": "AMR_PRITHIBI_7",
                        "title_bn": "আমাদের পৃথিবী",
                        "chapters": [
                            {"chapter_number": 1,  "name_bn": "পৃথিবীর পরিক্রমণ",          "subtitle_bn": "পৃথিবীর বার্ষিক গতি, ঋতু পরিবর্তন, বিষুব ও সংক্রান্তি"},
                            {"chapter_number": 2,  "name_bn": "পৃথিবীর অভ্যন্তরীণ গঠন",    "subtitle_bn": "ভূত্বক, গুরুমণ্ডল ও কেন্দ্রমণ্ডল"},
                            {"chapter_number": 3,  "name_bn": "শিলা",                        "subtitle_bn": "আগ্নেয়, পাললিক ও রূপান্তরিত শিলা"},
                            {"chapter_number": 4,  "name_bn": "বায়ুমণ্ডল",                  "subtitle_bn": "বায়ুর স্তর, উপাদান ও গুরুত্ব"},
                            {"chapter_number": 5,  "name_bn": "আবহাওয়া ও জলবায়ু",          "subtitle_bn": "তাপমাত্রা, বৃষ্টিপাত ও বায়ুচাপ"},
                            {"chapter_number": 6,  "name_bn": "জলবায়ু অঞ্চল",               "subtitle_bn": "উষ্ণমণ্ডলীয়, নাতিশীতোষ্ণ ও হিমমণ্ডলীয়"},
                            {"chapter_number": 7,  "name_bn": "নদী",                         "subtitle_bn": "নদীর কাজ, ভূমিরূপ ও নদীর জীবনচক্র"},
                            {"chapter_number": 8,  "name_bn": "সমুদ্র",                      "subtitle_bn": "সমুদ্রের গভীরতা, স্রোত ও জোয়ারভাটা"},
                            {"chapter_number": 9,  "name_bn": "মানচিত্র পরিচিতি",            "subtitle_bn": "স্কেল, প্রতীক ও দিকনির্ণয়"},
                            {"chapter_number": 10, "name_bn": "ভারত: ভূপ্রকৃতি",             "subtitle_bn": "হিমালয়, সমভূমি ও উপদ্বীপীয় মালভূমি"},
                            {"chapter_number": 11, "name_bn": "পশ্চিমবঙ্গ",                  "subtitle_bn": "ভৌগোলিক অবস্থান, ভূপ্রকৃতি ও নদনদী"},
                        ],
                    }
                ],
            },
            {
                "name": "History",
                "display_name_bn": "ইতিহাস",
                "subject_type": "core",
                "books": [
                    {
                        "book_id_code": "HIS7_ATIT_O_OITIJHYA",
                        "title_bn": "অতীত ও ঐতিহ্য",
                        "chapters": [
                            {"chapter_number": 1, "name_bn": "ইতিহাসের ধারণা",               "subtitle_bn": "ইতিহাসের উৎস ও পদ্ধতি"},
                            {"chapter_number": 2, "name_bn": "প্রাচীন সভ্যতা",               "subtitle_bn": "মেসোপটেমিয়া, মিশর ও সিন্ধু সভ্যতা"},
                            {"chapter_number": 3, "name_bn": "মৌর্য সাম্রাজ্য",              "subtitle_bn": "চন্দ্রগুপ্ত, অশোক ও মৌর্য প্রশাসন"},
                            {"chapter_number": 4, "name_bn": "গুপ্ত যুগ",                    "subtitle_bn": "গুপ্ত সাম্রাজ্য ও সংস্কৃতির স্বর্ণযুগ"},
                            {"chapter_number": 5, "name_bn": "সুলতানি আমল",                  "subtitle_bn": "দিল্লি সুলতানি ও তার প্রভাব"},
                            {"chapter_number": 6, "name_bn": "মুঘল সাম্রাজ্য",               "subtitle_bn": "আকবর থেকে আওরঙ্গজেব"},
                            {"chapter_number": 7, "name_bn": "ইউরোপীয়দের আগমন",             "subtitle_bn": "পর্তুগিজ, ডাচ, ফরাসি ও ব্রিটিশ"},
                            {"chapter_number": 8, "name_bn": "ব্রিটিশ শাসনের সূচনা",         "subtitle_bn": "পলাশির যুদ্ধ ও ইস্ট ইন্ডিয়া কোম্পানি"},
                            {"chapter_number": 9, "name_bn": "সিপাহি বিদ্রোহ",               "subtitle_bn": "১৮৫৭-র মহাবিদ্রোহ ও তার ফলাফল"},
                        ],
                    }
                ],
            },
            {
                "name": "Science",
                "display_name_bn": "পরিবেশ ও বিজ্ঞান",
                "subject_type": "core",
                "books": [
                    {
                        "book_id_code": "PARIBESH_BIGYAN_7",
                        "title_bn": "পরিবেশ ও বিজ্ঞান",
                        "chapters": [
                            {"chapter_number": 1,  "name_bn": "পরিবেশ ও জীবজগৎ",             "subtitle_bn": "বাস্তুতন্ত্র ও জীববৈচিত্র্য"},
                            {"chapter_number": 2,  "name_bn": "কোষ",                          "subtitle_bn": "উদ্ভিদ ও প্রাণীকোষের গঠন"},
                            {"chapter_number": 3,  "name_bn": "পুষ্টি",                       "subtitle_bn": "খাদ্য উপাদান ও পুষ্টির কাজ"},
                            {"chapter_number": 4,  "name_bn": "শ্বসন",                        "subtitle_bn": "সবাত ও অবাত শ্বসন"},
                            {"chapter_number": 5,  "name_bn": "পদার্থের অবস্থা",              "subtitle_bn": "কঠিন, তরল ও গ্যাসীয় অবস্থা"},
                            {"chapter_number": 6,  "name_bn": "তাপ",                          "subtitle_bn": "তাপ পরিবাহিতা, প্রতিফলন ও বিকিরণ"},
                            {"chapter_number": 7,  "name_bn": "আলো",                          "subtitle_bn": "আলোর প্রতিফলন ও প্রতিসরণ"},
                            {"chapter_number": 8,  "name_bn": "বল ও গতি",                    "subtitle_bn": "নিউটনের গতিসূত্র ও বলের প্রকারভেদ"},
                            {"chapter_number": 9,  "name_bn": "মহাকর্ষ ও অভিকর্ষ",           "subtitle_bn": "পৃথিবীর আকর্ষণ ও মুক্তিবেগ"},
                            {"chapter_number": 10, "name_bn": "রাসায়নিক বিক্রিয়া",           "subtitle_bn": "অ্যাসিড, ক্ষার ও লবণ"},
                        ],
                    }
                ],
            },
            {
                "name": "Mathematics",
                "display_name_bn": "গণিত",
                "subject_type": "core",
                "books": [
                    {
                        "book_id_code": "GANIT_7",
                        "title_bn": "গণিত",
                        "chapters": [
                            {"chapter_number": 1,  "name_bn": "পূর্ণসংখ্যা",                 "subtitle_bn": "ধনাত্মক ও ঋণাত্মক সংখ্যা, সংখ্যারেখা"},
                            {"chapter_number": 2,  "name_bn": "ভগ্নাংশ",                     "subtitle_bn": "সরল, দশমিক ও মিশ্র ভগ্নাংশ"},
                            {"chapter_number": 3,  "name_bn": "অনুপাত ও সমানুপাত",           "subtitle_bn": "অনুপাতের ধারণা ও প্রয়োগ"},
                            {"chapter_number": 4,  "name_bn": "শতকরা",                       "subtitle_bn": "শতকরার ধারণা ও ব্যবহারিক প্রয়োগ"},
                            {"chapter_number": 5,  "name_bn": "বীজগাণিতিক রাশি",             "subtitle_bn": "রাশির সংযোজন, বিয়োজন ও গুণন"},
                            {"chapter_number": 6,  "name_bn": "সমীকরণ",                      "subtitle_bn": "এক চলবিশিষ্ট রৈখিক সমীকরণ"},
                            {"chapter_number": 7,  "name_bn": "জ্যামিতি",                    "subtitle_bn": "রেখা, কোণ ও ত্রিভুজ"},
                            {"chapter_number": 8,  "name_bn": "ক্ষেত্রফল ও পরিসীমা",         "subtitle_bn": "চতুর্ভুজ ও বৃত্তের ক্ষেত্রফল"},
                            {"chapter_number": 9,  "name_bn": "পরিসংখ্যান",                  "subtitle_bn": "তথ্য সংগ্রহ, উপস্থাপন ও গড়"},
                        ],
                    }
                ],
            },
        ],
    },

    # ── CLASS 8 ───────────────────────────────────────────────────────────────
    {
        "class": {
            "name": "Class 8",
            "display_name_bn": "অষ্টম শ্রেণী",
        },
        "subjects": [
            {
                "name": "Geography",
                "display_name_bn": "ভূগোল",
                "subject_type": "core",
                "books": [
                    {
                        "book_id_code": "AMR_PRITHIBI_8",
                        "title_bn": "আমাদের পৃথিবী",
                        "chapters": [
                            {"chapter_number": 1,  "name_bn": "ভূমিকম্প ও আগ্নেয়গিরি",      "subtitle_bn": "কারণ, প্রভাব ও বিপদ ব্যবস্থাপনা"},
                            {"chapter_number": 2,  "name_bn": "বায়ুপ্রবাহ",                  "subtitle_bn": "স্থানীয় ও সাধারণ বায়ুপ্রবাহ"},
                            {"chapter_number": 3,  "name_bn": "বৃষ্টিপাত",                   "subtitle_bn": "বৃষ্টিপাতের প্রকার ও বণ্টন"},
                            {"chapter_number": 4,  "name_bn": "প্রাকৃতিক বিপদ",              "subtitle_bn": "বন্যা, খরা ও ঘূর্ণিঝড়"},
                            {"chapter_number": 5,  "name_bn": "কৃষি",                        "subtitle_bn": "ভারতের কৃষি ও ফসল বিতরণ"},
                            {"chapter_number": 6,  "name_bn": "শিল্প",                       "subtitle_bn": "ভারতের প্রধান শিল্প ও অবস্থান"},
                            {"chapter_number": 7,  "name_bn": "পরিবহন ও যোগাযোগ",            "subtitle_bn": "স্থল, জল ও আকাশপথ"},
                            {"chapter_number": 8,  "name_bn": "জনসংখ্যা",                    "subtitle_bn": "বৃদ্ধি, বণ্টন ও ঘনত্ব"},
                            {"chapter_number": 9,  "name_bn": "পরিবেশ দূষণ",                 "subtitle_bn": "বায়ু, জল ও মাটি দূষণ"},
                            {"chapter_number": 10, "name_bn": "পশ্চিমবঙ্গের অর্থনীতি",       "subtitle_bn": "কৃষি, শিল্প ও পরিষেবা খাত"},
                        ],
                    }
                ],
            },
            {
                "name": "History",
                "display_name_bn": "ইতিহাস",
                "subject_type": "core",
                "books": [
                    {
                        "book_id_code": "HIS8_ITIHAS",
                        "title_bn": "ইতিহাস",
                        "chapters": [
                            {"chapter_number": 1, "name_bn": "জাতীয়তাবাদের উদ্ভব",          "subtitle_bn": "ভারতে জাতীয় চেতনার বিকাশ"},
                            {"chapter_number": 2, "name_bn": "স্বদেশী আন্দোলন",              "subtitle_bn": "বঙ্গভঙ্গ ও স্বদেশী আন্দোলন"},
                            {"chapter_number": 3, "name_bn": "অসহযোগ আন্দোলন",               "subtitle_bn": "গান্ধীজির নেতৃত্বে অসহযোগ"},
                            {"chapter_number": 4, "name_bn": "আইন অমান্য আন্দোলন",           "subtitle_bn": "ডান্ডি অভিযান ও লবণ সত্যাগ্রহ"},
                            {"chapter_number": 5, "name_bn": "ভারত ছাড়ো আন্দোলন",           "subtitle_bn": "১৯৪২-এর আন্দোলন ও তার ফলাফল"},
                            {"chapter_number": 6, "name_bn": "স্বাধীনতা ও দেশভাগ",           "subtitle_bn": "১৯৪৭ সালের স্বাধীনতা ও দেশভাগ"},
                            {"chapter_number": 7, "name_bn": "সংবিধান রচনা",                 "subtitle_bn": "ভারতীয় সংবিধানের রচনা ও বৈশিষ্ট্য"},
                            {"chapter_number": 8, "name_bn": "স্নায়ুযুদ্ধ",                  "subtitle_bn": "দুই মেরু বিশ্ব ও ভারতের ভূমিকা"},
                        ],
                    }
                ],
            },
            {
                "name": "Science",
                "display_name_bn": "পরিবেশ ও বিজ্ঞান",
                "subject_type": "core",
                "books": [
                    {
                        "book_id_code": "PARIBESH_BIGYAN_8",
                        "title_bn": "পরিবেশ ও বিজ্ঞান",
                        "chapters": [
                            {"chapter_number": 1,  "name_bn": "জীবনের উৎপত্তি ও বিকাশ",     "subtitle_bn": "বিবর্তন ও প্রাকৃতিক নির্বাচন"},
                            {"chapter_number": 2,  "name_bn": "উদ্ভিদের জনন",                "subtitle_bn": "যৌন ও অযৌন জনন"},
                            {"chapter_number": 3,  "name_bn": "মানবদেহ",                     "subtitle_bn": "তন্ত্র ও অঙ্গের কাজ"},
                            {"chapter_number": 4,  "name_bn": "রোগ ও স্বাস্থ্য",              "subtitle_bn": "সংক্রামক ও অসংক্রামক রোগ"},
                            {"chapter_number": 5,  "name_bn": "পদার্থের গঠন",                "subtitle_bn": "পরমাণু, অণু ও মৌল"},
                            {"chapter_number": 6,  "name_bn": "রাসায়নিক বন্ধন",              "subtitle_bn": "আয়নিক ও সমযোজী বন্ধন"},
                            {"chapter_number": 7,  "name_bn": "বিদ্যুৎ",                     "subtitle_bn": "তড়িৎপ্রবাহ, রোধ ও ওহমের সূত্র"},
                            {"chapter_number": 8,  "name_bn": "চুম্বক",                      "subtitle_bn": "চুম্বকের ধর্ম ও ব্যবহার"},
                            {"chapter_number": 9,  "name_bn": "শব্দ",                        "subtitle_bn": "শব্দের বৈশিষ্ট্য ও প্রতিধ্বনি"},
                            {"chapter_number": 10, "name_bn": "পরিবেশ সংরক্ষণ",              "subtitle_bn": "জীববৈচিত্র্য রক্ষা ও টেকসই উন্নয়ন"},
                        ],
                    }
                ],
            },
        ],
    },
]

# =============================================================================
# SEED FUNCTIONS
# =============================================================================

def upsert(table: str, data: dict, conflict_col: str) -> dict:
    """Upsert a single row, return the row (with id)."""
    res = (
        supabase.table(table)
        .upsert(data, on_conflict=conflict_col)
        .execute()
    )
    return res.data[0]


def seed_class(class_data: dict) -> int:
    row = upsert("classes", {
        "name": class_data["name"],
        "display_name_bn": class_data["display_name_bn"],
        "active": True,
    }, "name")
    return row["id"]


def seed_subject(class_id: int, subject_data: dict) -> int:
    row = upsert("subjects", {
        "class_id": class_id,
        "name": subject_data["name"],
        "display_name_bn": subject_data["display_name_bn"],
        "subject_type": subject_data.get("subject_type", "core"),
        "active": True,
    }, "class_id,name")
    return row["id"]


def seed_book(subject_id: int, book_data: dict) -> int:
    chapters = book_data.get("chapters", [])
    row = upsert("books", {
        "subject_id": subject_id,
        "book_id_code": book_data["book_id_code"],
        "title_bn": book_data["title_bn"],
        "total_chapters": len(chapters),
        "active": True,
    }, "book_id_code")
    return row["id"]


def seed_chapter(book_id: int, chapter_data: dict) -> int:
    row = upsert("chapters", {
        "book_id": book_id,
        "chapter_number": chapter_data["chapter_number"],
        "name_bn": chapter_data["name_bn"],
        "subtitle_bn": chapter_data.get("subtitle_bn"),
        "active": True,
    }, "book_id,chapter_number")
    return row["id"]


# =============================================================================
# MAIN
# =============================================================================

def main():
    print("=" * 60)
    print("Bengali AI Learning Platform — Curriculum Seeder")
    print("=" * 60)

    total_classes = total_subjects = total_books = total_chapters = 0

    for entry in CURRICULUM:
        class_data = entry["class"]
        class_id = seed_class(class_data)
        total_classes += 1
        print(f"\n✓ Class: {class_data['name']} (id={class_id})")

        for subject_data in entry["subjects"]:
            subject_id = seed_subject(class_id, subject_data)
            total_subjects += 1
            print(f"  ✓ Subject: {subject_data['name']} (id={subject_id})")

            for book_data in subject_data["books"]:
                book_id = seed_book(subject_id, book_data)
                total_books += 1
                print(f"    ✓ Book: {book_data['book_id_code']} (id={book_id})")

                for chapter_data in book_data["chapters"]:
                    chapter_id = seed_chapter(book_id, chapter_data)
                    total_chapters += 1
                    print(f"      ✓ Ch{chapter_data['chapter_number']:02d}: {chapter_data['name_bn']} (id={chapter_id})")

    print("\n" + "=" * 60)
    print(f"Done. Seeded:")
    print(f"  {total_classes} classes")
    print(f"  {total_subjects} subjects")
    print(f"  {total_books} books")
    print(f"  {total_chapters} chapters")
    print("=" * 60)
    print("\nNext step: python seed_questions.py")


if __name__ == "__main__":
    main()

-- =============================================================================
-- RE-SEED CHAPTERS — Paribesh O Bigyan (Class 7 Science)
-- Deletes all existing chapter rows for this book and inserts the 11 correct
-- chapters sourced directly from the question bank JSON files.
-- Safe: questions table is empty so no FK violations.
-- =============================================================================

BEGIN;

DO $$
DECLARE v_book_id INT;
BEGIN
  SELECT id INTO v_book_id FROM public.books WHERE book_id_code = 'paribesh_o_bigyan';
  IF v_book_id IS NULL THEN
    RAISE EXCEPTION 'Book paribesh_o_bigyan not found';
  END IF;

  -- Wipe all existing chapters for this book (old seed had wrong names)
  DELETE FROM public.chapters WHERE book_id = v_book_id;

  -- Insert 11 chapters from authoritative question bank source
  INSERT INTO public.chapters (book_id, chapter_number, name_bn, subtitle_bn, active) VALUES
    (v_book_id,  1, 'ভৌত পরিবেশ - তাপ',
                    'তাপ, উষ্ণতা, তাপমাত্রার স্কেল ও লীন তাপ', true),
    (v_book_id,  2, 'ভৌত পরিবেশ - আলো',
                    'আলোর প্রতিফলন, প্রতিসরণ ও বর্ণালী', true),
    (v_book_id,  3, 'চুম্বক',
                    'চুম্বকের ধর্ম, চুম্বকক্ষেত্র ও ব্যবহার', true),
    (v_book_id,  4, 'ভৌত পরিবেশ: তড়িৎ',
                    'তড়িৎপ্রবাহ, বর্তনী ও তড়িৎ রাসায়নিক বিক্রিয়া', true),
    (v_book_id,  5, 'ভৌত পরিবেশ — পরিবেশবান্ধব শক্তি',
                    'নবায়নযোগ্য ও অনবায়নযোগ্য শক্তির উৎস', true),
    (v_book_id,  6, 'সময় ও গতি',
                    'গতির পরিমাপ, দূরত্ব, বেগ ও সময়', true),
    (v_book_id,  7, 'পরমাণু, অণু ও রাসায়নিক বিক্রিয়া',
                    'পরমাণু মডেল, মৌল, যৌগ ও বিক্রিয়ার ধরন', true),
    (v_book_id,  8, 'পরিবেশ গঠনে পদার্থের ভূমিকা',
                    'বায়ু, জল, মাটি ও তাদের গুণাবলী', true),
    (v_book_id,  9, 'মানুষের খাদ্য',
                    'খাদ্য উপাদান, পুষ্টি ও পাচনতন্ত্র', true),
    (v_book_id, 10, 'পরিবেশের সজীব উপাদানের গঠনগত বৈচিত্র্য ও কার্যগত প্রক্রিয়া',
                    'কোষ, টিস্যু, অঙ্গ ও তন্ত্র', true),
    (v_book_id, 11, 'পরিবেশের সংকট, উদ্ভিদ ও পরিবেশের সংরক্ষণ',
                    'দূষণ, জলবায়ু পরিবর্তন ও সংরক্ষণের উপায়', true),
    (v_book_id, 12, 'পরিবেশ ও জনস্বাস্থ্য',
                    'জনস্বাস্থ্য, রোগ, দূষণ ও পরিবেশের প্রভাব', true);

  -- Keep total_chapters in sync
  UPDATE public.books SET total_chapters = 12 WHERE id = v_book_id;

  RAISE NOTICE 'Done — 11 chapters inserted for book id=%', v_book_id;
END $$;

-- Verify
SELECT chapter_number, name_bn
FROM public.chapters ch
JOIN public.books b ON b.id = ch.book_id
WHERE b.book_id_code = 'paribesh_o_bigyan'
ORDER BY chapter_number;

COMMIT;

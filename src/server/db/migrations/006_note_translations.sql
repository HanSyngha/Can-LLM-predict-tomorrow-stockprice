-- Add Korean translation column to notes
ALTER TABLE notes ADD COLUMN content_ko TEXT DEFAULT NULL;

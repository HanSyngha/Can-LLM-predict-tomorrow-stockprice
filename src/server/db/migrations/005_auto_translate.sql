-- Add Korean translation columns to predictions
ALTER TABLE predictions ADD COLUMN reasoning_ko TEXT DEFAULT NULL;
ALTER TABLE predictions ADD COLUMN search_reports_ko TEXT DEFAULT NULL;

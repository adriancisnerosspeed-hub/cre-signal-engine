ALTER TABLE deals ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN deals.is_demo IS 'True for auto-created demo deals on org signup';
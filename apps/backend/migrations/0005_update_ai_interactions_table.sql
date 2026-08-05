-- Migration: 0005_update_ai_interactions_table
-- Renames the 'prompt' column to 'messages' to better reflect multi-modal request structures.

ALTER TABLE AiInteractions RENAME COLUMN prompt TO messages;

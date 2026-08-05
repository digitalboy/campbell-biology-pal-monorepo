-- Migration: 0004_add_page_content_table
-- This migration adds the PageContent table to store markdown content from textbook pages.

-- Table to store markdown content extracted from textbook pages.
CREATE TABLE IF NOT EXISTS PageContent (
    id TEXT PRIMARY KEY,                 -- Unique identifier (UUID) for the record
    page_number INTEGER UNIQUE NOT NULL, -- The unique page number, used for upsert logic
    markdown_text TEXT NOT NULL          -- The extracted content in Markdown format
);

-- Creates a unique index on page_number to ensure uniqueness and speed up lookups, crucial for UPSERTs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_content_on_page_number ON PageContent(page_number);

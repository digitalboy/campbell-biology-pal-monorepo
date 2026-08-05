-- Migration: 0001_add_content_and_social_tables
-- This migration adds tables for questions, comments, AI interactions, and role-based access control.

-- Comments Table
CREATE TABLE IF NOT EXISTS Comments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    parent_type TEXT NOT NULL, -- 'page' or 'question'
    parent_id TEXT NOT NULL,   -- Page number or Question ID
    parent_comment_id TEXT,    -- For replies, NULL for top-level comments
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'visible', -- 'visible', 'hidden_by_moderator', 'reported'
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES UserProfiles(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES Comments(id) ON DELETE CASCADE
);

-- AI Interactions Log
CREATE TABLE IF NOT EXISTS AiInteractions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    parent_type TEXT,
    parent_id TEXT,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    model_used TEXT,
    metadata TEXT, -- JSON string for extra data
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --- Role-Based Access Control (RBAC) Tables --- --

CREATE TABLE IF NOT EXISTS Roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL -- e.g., 'admin', 'moderator', 'expert_validator'
);

CREATE TABLE IF NOT EXISTS UserRoles (
    user_id TEXT NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES UserProfiles(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES Roles(id) ON DELETE CASCADE
);

-- --- Indexes for Performance Optimization --- --
CREATE INDEX IF NOT EXISTS idx_comments_on_parent ON Comments(parent_type, parent_id);
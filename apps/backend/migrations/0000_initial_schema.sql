-- Migration: 0000_initial_schema
-- Created at: 2024-08-10

-- User Profiles Table
-- Stores user information synchronized from Firebase.
CREATE TABLE IF NOT EXISTS UserProfiles (
    id TEXT PRIMARY KEY,            -- Firebase User ID
    email TEXT NOT NULL UNIQUE,
    nickname TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Questions Table
-- Stores all quiz questions. Must be created before tables that reference it.
CREATE TABLE IF NOT EXISTS Questions (
    id TEXT PRIMARY KEY,
    page_number INTEGER NOT NULL,
    difficulty TEXT NOT NULL,
    question_text TEXT NOT NULL, -- Stores JSON string for MultilingualText
    options TEXT NOT NULL,       -- Stores JSON string for List[_PureOption]
    correct_answers TEXT NOT NULL, -- Stores JSON string for List[str]
    explanation TEXT NOT NULL,      -- Stores JSON string
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Spaced Repetition Schedule Table
-- Tracks user's progress on questions for spaced repetition.
CREATE TABLE IF NOT EXISTS SpacedRepetitionSchedule (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    review_stage INTEGER NOT NULL DEFAULT 0,
    next_review_at TEXT NOT NULL,
    last_reviewed_at TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'retired'
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES UserProfiles(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES Questions(id) ON DELETE CASCADE,
    UNIQUE(user_id, question_id) -- A user can only have one schedule per question
);

-- User Answers Log Table
-- Records every answer submission for analytics and wrong-answer review.
CREATE TABLE IF NOT EXISTS UserAnswersLog (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    is_correct INTEGER NOT NULL, -- Use INTEGER for boolean (0 for false, 1 for true)
    selected_answers TEXT NOT NULL, -- Stores JSON string for List[str]
    answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES UserProfiles(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES Questions(id) ON DELETE CASCADE
);

-- Triggers to automatically update the `updated_at` timestamp.
CREATE TRIGGER IF NOT EXISTS trigger_userprofiles_updated_at AFTER UPDATE ON UserProfiles FOR EACH ROW BEGIN UPDATE UserProfiles SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id; END;
CREATE TRIGGER IF NOT EXISTS trigger_srs_updated_at AFTER UPDATE ON SpacedRepetitionSchedule FOR EACH ROW BEGIN UPDATE SpacedRepetitionSchedule SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id; END;

-- --- Indexes for tables created in this file --- --
CREATE INDEX IF NOT EXISTS idx_reviews_on_user_and_time ON SpacedRepetitionSchedule(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_answers_on_user ON UserAnswersLog(user_id);
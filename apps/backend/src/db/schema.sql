CREATE TABLE UserProfiles (
    id TEXT PRIMARY KEY, -- Firebase User UID
    email TEXT UNIQUE NOT NULL,
    nickname TEXT NOT NULL,
    avatar_url TEXT,
    last_review_notified_at TIMESTAMP, -- 格式遵循 ISO 8601: 2026-03-13T14:11:00.000Z
    email_notifications_enabled BOOLEAN DEFAULT 1, -- 是否开启邮件提醒
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Questions (
    id TEXT PRIMARY KEY,
    page_number INTEGER NOT NULL,
    difficulty TEXT NOT NULL,
    question_text TEXT NOT NULL, -- Stores JSON string for MultilingualText
    options TEXT NOT NULL,       -- Stores JSON string for List[_PureOption]
    correct_answers TEXT NOT NULL, -- Stores JSON string for List[str]
    explanation TEXT NOT NULL,      -- 将存储 JSON 字符串
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE UserAnswersLog (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    selected_answers TEXT NOT NULL, -- Stores JSON string for List[str]
    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES UserProfiles(id),
    FOREIGN KEY (question_id) REFERENCES Questions(id)
);

CREATE TABLE SpacedRepetitionSchedule (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    review_stage INTEGER NOT NULL DEFAULT 0,
    next_review_at TIMESTAMP NOT NULL,
    last_reviewed_at TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'retired'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES UserProfiles(id),
    FOREIGN KEY (question_id) REFERENCES Questions(id),
    UNIQUE(user_id, question_id) -- Ensures a user has only one review schedule per question
);

CREATE TABLE Comments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    parent_type TEXT NOT NULL, -- 'page' or 'question'
    parent_id TEXT NOT NULL,   -- Page number or Question ID
    parent_comment_id TEXT,    -- For replies, NULL for top-level comments
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'visible', -- 'visible', 'hidden_by_moderator', 'reported'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES UserProfiles(id),
    FOREIGN KEY (parent_comment_id) REFERENCES Comments(id)
);

CREATE TABLE AiInteractions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    parent_type TEXT,
    parent_id TEXT,
    messages TEXT NOT NULL, -- Stores JSON string of the request messages array
    response TEXT NOT NULL,
    model_used TEXT,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to store markdown content extracted from textbook pages.
CREATE TABLE PageContent (
    id TEXT PRIMARY KEY,                 -- Unique identifier (UUID) for the record
    page_number INTEGER UNIQUE NOT NULL, -- The unique page number, used for upsert logic
    markdown_text TEXT NOT NULL          -- The extracted content in Markdown format
);

-- --- Role-Based Access Control (RBAC) Tables --- --

-- Defines all available roles in the system.
CREATE TABLE Roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL -- e.g., 'admin', 'moderator', 'expert_validator'
);

-- Assigns roles to users. A user can have multiple roles.
CREATE TABLE UserRoles (
    user_id TEXT NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES UserProfiles(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES Roles(id) ON DELETE CASCADE
);

-- --- Indexes for Performance Optimization --- --

-- Index for quickly finding all due reviews for a specific user.
CREATE INDEX idx_reviews_on_user_and_time ON SpacedRepetitionSchedule(user_id, next_review_at);

-- Index for quickly finding all comments for a specific parent (e.g., a page or question).
CREATE INDEX idx_comments_on_parent ON Comments(parent_type, parent_id);

-- Index for quickly finding all answers by a specific user.
CREATE INDEX idx_answers_on_user ON UserAnswersLog(user_id);

-- Creates a unique index on page_number to ensure uniqueness and speed up lookups.
CREATE UNIQUE INDEX idx_page_content_on_page_number ON PageContent(page_number);

-- --- Knowledge Graph Tables & Indexes (D1 Relational Graph Storage) --- --

-- 备注 (经验教训): 
-- 所有涉及时间戳的 API 响应和数据库交互必须采用严格 ISO 8601 格式 (如: 2026-03-13T14:11:00.000Z)。

CREATE TABLE IF NOT EXISTS GraphNodes (
    uuid TEXT PRIMARY KEY,
    node_name_zh TEXT NOT NULL,          -- 中文名称
    node_name_en TEXT,                   -- 英文名称
    definition_zh TEXT,                  -- 中文定义描述
    definition_en TEXT,                  -- 英文定义描述
    multilingual_names TEXT,             -- JSON 对象: {"es": "...", "fr": "...", "ja": "...", "de": "..."}
    multilingual_definitions TEXT,       -- JSON 对象: {"es": "...", "fr": "...", "ja": "...", "de": "..."}
    aliases TEXT,                        -- JSON 字符串数组
    grade TEXT,                          -- '初中二年级下册', '高中必修一', '竞赛' 等
    publisher TEXT DEFAULT '人民教育出版社',
    subject TEXT DEFAULT '生物',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS GraphEdges (
    id TEXT PRIMARY KEY,                 -- 边主键 (UUID 或 hash)
    start_uuid TEXT NOT NULL,
    end_uuid TEXT NOT NULL,
    edge_type TEXT NOT NULL,             -- 关系标识符 (如 'Function', 'Composition', 'Regulation')
    edge_label_zh TEXT,                  -- 中文关系标签
    edge_label_en TEXT,                  -- 英文关系标签
    description_zh TEXT,                 -- 中文关系详细说明
    description_en TEXT,                 -- 英文关系详细说明
    multilingual_descriptions TEXT,      -- JSON 对象: {"es": "...", "fr": "...", "ja": "...", "de": "..."}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (start_uuid) REFERENCES GraphNodes(uuid) ON DELETE CASCADE,
    FOREIGN KEY (end_uuid) REFERENCES GraphNodes(uuid) ON DELETE CASCADE
);

-- 高效图拓扑查询索引
CREATE INDEX IF NOT EXISTS idx_graph_nodes_name_zh ON GraphNodes(node_name_zh);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_grade ON GraphNodes(grade);
CREATE INDEX IF NOT EXISTS idx_graph_edges_start ON GraphEdges(start_uuid);
CREATE INDEX IF NOT EXISTS idx_graph_edges_end ON GraphEdges(end_uuid);
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON GraphEdges(edge_type);
CREATE INDEX IF NOT EXISTS idx_graph_edges_composite ON GraphEdges(start_uuid, edge_type);


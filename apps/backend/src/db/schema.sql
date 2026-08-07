-- ====================================================================
-- Cloudflare D1 数据库全量结构基线声明 (schema.sql)
-- 包含全量生产环境数据表、外键约束、触发器与高性能复合索引
-- ====================================================================

CREATE TABLE IF NOT EXISTS UserProfiles (
    id TEXT PRIMARY KEY, -- Firebase User UID
    email TEXT UNIQUE NOT NULL,
    nickname TEXT NOT NULL,
    avatar_url TEXT,
    last_review_notified_at TIMESTAMP,
    email_notifications_enabled BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Questions (
    id TEXT PRIMARY KEY,
    page_number INTEGER NOT NULL,
    difficulty TEXT NOT NULL,
    question_text TEXT NOT NULL,
    options TEXT NOT NULL,
    correct_answers TEXT NOT NULL,
    explanation TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS UserAnswersLog (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    is_correct INTEGER NOT NULL,
    selected_answers TEXT NOT NULL,
    answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES UserProfiles(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES Questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS SpacedRepetitionSchedule (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    review_stage INTEGER NOT NULL DEFAULT 0,
    next_review_at TIMESTAMP NOT NULL,
    last_reviewed_at TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES UserProfiles(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES Questions(id) ON DELETE CASCADE,
    UNIQUE(user_id, question_id)
);

CREATE TABLE IF NOT EXISTS Comments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    parent_type TEXT NOT NULL,
    parent_id TEXT NOT NULL,
    parent_comment_id TEXT,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'visible',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES UserProfiles(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES Comments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS AiInteractions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    parent_type TEXT,
    parent_id TEXT,
    messages TEXT NOT NULL,
    response TEXT NOT NULL,
    model_used TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS UserRoles (
    user_id TEXT NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES UserProfiles(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES Roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS PageContent (
    id TEXT PRIMARY KEY,
    page_number INTEGER UNIQUE NOT NULL,
    markdown_text TEXT NOT NULL
);

-- ====================================================================
-- 关系知识图谱物理表 (Cloudflare D1 实体与翻译分离无冗余多语言架构)
-- ====================================================================

CREATE TABLE IF NOT EXISTS GraphNodes (
    uuid TEXT PRIMARY KEY,
    canonical_name_en TEXT NOT NULL,
    canonical_def_en TEXT,
    grade TEXT,
    publisher TEXT DEFAULT '人民教育出版社',
    subject TEXT DEFAULT '生物',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS GraphNodeTranslations (
    node_uuid TEXT NOT NULL,
    lang_code TEXT NOT NULL,
    name TEXT NOT NULL,
    definition TEXT,
    aliases TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (node_uuid, lang_code),
    FOREIGN KEY (node_uuid) REFERENCES GraphNodes(uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS GraphEdges (
    id TEXT PRIMARY KEY,
    start_uuid TEXT NOT NULL,
    end_uuid TEXT NOT NULL,
    edge_type TEXT NOT NULL,
    canonical_label_en TEXT,
    canonical_description_en TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (start_uuid) REFERENCES GraphNodes(uuid) ON DELETE CASCADE,
    FOREIGN KEY (end_uuid) REFERENCES GraphNodes(uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS GraphEdgeTranslations (
    edge_id TEXT NOT NULL,
    lang_code TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (edge_id, lang_code),
    FOREIGN KEY (edge_id) REFERENCES GraphEdges(id) ON DELETE CASCADE
);

-- ====================================================================
-- 索引与触发器定义 (Indexes & Triggers)
-- ====================================================================

CREATE INDEX IF NOT EXISTS idx_reviews_on_user_and_time ON SpacedRepetitionSchedule(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_answers_on_user ON UserAnswersLog(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_on_parent ON Comments(parent_type, parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_content_on_page_number ON PageContent(page_number);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_grade ON GraphNodes(grade);
CREATE INDEX IF NOT EXISTS idx_graph_edges_start ON GraphEdges(start_uuid);
CREATE INDEX IF NOT EXISTS idx_graph_edges_end ON GraphEdges(end_uuid);
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON GraphEdges(edge_type);
CREATE INDEX IF NOT EXISTS idx_graph_edges_composite ON GraphEdges(start_uuid, edge_type);

CREATE INDEX IF NOT EXISTS idx_node_translations_search ON GraphNodeTranslations(lang_code, name);
CREATE INDEX IF NOT EXISTS idx_node_translations_node ON GraphNodeTranslations(node_uuid);
CREATE INDEX IF NOT EXISTS idx_edge_translations_lang ON GraphEdgeTranslations(edge_id, lang_code);
CREATE INDEX IF NOT EXISTS idx_edge_translations_search ON GraphEdgeTranslations(lang_code, label);

-- 备注 (经验教训与规范): 触发器中必须使用 strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now') 保证 updated_at 自动更新时 100% 为严格 ISO 8601 格式，防止原生 CURRENT_TIMESTAMP 的空格破坏格式归一化
CREATE TRIGGER IF NOT EXISTS trigger_userprofiles_updated_at 
AFTER UPDATE ON UserProfiles FOR EACH ROW 
BEGIN 
    UPDATE UserProfiles SET updated_at = strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now') WHERE id = OLD.id; 
END;

CREATE TRIGGER IF NOT EXISTS trigger_srs_updated_at 
AFTER UPDATE ON SpacedRepetitionSchedule FOR EACH ROW 
BEGIN 
    UPDATE SpacedRepetitionSchedule SET updated_at = strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now') WHERE id = OLD.id; 
END;

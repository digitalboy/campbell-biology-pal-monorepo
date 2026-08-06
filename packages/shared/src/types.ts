/**
 * 共享数据传输对象 (DTO) 定义与类型规范
 * 
 * 备注 (经验教训): 
 * 所有涉及时间戳的 API 响应和数据库交互必须采用严格 ISO 8601 格式 (如: 2026-03-13T14:11:00.000Z)。
 */

export interface UserProfileDTO {
  id: string; // Firebase User UID
  email: string;
  nickname: string;
  avatarUrl?: string | null;
  createdAt: string; // ISO 8601 格式
  updatedAt: string; // ISO 8601 格式
}

export interface QuestionDTO {
  id: string;
  pageNumber: number;
  difficulty: 'easy' | 'medium' | 'hard';
  questionText: Record<string, string> | string;
  options: string[];
  correctAnswers: string[];
  explanation: string;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface DashboardStatsDTO {
  totalAnswered: number;
  correctRate: number;
  dueReviewsCount: number;
  streakDays: number;
}

/**
 * 知识图谱节点 DTO 规范 (支持全语言自由扩展)
 */
export interface GraphNodeDTO {
  id: string; // 节点 UUID (如 "c5d6e7f8-cdef-4123-8567-891234567890")
  raw_id?: string;
  type: 'KnowledgePoint' | 'Topic' | 'Page' | 'Person' | 'Event';
  name?: string; // 当前请求语言下的名称
  definition?: string; // 当前请求语言下的定义描述
  name_zh?: string;
  name_en?: string;
  name_es?: string;
  name_fr?: string;
  name_ja?: string;
  name_de?: string;
  definition_zh?: string;
  definition_en?: string;
  definition_es?: string;
  definition_fr?: string;
  definition_ja?: string;
  definition_de?: string;
  aliases?: string[];
  grade?: string;
  publisher?: string;
  subject?: string;
  createdAt?: string; // ISO 8601 格式
  updatedAt?: string; // ISO 8601 格式
}

/**
 * 知识图谱关系边 DTO 规范 (支持全语言自由扩展)
 */
export interface GraphEdgeDTO {
  id?: string;
  source: string; // 起始节点 UUID
  target: string; // 终止节点 UUID
  type: string;   // 关系类型标识 (如 "Function", "Composition")
  label?: string; // 当前请求语言下的关系标签
  description?: string; // 当前请求语言下的关系描述
  label_zh?: string;
  label_en?: string;
  label_es?: string;
  label_fr?: string;
  label_ja?: string;
  label_de?: string;
  description_zh?: string;
  description_en?: string;
  description_es?: string;
  description_fr?: string;
  description_ja?: string;
  description_de?: string;
  createdAt?: string; // ISO 8601 格式
}

/**
 * 知识图谱数据包 DTO 规范
 */
export interface GraphDataDTO {
  nodes: GraphNodeDTO[];
  relationships: GraphEdgeDTO[];
}

import { KnowledgeGraphData } from "./graph.models";
/**
 * Represents text content that can be available in multiple languages.
 */
export interface MultilingualText {
  en: string;
  zh: string;
  es?: string;
  fr?: string;
  de?: string;
  ja?: string;
}

/**
 * Represents a single choice in a multiple-choice question.
 */
export interface QuizOption {
  id: string; // e.g., "A", "B", "C"
  text: MultilingualText;
  /**
   * Feedback for why an option is incorrect.
   * Can be null or undefined, especially for the correct answer.
   */
  feedback?: MultilingualText | null;
}

/**
 * Represents the difficulty level of a question.
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Represents user-specific statistics for a question.
 */
export interface QuestionUserStats {
  totalAttempts: number;
  correctAttempts: number;
}

/**
 * Represents the public-facing statistics of a user for a specific question.
 */
export interface QuestionSocialStats {
  userId: string;
  nickname: string;
  avatarUrl: string;
  totalAttempts: number;
  correctAttempts: number;
}

/**
 * Represents a single question, mirroring the structure of the `Questions` table.
 */
export interface Question {
  id: string;
  page_number: number;
  difficulty: Difficulty;
  choice_type: 'single_choice' | 'multiple_choice';
  question_text: MultilingualText;
  options: QuizOption[];
  correct_answers: string[]; // Array of correct option IDs, e.g., ["A"]
  explanation: MultilingualText;
  created_at: string;
  updated_at: string;
  userStats?: QuestionUserStats; // User-specific stats, optional.
  answeredByUsers: QuestionSocialStats[]; // Social feature: stats of users who answered this.
}

/**
 * Represents a question that is due for review, extending the base Question interface.
 */
export interface DueQuestion extends Question {
  last_reviewed_at: string | null;
  review_stage: number;
}

/**
 * Represents the complete companion data payload for a given page.
 */
export interface CompanionData {
  pageNumber: number;
  knowledge_graph: KnowledgeGraphData;
  questions: Question[];
}

/**
 * The payload for submitting an answer to a question.
 */
export interface QuizSubmissionPayload {
  selectedAnswers: string[]; // Array of option IDs, e.g., ["A"]
}

/**
 * The response format after submitting an answer.
 */
export interface QuizSubmissionResult {
  isCorrect: boolean;
  correctAnswers: string[];
  explanation: MultilingualText;
}

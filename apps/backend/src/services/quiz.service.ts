import { Env } from '../index';
import { QuizSubmissionResult, MultilingualText } from '../models/quiz.models';
import { updateRepetitionSchedule } from './repetition.service';

/**
 * Processes a user's answer submission for a specific question.
 * @param env The Cloudflare environment bindings.
 * @param userId The ID of the user submitting the answer.
 * @param questionId The ID of the question being answered.
 * @param selectedAnswers An array of the user's selected option IDs.
 * @returns A promise that resolves to the submission result.
 */
export const processAnswerSubmission = async (
  env: Env,
  userId: string,
  questionId: string,
  selectedAnswers: string[]
): Promise<QuizSubmissionResult | null> => {

  // 1. Fetch the correct answers and explanation for the question.
  const questionStmt = env.DB.prepare(
    'SELECT correct_answers, explanation FROM Questions WHERE id = ?'
  );
  const question = await questionStmt.bind(questionId).first<{ correct_answers: string; explanation: string }>();

  if (!question) {
    return null; // Question not found
  }

  const correctAnswers: string[] = JSON.parse(question.correct_answers);
  const explanation: MultilingualText = JSON.parse(question.explanation);

  // 2. Determine if the answer is correct.
  // Using Sets for comparison is more robust as it handles potential duplicates
  // in the input and is generally order-independent.
  const correctAnswersSet = new Set(correctAnswers);
  const selectedAnswersSet = new Set(selectedAnswers);
  const isCorrect = correctAnswersSet.size === selectedAnswersSet.size &&
    [...correctAnswersSet].every(answer => selectedAnswersSet.has(answer));

  // 3. Log the answer attempt to UserAnswersLog.
  const logStmt = env.DB.prepare(
    'INSERT INTO UserAnswersLog (id, user_id, question_id, is_correct, selected_answers) VALUES (?, ?, ?, ?, ?)'
  );
  await logStmt.bind(crypto.randomUUID(), userId, questionId, isCorrect ? 1 : 0, JSON.stringify(selectedAnswers)).run();

  // 4. Update the spaced repetition schedule.
  await updateRepetitionSchedule(env, userId, questionId, isCorrect);

  // 5. Return the result.
  return {
    isCorrect,
    correctAnswers,
    explanation,
  };
};

/**
 * 根据 ID 查询单道题目的完整详情
 */
export const getQuestionById = async (env: Env, questionId: string): Promise<any | null> => {
  const stmt = env.DB.prepare('SELECT * FROM Questions WHERE id = ?');
  const q = await stmt.bind(questionId).first<any>();
  if (!q) return null;

  const correctAnswers = JSON.parse(q.correct_answers);
  return {
    ...q,
    choice_type: correctAnswers.length > 1 ? 'multiple_choice' : 'single_choice',
    question_text: JSON.parse(q.question_text),
    options: JSON.parse(q.options),
    correct_answers: correctAnswers,
    explanation: JSON.parse(q.explanation),
  };
};

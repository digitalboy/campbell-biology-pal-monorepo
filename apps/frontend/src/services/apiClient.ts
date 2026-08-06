/**
 * @file apiClient.ts
 * @description 前端 RESTful API 客户端服务。
 * 
 * 备注 (经验教训):
 * 1. 适配 `getUserProfile` 的数据解包规范 `res.data.data || res.data`，彻底解决登录同步时 user 对象为 undefined 的 BUG。
 * 2. 导出 `getGraphDictionary` 供全量知识词树索引使用。
 */

import axios, { type AxiosInstance } from 'axios';
import { getAuth } from 'firebase/auth';
import type {
  User,
  UserUpdatePayload,
  DashboardStats,
  CompanionData,
  QuestionSubmissionPayload,
  QuestionSubmissionResult,
  PaginatedCommentsResponse,
  CreateCommentPayload,
  Comment,
  SearchResults,
  CreateAiInteractionPayload,
  AiInteraction,
  GraphData,
  LeaderboardUser,
  DueReviewsResponse,
} from '@/types/api';

class ApiClient {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || 'https://api.biopal-campbell.beikee.org/api/v1',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const auth = getAuth();
        const user = auth.currentUser;
        if (user) {
          try {
            const token = await user.getIdToken();
            config.headers.Authorization = `Bearer ${token}`;
          } catch (error) {
            console.error('Error getting Firebase ID token:', error);
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  public syncUser = (user: { id: string; email: string | null; nickname: string | null; avatar_url: string | null }): Promise<User> =>
    this.axiosInstance.post('/users/sync', user).then(res => res.data.data || res.data);

  public getUserProfile = (): Promise<User> =>
    this.axiosInstance.get('/users/me').then(res => res.data.data || res.data);

  public updateUserProfile = (profileData: UserUpdatePayload): Promise<User> =>
    this.axiosInstance.put('/users/me', profileData).then(res => res.data.data || res.data);

  public getDashboardStats = (): Promise<DashboardStats> =>
    this.axiosInstance.get('/users/me/dashboard-stats').then(res => res.data.data || res.data);

  public getPageCompanionData = (pageNumber: number): Promise<CompanionData> =>
    this.axiosInstance.get(`/pages/${pageNumber}/companion-data`).then(res => res.data.data || res.data);

  public getPdfContent = (pageNumber: number): Promise<any> =>
    this.axiosInstance.get(`/pdf-content/${pageNumber}`).then(res => res.data.data || res.data);

  public upsertPdfContent = (payload: { page_number: number; markdown_content: string }): Promise<{ ok: boolean; data: any }> =>
    this.axiosInstance.put('/pdf-content', payload).then(res => res.data);

  public submitQuizAnswer = (questionId: string, payload: QuestionSubmissionPayload): Promise<QuestionSubmissionResult> =>
    this.axiosInstance.post(`/questions/${questionId}/submit`, payload).then(res => res.data.data || res.data);

  public getDueReviews = (): Promise<DueReviewsResponse> =>
    this.axiosInstance.get('/users/me/reviews/due').then(res => res.data.data || res.data);

  public getWrongAnswers = (params?: { startDate?: string; endDate?: string }): Promise<any> =>
    this.axiosInstance.get('/users/me/wrong-answers', { params }).then(res => res.data);

  public getRelatedNodes = (uuid: string): Promise<GraphData> =>
    this.axiosInstance.get(`/graph/nodes/${uuid}/related`).then(res => res.data.data || res.data);

  public getGraphDictionary = (): Promise<{ ok: boolean; dictionary: any[] }> =>
    this.axiosInstance.get('/graph/dictionary').then(res => res.data);

  public deleteNode = (uuid: string): Promise<{ ok: boolean; message: string }> =>
    this.axiosInstance.delete(`/graph/nodes/${uuid}`).then(res => res.data);

  public getComments = (params: {
    userId?: string;
    parentType?: 'page' | 'question';
    parentId?: string;
    limit?: number;
    cursor?: string | null;
    myComments?: boolean;
  }): Promise<PaginatedCommentsResponse> =>
    this.axiosInstance.get('/comments', { params }).then(res => res.data.data || res.data);

  public postComment = (payload: CreateCommentPayload): Promise<{ ok: boolean; message: string; comment: Comment }> =>
    this.axiosInstance.post('/comments', payload).then(res => res.data);

  public getCommentById = (commentId: string): Promise<{ ok: boolean; comment: Comment }> =>
    this.axiosInstance.get(`/comments/${commentId}`).then(res => res.data);

  public deleteComment = (commentId: string): Promise<{ ok: boolean; message: string }> =>
    this.axiosInstance.delete(`/comments/${commentId}`).then(res => res.data);

  public getLeaderboard = (params?: any): Promise<{ ok: boolean; data: LeaderboardUser[] }> =>
    this.axiosInstance.get('/leaderboard', { params }).then(res => res.data);

  public saveAiInteraction = (payload: CreateAiInteractionPayload): Promise<{ ok: boolean; data: AiInteraction }> =>
    this.axiosInstance.post('/ai/interactions', payload).then(res => res.data);

  public getRecentAiInteractions = (params?: { limit?: number; parentType?: 'node' | 'question' | 'pdf' | null; parentId?: string | null }): Promise<{ ok: boolean; data: AiInteraction[] }> =>
    this.axiosInstance.get('/ai/interactions', { params }).then(res => res.data);

  public deleteAiInteraction = (id: string): Promise<{ ok: boolean; message: string }> =>
    this.axiosInstance.delete(`/ai/interactions/${id}`).then(res => res.data);

  public search = (query: string): Promise<SearchResults> =>
    this.axiosInstance.get('/search', { params: { q: query } }).then(res => res.data);
}

export const api = new ApiClient();
/**
 * @file graphService.ts
 * @description Service for interacting with the knowledge graph API endpoints.
 */
import { api } from './apiClient';
import type { GraphData } from '@/types/api';

/**
 * Service for fetching knowledge graph data.
 */
export const graphService = {
  /**
   * Retrieves a subgraph of nodes and relationships related to a central node.
   * @param uuid The UUID of the central node.
   * @returns A promise that resolves to the graph data (nodes and relationships).
   * @throws Error if the request fails.
   */
  async getRelatedNodes(uuid: string): Promise<GraphData> {
    try {
      // The API now directly returns the GraphData object.
      const graphData = await api.getRelatedNodes(uuid);
      return graphData;
    } catch (error) {
      console.error(`Error fetching related nodes for UUID ${uuid}:`, error);
      throw error;
    }
  },
};

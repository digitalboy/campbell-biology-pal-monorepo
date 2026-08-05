import { Context } from 'hono';
import { HonoContextVariables } from '../router';
import { Env } from '../index';
import { getRelatedNodesFromD1, deleteGraphNodeFromD1 } from '../services/graph.service';
import { GraphDataDTO } from '@campbell/shared';

/**
 * Handles the request to get nodes related to a specific node UUID from Cloudflare D1.
 * @param c Hono context
 * @returns JSON response with the knowledge graph data or an error.
 */
export const getRelatedNodesHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  const { uuid } = c.req.param();

  if (!uuid) {
    return c.json({ ok: false, message: 'Node UUID is required.' }, 400);
  }

  try {
    const graphData: GraphDataDTO | null = await getRelatedNodesFromD1(c.env, uuid);

    if (!graphData) {
      return c.json({ ok: false, message: 'No data found for the given UUID.' }, 404);
    }

    return c.json(graphData);

  } catch (error: any) {
    console.error(`[Graph Handler] Failed to get related nodes for ${uuid}:`, error);
    return c.json(
      {
        ok: false,
        message: 'An unexpected error occurred while fetching related graph data from D1.',
        error: error.message,
      },
      500
    );
  }
};

/**
 * 获取全量知识图谱词典 (用于前端全图文本概念自动高亮与词树索引)
 * @param c Hono context
 */
export const getGraphDictionaryHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT uuid, node_name_zh, node_name_en, multilingual_names, aliases FROM GraphNodes;`
    ).all<any>();

    const dictionary = (results || []).map((n: any) => {
      let aliases: string[] = [];
      if (n.aliases) {
        try { aliases = JSON.parse(n.aliases); } catch (e) {}
      }
      let multiNames: Record<string, string> = {};
      if (n.multilingual_names) {
        try { multiNames = JSON.parse(n.multilingual_names); } catch (e) {}
      }
      return {
        uuid: n.uuid,
        name_zh: n.node_name_zh,
        name_en: n.node_name_en,
        name_es: multiNames.es,
        name_fr: multiNames.fr,
        name_de: multiNames.de,
        name_ja: multiNames.ja,
        aliases,
      };
    });

    return c.json({ ok: true, dictionary });
  } catch (error: any) {
    console.error('[Graph Handler] Failed to fetch graph dictionary:', error);
    return c.json(
      {
        ok: false,
        message: 'An unexpected error occurred while fetching graph dictionary.',
        error: error.message,
      },
      500
    );
  }
};

/**
 * Handles the request to delete a node and its relationships by UUID from D1.
 * @param c Hono context
 */
export const deleteNodeHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  const { uuid } = c.req.param();

  if (!uuid) {
    return c.json({ ok: false, message: 'Node UUID is required.' }, 400);
  }

  try {
    const wasDeleted = await deleteGraphNodeFromD1(c.env, uuid);

    if (wasDeleted) {
      return c.json({ ok: true, message: `Node ${uuid} and its relationships were successfully deleted from D1.` });
    } else {
      return c.json({ ok: false, message: `Node ${uuid} not found.` }, 404);
    }

  } catch (error: any) {
    console.error(`[Graph Handler] Failed to delete node ${uuid}:`, error);
    return c.json(
      {
        ok: false,
        message: 'An unexpected error occurred while deleting the node from D1.',
        error: error.message,
      },
      500
    );
  }
};

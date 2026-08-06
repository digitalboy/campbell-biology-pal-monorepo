import { Context } from 'hono';
import { HonoContextVariables } from '../router';
import { Env } from '../index';
import { getRelatedNodesFromD1, deleteGraphNodeFromD1 } from '../services/graph.service';
import { GraphDataDTO } from '@campbell/shared';

/**
 * Handles the request to get nodes related to a specific node UUID from Cloudflare D1.
 * Supports multilingual query via ?lang=ja parameter.
 * 
 * @param c Hono context
 * @returns JSON response with the knowledge graph data or an error.
 */
export const getRelatedNodesHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  const { uuid } = c.req.param();
  const lang = c.req.query('lang') || 'zh';

  if (!uuid) {
    return c.json({ ok: false, message: 'Node UUID is required.' }, 400);
  }

  try {
    const graphData: GraphDataDTO | null = await getRelatedNodesFromD1(c.env, uuid, lang);

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
 * 支持多语言词条汇聚
 * @param c Hono context
 */
export const getGraphDictionaryHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT n.uuid, n.canonical_name_en, t.lang_code, t.name, t.aliases
       FROM GraphNodes n
       LEFT JOIN GraphNodeTranslations t ON n.uuid = t.node_uuid;`
    ).all<any>();

    const dictionaryMap = new Map<string, any>();

    (results || []).forEach((row: any) => {
      if (!dictionaryMap.has(row.uuid)) {
        dictionaryMap.set(row.uuid, {
          uuid: row.uuid,
          name_en: row.canonical_name_en,
          aliases: [],
        });
      }
      const item = dictionaryMap.get(row.uuid)!;

      if (row.lang_code) {
        item[`name_${row.lang_code}`] = row.name;
        if (row.aliases) {
          try {
            const parsedAliases = JSON.parse(row.aliases);
            item.aliases = Array.from(new Set([...item.aliases, ...parsedAliases]));
          } catch (e) {}
        }
      }
    });

    const dictionary = Array.from(dictionaryMap.values());

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

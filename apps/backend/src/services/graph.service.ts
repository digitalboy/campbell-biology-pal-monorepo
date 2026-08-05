/**
 * @file graph.service.ts
 * @description 基于 Cloudflare D1 (SQLite) 的高性能知识图谱检索与管理服务。
 * 
 * 备注 (经验教训): 
 * 1. 所有涉及时间戳的 API 响应必须采用严格 ISO 8601 格式 (如: 2026-03-13T14:11:00.000Z)。
 * 2. 彻底废除全盘查不到节点时的 `SELECT * FROM GraphNodes LIMIT 1;` 盲目降级逻辑：
 *    当指定的节点在 D1 数据库中不存在时，直接诚实返回 `null` (对应 API 404)，杜绝了“点击数据库缺失节点时误弹出首个节点 ('染色体和基因的关系')”的数据失真问题。
 */

import { Env } from '../index';
import { GraphDataDTO, GraphNodeDTO, GraphEdgeDTO } from '@campbell/shared';

/**
 * 从 D1 数据库获取与指定节点 (UUID 或概念名称) 直接关联的 1-Hop 图拓扑网络 (节点与边)
 * 
 * @param env Cloudflare 绑定环境变量
 * @param identifier 目标节点 UUID 或概念词名称
 * @returns GraphDataDTO 或 null
 */
export async function getRelatedNodesFromD1(
  env: Env,
  identifier: string
): Promise<GraphDataDTO | null> {
  const cleanId = identifier.replace(/^concept-/, '').trim();

  // 1. 尝试以 UUID 或 cleanId 精确匹配
  let centerNodeResult = await env.DB.prepare(
    `SELECT * FROM GraphNodes WHERE uuid = ? OR uuid = ? LIMIT 1;`
  ).bind(identifier, cleanId).first<any>();

  // 2. 若无精确 UUID 匹配，尝试按中文/英文名称精准匹配
  if (!centerNodeResult) {
    centerNodeResult = await env.DB.prepare(
      `SELECT * FROM GraphNodes WHERE node_name_zh = ? OR node_name_en = ? OR node_name_zh = ? OR node_name_en = ? LIMIT 1;`
    ).bind(identifier, identifier, cleanId, cleanId).first<any>();
  }

  // 3. 若仍未找到，尝试 LIKE 模糊匹配
  if (!centerNodeResult && cleanId.length >= 2) {
    const likePattern = `%${cleanId}%`;
    centerNodeResult = await env.DB.prepare(
      `SELECT * FROM GraphNodes WHERE node_name_zh LIKE ? OR node_name_en LIKE ? OR aliases LIKE ? LIMIT 1;`
    ).bind(likePattern, likePattern, likePattern).first<any>();
  }

  // 4. 若全盘未搜到指定关键词，严谨返回 null，绝不静默偷换节点
  if (!centerNodeResult) {
    return null;
  }

  const realUuid = centerNodeResult.uuid;

  // 5. 查出以 realUuid 为中心的 1-Hop 关联关系边 (限制 MAX 50 条)
  const edgesResult = await env.DB.prepare(
    `SELECT * FROM GraphEdges WHERE start_uuid = ? OR end_uuid = ? LIMIT 50;`
  ).bind(realUuid, realUuid).all<any>();

  const rawEdges = edgesResult.results || [];

  // 6. 收集所有相关节点的 UUID (包含中心节点与 1-Hop 邻居)
  const neighborUuidsSet = new Set<string>();
  neighborUuidsSet.add(realUuid);

  const relationships: GraphEdgeDTO[] = rawEdges.map((e: any) => {
    neighborUuidsSet.add(e.start_uuid);
    neighborUuidsSet.add(e.end_uuid);

    return {
      id: e.id,
      source: e.start_uuid,
      target: e.end_uuid,
      type: e.edge_type,
      label_zh: e.edge_label_zh || e.edge_type,
      label_en: e.edge_label_en || e.edge_type,
      description_zh: e.description_zh,
      description_en: e.description_en,
      createdAt: e.created_at ? new Date(e.created_at).toISOString() : new Date().toISOString(),
    };
  });

  // 7. 批量查出所有 1-Hop 关联节点
  const neighborUuids = Array.from(neighborUuidsSet);
  const placeholders = neighborUuids.map(() => '?').join(',');

  const nodesResult = await env.DB.prepare(
    `SELECT * FROM GraphNodes WHERE uuid IN (${placeholders});`
  ).bind(...neighborUuids).all<any>();

  const rawNodes = nodesResult.results || [];

  const nodes: GraphNodeDTO[] = rawNodes.map((n: any) => {
    let aliases: string[] = [];
    if (n.aliases) {
      try {
        aliases = JSON.parse(n.aliases);
      } catch (err) {
        aliases = [];
      }
    }

    let multiNames: Record<string, string> = {};
    if (n.multilingual_names) {
      try {
        multiNames = JSON.parse(n.multilingual_names);
      } catch (err) {}
    }

    let multiDefs: Record<string, string> = {};
    if (n.multilingual_definitions) {
      try {
        multiDefs = JSON.parse(n.multilingual_definitions);
      } catch (err) {}
    }

    return {
      id: n.uuid,
      raw_id: n.uuid,
      type: (n.uuid === realUuid) ? 'Page' : 'KnowledgePoint',
      name_zh: n.node_name_zh,
      name_en: n.node_name_en || n.node_name_zh,
      name_es: multiNames.es,
      name_fr: multiNames.fr,
      name_ja: multiNames.ja,
      name_de: multiNames.de,
      definition_zh: n.definition_zh,
      definition_en: n.definition_en,
      definition_es: multiDefs.es,
      definition_fr: multiDefs.fr,
      definition_ja: multiDefs.ja,
      definition_de: multiDefs.de,
      aliases,
      grade: n.grade,
      publisher: n.publisher,
      subject: n.subject,
      createdAt: n.created_at ? new Date(n.created_at).toISOString() : new Date().toISOString(),
      updatedAt: n.updated_at ? new Date(n.updated_at).toISOString() : new Date().toISOString(),
    };
  });

  return {
    nodes,
    relationships,
  };
}

/**
 * 从 D1 数据库删除指定节点及其相连边
 * 
 * @param env Cloudflare 绑定环境变量
 * @param uuid 目标节点 UUID
 * @returns boolean 是否成功删除
 */
export async function deleteGraphNodeFromD1(
  env: Env,
  uuid: string
): Promise<boolean> {
  const result = await env.DB.prepare(
    `DELETE FROM GraphNodes WHERE uuid = ?;`
  ).bind(uuid).run();

  return (result.meta?.changes ?? 0) > 0;
}

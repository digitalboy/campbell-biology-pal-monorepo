/**
 * @file graph.service.ts
 * @description 基于 Cloudflare D1 (SQLite) 实体与翻译分离架构的高性能知识图谱检索与管理服务。
 * 
 * 备注 (经验教训): 
 * 1. 所有涉及时间戳的 API 响应必须采用严格 ISO 8601 格式 (如: 2026-03-13T14:11:00.000Z)。
 * 2. 彻底废除全盘查不到节点时的盲目降级逻辑：
 *    当指定的节点在 D1 数据库中不存在时，直接诚实返回 `null` (对应 API 404)。
 */

import { Env } from '../index';
import { GraphDataDTO, GraphNodeDTO, GraphEdgeDTO } from '@campbell/shared';

/**
 * 从 D1 数据库获取与指定节点 (UUID 或概念名称) 直接关联的 1-Hop 图拓扑网络 (节点与边)
 * 
 * @param env Cloudflare 绑定环境变量
 * @param identifier 目标节点 UUID 或概念词名称
 * @param langCode 请求目标语言 (默认 'zh', 支持 'en', 'es', 'fr', 'ja', 'de' 等)
 * @returns GraphDataDTO 或 null
 */
export async function getRelatedNodesFromD1(
  env: Env,
  identifier: string,
  langCode: string = 'zh'
): Promise<GraphDataDTO | null> {
  const cleanId = identifier.replace(/^concept-/, '').trim();
  const normalizedLang = (langCode || 'zh').toLowerCase();

  // 1. 寻找中心节点 (通过 UUID、翻译表名称或英文基准名称)
  let centerNodeResult = await env.DB.prepare(
    `SELECT n.uuid, n.canonical_name_en, n.canonical_def_en, n.grade, n.publisher, n.subject, n.created_at, n.updated_at
     FROM GraphNodes n
     LEFT JOIN GraphNodeTranslations t ON n.uuid = t.node_uuid AND t.lang_code = ?
     WHERE n.uuid = ? OR n.uuid = ? OR t.name = ? OR n.canonical_name_en = ?
     LIMIT 1;`
  ).bind(normalizedLang, identifier, cleanId, identifier, identifier).first<any>();

  // 2. 若未精确匹配，尝试 LIKE 模糊匹配 (匹配对应语言翻译或英文基准名)
  if (!centerNodeResult && cleanId.length >= 2) {
    const likePattern = `%${cleanId}%`;
    centerNodeResult = await env.DB.prepare(
      `SELECT n.uuid, n.canonical_name_en, n.canonical_def_en, n.grade, n.publisher, n.subject, n.created_at, n.updated_at
       FROM GraphNodes n
       LEFT JOIN GraphNodeTranslations t ON n.uuid = t.node_uuid AND t.lang_code = ?
       WHERE t.name LIKE ? OR n.canonical_name_en LIKE ? OR t.aliases LIKE ?
       LIMIT 1;`
    ).bind(normalizedLang, likePattern, likePattern, likePattern).first<any>();
  }

  // 3. 若全盘未搜到指定关键词，检查是否为 Page 虚拟节点 (格式如 page_208)
  let realUuid = centerNodeResult?.uuid;

  if (!centerNodeResult) {
    if (/^page_\d+$/i.test(identifier) || /^page_\d+$/i.test(cleanId)) {
      realUuid = cleanId;
    } else {
      return null;
    }
  }

  // 4. 查出以 realUuid 为中心的 1-Hop 关联关系边 (限制 MAX 50 条)
  const edgesResult = await env.DB.prepare(
    `SELECT e.id, e.start_uuid, e.end_uuid, e.edge_type, e.canonical_label_en, e.canonical_description_en, e.created_at,
            t.label AS translated_label, t.description AS translated_description
     FROM GraphEdges e
     LEFT JOIN GraphEdgeTranslations t ON e.id = t.edge_id AND t.lang_code = ?
     WHERE e.start_uuid = ? OR e.end_uuid = ?
     LIMIT 50;`
  ).bind(normalizedLang, realUuid, realUuid).all<any>();

  const rawEdges = edgesResult.results || [];

  // 5. 收集所有相关节点的 UUID (包含中心节点与 1-Hop 邻居)
  const neighborUuidsSet = new Set<string>();
  if (realUuid) {
    neighborUuidsSet.add(realUuid);
  }

  const relationships: GraphEdgeDTO[] = rawEdges.map((e: any) => {
    neighborUuidsSet.add(e.start_uuid);
    neighborUuidsSet.add(e.end_uuid);

    const resolvedLabel = e.translated_label || e.canonical_label_en || e.edge_type;
    const resolvedDesc = e.translated_description || e.canonical_description_en || '';

    return {
      id: e.id,
      source: e.start_uuid,
      target: e.end_uuid,
      type: e.edge_type,
      label: resolvedLabel,
      description: resolvedDesc,
      label_en: e.canonical_label_en || e.edge_type,
      description_en: e.canonical_description_en || '',
      createdAt: e.created_at ? new Date(e.created_at).toISOString() : new Date().toISOString(),
    };
  });

  const allUuids = Array.from(neighborUuidsSet);
  
  // 区分普通概念 UUID 与虚拟 Page ID
  const conceptUuids = allUuids.filter(id => !/^page_\d+$/i.test(id));
  const pageUuids = allUuids.filter(id => /^page_\d+$/i.test(id));

  let rawNodes: any[] = [];
  let rawTranslations: any[] = [];

  if (conceptUuids.length > 0) {
    const placeholders = conceptUuids.map(() => '?').join(',');

    // 查询概念节点基本属性
    const nodesResult = await env.DB.prepare(
      `SELECT * FROM GraphNodes WHERE uuid IN (${placeholders});`
    ).bind(...conceptUuids).all<any>();

    // 批量查出所有相关语言的翻译
    const translationsResult = await env.DB.prepare(
      `SELECT * FROM GraphNodeTranslations WHERE node_uuid IN (${placeholders});`
    ).bind(...conceptUuids).all<any>();

    rawNodes = nodesResult.results || [];
    rawTranslations = translationsResult.results || [];
  }

  // 按 node_uuid -> lang_code 分组索引翻译
  const translationsMap = new Map<string, Map<string, any>>();
  for (const trans of rawTranslations) {
    if (!translationsMap.has(trans.node_uuid)) {
      translationsMap.set(trans.node_uuid, new Map());
    }
    translationsMap.get(trans.node_uuid)!.set(trans.lang_code, trans);
  }

  const nodes: GraphNodeDTO[] = [];

  // 格式化概念节点
  for (const n of rawNodes) {
    const nodeTransMap = translationsMap.get(n.uuid) || new Map();
    const currentLangTrans = nodeTransMap.get(normalizedLang);
    const zhTrans = nodeTransMap.get('zh');
    const enTrans = nodeTransMap.get('en');
    const esTrans = nodeTransMap.get('es');
    const frTrans = nodeTransMap.get('fr');
    const jaTrans = nodeTransMap.get('ja');
    const deTrans = nodeTransMap.get('de');

    const resolvedName = currentLangTrans?.name || zhTrans?.name || n.canonical_name_en;
    const resolvedDef = currentLangTrans?.definition || zhTrans?.definition || n.canonical_def_en;

    let aliases: string[] = [];
    if (currentLangTrans?.aliases) {
      try { aliases = JSON.parse(currentLangTrans.aliases); } catch (e) {}
    } else if (zhTrans?.aliases) {
      try { aliases = JSON.parse(zhTrans.aliases); } catch (e) {}
    }

    nodes.push({
      id: n.uuid,
      raw_id: n.uuid,
      type: 'KnowledgePoint',
      name: resolvedName,
      definition: resolvedDef,
      name_zh: zhTrans?.name || n.canonical_name_en,
      name_en: enTrans?.name || n.canonical_name_en,
      name_es: esTrans?.name,
      name_fr: frTrans?.name,
      name_ja: jaTrans?.name,
      name_de: deTrans?.name,
      definition_zh: zhTrans?.definition || n.canonical_def_en,
      definition_en: enTrans?.definition || n.canonical_def_en,
      definition_es: esTrans?.definition,
      definition_fr: frTrans?.definition,
      definition_ja: jaTrans?.definition,
      definition_de: deTrans?.definition,
      aliases,
      grade: n.grade,
      publisher: n.publisher,
      subject: n.subject,
      createdAt: n.created_at ? new Date(n.created_at).toISOString() : new Date().toISOString(),
      updatedAt: n.updated_at ? new Date(n.updated_at).toISOString() : new Date().toISOString(),
    });
  }

  // 格式化 Page 物理页虚拟节点
  for (const pageId of pageUuids) {
    const pageNumMatch = pageId.match(/\d+/);
    const pageNum = pageNumMatch ? parseInt(pageNumMatch[0], 10) : 0;

    nodes.push({
      id: pageId,
      raw_id: pageId,
      type: 'Page',
      name: pageId,
      definition: `Book Page ${pageNum}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return {
    nodes,
    relationships,
  };
}

/**
 * 从 D1 数据库获取指定物理页码 (pageNumber) 的伴学图谱数据
 * 替换已废弃的 Neo4j 数据服务
 * 
 * @param env Cloudflare 绑定环境变量
 * @param pageNumber 教科书页码
 * @param langCode 请求目标语言 (默认 'zh')
 * @returns GraphDataDTO 或 null
 */
export async function getGraphDataForPageFromD1(
  env: Env,
  pageNumber: number,
  langCode: string = 'zh'
): Promise<GraphDataDTO | null> {
  const pageId = `page_${pageNumber}`;
  return getRelatedNodesFromD1(env, pageId, langCode);
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

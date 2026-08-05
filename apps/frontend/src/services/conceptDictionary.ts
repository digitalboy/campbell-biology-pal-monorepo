/**
 * @file conceptDictionary.ts
 * @description 知识图谱概念词典服务与多语言匹配索引库。
 * 
 * 备注与经验教训 (重要):
 * 1. 【全量 D1 图谱节点动态装载 (Single Source of Truth)】通过 `initDictionary()` 在应用启动时调取 `/api/v1/graph/dictionary`，
 *    将 D1 数据库中全量真实节点的所有 6 种语言名称 (zh, en, es, fr, de, ja) 及别名装载进词树匹配 map。
 * 2. 【废除硬编码伪词库】不再使用手写硬编码词库，确保前端呈现下划线高亮的概念 100% 在数据库中有据可查，
 *    杜绝了“数据库无此节点但前端虚假高亮，导致点击后错展示首个节点”的问题。
 */

import { api } from './apiClient';
import type { ConceptNode } from '@/types/api';

export interface ConceptMatchItem {
  uuid: string;
  name: string;
  lang: string;
}

class ConceptDictionaryService {
  private conceptMap = new Map<string, string>(); // name/alias (lowercase) -> uuid/name
  private isLoaded = false;

  constructor() {
    this.initDictionary();
  }

  /**
   * 从后端 D1 全量装载 3,212 个知识图谱节点的 6 语种名称与别名
   */
  public async initDictionary(): Promise<void> {
    if (this.isLoaded) return;
    try {
      const res = await api.getGraphDictionary();
      if (res && res.ok && Array.isArray(res.dictionary)) {
        this.registerNodes(res.dictionary);
        this.isLoaded = true;
      }
    } catch (err) {
      console.warn('Failed to load global graph dictionary from backend D1:', err);
    }
  }

  public registerNodes(nodes: any[]): void {
    if (!Array.isArray(nodes)) return;

    nodes.forEach(node => {
      if (!node) return;
      const uuid = node.raw_id || node.id || node.uuid || node.name_zh || node.name_en;
      if (!uuid) return;

      const names: string[] = [];
      if (node.name_zh) names.push(node.name_zh);
      if (node.name_en) names.push(node.name_en);
      if (node.name_es) names.push(node.name_es);
      if (node.name_fr) names.push(node.name_fr);
      if (node.name_de) names.push(node.name_de);
      if (node.name_ja) names.push(node.name_ja);
      if (node.label) names.push(node.label);
      if (node.name) names.push(node.name);

      if (node.multilingual_names && typeof node.multilingual_names === 'object') {
        Object.values(node.multilingual_names).forEach(val => {
          if (typeof val === 'string') names.push(val);
        });
      }

      if (Array.isArray(node.aliases)) {
        node.aliases.forEach((alias: any) => {
          if (typeof alias === 'string') names.push(alias);
        });
      }

      names.forEach(name => {
        const trimmed = name.trim().toLowerCase();
        if (trimmed.length >= 2) {
          this.conceptMap.set(trimmed, uuid);
        }
      });
    });
  }

  public findConceptsInText(text: string, currentLang: string = 'zh'): Array<{ name: string; uuid: string; index: number }> {
    if (!text) return [];

    const matches: Array<{ name: string; uuid: string; index: number }> = [];
    const lowerText = text.toLowerCase();

    this.conceptMap.forEach((uuid, keyword) => {
      if (keyword.length < 2) return;
      
      let searchPos = 0;
      while ((searchPos = lowerText.indexOf(keyword, searchPos)) !== -1) {
        const originalName = text.slice(searchPos, searchPos + keyword.length);
        matches.push({
          name: originalName,
          uuid,
          index: searchPos
        });
        searchPos += keyword.length;
      }
    });

    // 最长词匹配优先策略
    matches.sort((a, b) => a.index - b.index || b.name.length - a.name.length);

    const filtered: Array<{ name: string; uuid: string; index: number }> = [];
    let lastEnd = 0;

    for (const match of matches) {
      if (match.index >= lastEnd) {
        filtered.push(match);
        lastEnd = match.index + match.name.length;
      }
    }

    return filtered;
  }
}

export const conceptDictionary = new ConceptDictionaryService();

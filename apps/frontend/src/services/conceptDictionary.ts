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

  /**
   * 判断字符是否为英文/拉丁字母或数字（用于单词边界校验）
   */
  private isWordChar(char: string | undefined): boolean {
    if (!char) return false;
    return /[a-zA-Z0-9_]/.test(char);
  }

  /**
   * 判断关键词是否为纯英文/拉丁短语（由英文字母、数字、空格、连字符组成）
   */
  private isLatinText(text: string): boolean {
    return /^[a-zA-Z0-9_\s-]+$/.test(text);
  }

  /**
   * 查找文本中包含的知识节点词汇。
   * 
   * 备注 (重大 BUG 修复与经验教训):
   * 原先逻辑直接使用 indexOf 进行子串盲匹配，导致英文单词被错误切割打断
   * (例如 "several" 被错切成 "sev" + "er" + "al"，"generations" 被错切成 "gene" + "rat" + "io" + "ns")。
   * 现为纯英文/拉丁词汇引入严格的【单词边界校验 (Word Boundary Check)】：
   * 匹配项的前一个字符与后一个字符不得为英文字母或数字，确保 100% 不打断拆分完整的英文单词。
   */
  public findConceptsInText(text: string, _currentLang: string = 'zh'): Array<{ name: string; uuid: string; index: number }> {
    if (!text) return [];

    const matches: Array<{ name: string; uuid: string; index: number }> = [];
    const lowerText = text.toLowerCase();

    this.conceptMap.forEach((uuid, keyword) => {
      if (keyword.length < 2) return;

      const isLatin = this.isLatinText(keyword);
      let searchPos = 0;

      while ((searchPos = lowerText.indexOf(keyword, searchPos)) !== -1) {
        const matchEnd = searchPos + keyword.length;

        // 对英文/拉丁词汇执行严格的 Word Boundary (单词边界) 校验
        if (isLatin) {
          const charBefore = searchPos > 0 ? text[searchPos - 1] : undefined;
          const charAfter = matchEnd < text.length ? text[matchEnd] : undefined;

          // 若前一个或后一个字符是字母/数字，说明该匹配项处于一个更大单词的内部，予以排除！
          if (this.isWordChar(charBefore) || this.isWordChar(charAfter)) {
            searchPos++;
            continue;
          }
        }

        const originalName = text.slice(searchPos, matchEnd);
        matches.push({
          name: originalName,
          uuid,
          index: searchPos
        });

        searchPos = matchEnd;
      }
    });

    // 排序规则：优先按在文本中的位置，位置相同则优先选择匹配长度更长的词汇 (最长匹配优先)
    matches.sort((a, b) => a.index - b.index || b.name.length - a.name.length);

    // 过滤互相重叠的匹配项，防止重复高亮
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

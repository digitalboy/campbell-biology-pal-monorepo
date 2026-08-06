# 关系知识图谱数据模型与集成指南 (Cloudflare D1 架构)

## 1. 概述

本文档旨在为开发人员与项目系统提供清晰、统一的关系知识图谱数据模型定义和集成指导。本知识图谱的核心目标是将《坎贝尔生物学》的非结构化文本内容，转化为结构化、可高效在线查询的关系网络。

当前系统已全面升级为基于 **Cloudflare D1 (SQLite)** 边缘关系型数据库的轻量高并发存储架构。

数据生成的生命周期如下：
1. **内容提取**: 使用 Gemini AI 模型分析《坎贝尔生物学》的 PDF 页面。
2. **结构化输出**: AI 根据 Prompt 指令将知识提取为规范的 JSON 格式。
3. **数据注入与存储**: 数据处理工作流计算确定性 UUID 主键后，直接将节点与边批量写入 Cloudflare D1 数据库中的 `GraphNodes` 与 `GraphEdges` 表中。
4. **在线 API 检索**: 后端 API 从 D1 数据库中进行高性能 1-Hop 拓扑索引查询，提供响应极快的图谱可视化与数据伴学支持。

---

## 2. ID 生成机制

为了确保图谱中节点在跨系统（AI 提取、D1 存储、前端 UI 交互）之间具有确定性与唯一性，系统采用了基于内容的 UUID5 算法。

- **`raw_id`**: 规范化的字符串标识符（如 `"cellular_respiration"` 或 `"atp"`），通常为概念的英文小写形式（去除首尾空格）。
- **`uuid`**: 节点在 D1 数据库中的**主键**（UUID 格式）。它由 `raw_id` 通过 `uuid.uuid5` 算法和一个固定项目的命名空间（`PROJECT_NAMESPACE`）计算生成。

**生成逻辑示例**:
```python
import uuid

PROJECT_NAMESPACE = uuid.UUID("a8b9c0d1-e2f3-4a5b-8c9d-0e1f2a3b4c5d")

def generate_deterministic_uuid(raw_id: str) -> str:
    return str(uuid.uuid5(PROJECT_NAMESPACE, raw_id.strip().lower()))

# generate_deterministic_uuid("atp") -> "d095215d-4848-5a19-bbd6-9e21631b5253"
```
外部系统与客户端必须使用相同的 `PROJECT_NAMESPACE` 和 `raw_id` 规范，以生成一致的 UUID。

---

## 3. 节点模型 (GraphNodes Table)

在 D1 数据库中，所有节点统一存储在 `GraphNodes` 表中。节点类型包括：
- `KnowledgePoint` (知识点): 从教材提取的具体概念、术语、结构或过程。
- `Topic` (主题): 权威教学大纲中的高级别知识分类。
- `Page` (页面): 概念所在的物理页码节点，用于知识溯源。
- `Person` / `Event` (人物/事件): 生物学史上的科学家与重大发现事件。

### 3.1 D1 `GraphNodes` 表结构规范

| 数据库字段 (`GraphNodes`) | DTO 字段 (`GraphNodeDTO`) | 类型 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| `uuid` | `id` / `raw_id` | String | **主键**。确定性 UUID 格式。 | `"d095215d-4848-5a19-bbd6-9e21631b5253"` |
| `node_name_zh` | `name_zh` | String | 中文名称（必填）。 | `"三磷酸腺苷"` |
| `node_name_en` | `name_en` | String | 英文名称。 | `"Adenosine Triphosphate"` |
| `definition_zh` | `definition_zh` | String | 中文定义/描述。 | `"细胞内主要的能量货币..."` |
| `definition_en` | `definition_en` | String | 英文定义/描述。 | `"The main energy currency of the cell..."` |
| `multilingual_names` | `name_es/fr/ja/de` | JSON Text | 多语言名称字典对象。 | `{"es": "Atp", "ja": "アデノシン三リン酸"}` |
| `multilingual_definitions`| `definition_es/fr/ja/de` | JSON Text | 多语言定义字典对象。 | `{"es": "...", "ja": "..."}` |
| `aliases` | `aliases` | JSON Text | 别名列表 JSON 字符串数组。 | `["ATP", "腺苷三磷酸"]` |
| `grade` | `grade` | String | 适用学段。 | `"高中必修一"` |
| `publisher` | `publisher` | String | 出版社信息。 | `"人民教育出版社"` |
| `subject` | `subject` | String | 学科类型。 | `"生物"` |
| `created_at` | `createdAt` | TIMESTAMP | 创建时间（ISO 8601 规范）。 | `"2026-03-13T14:11:00.000Z"` |
| `updated_at` | `updatedAt` | TIMESTAMP | 更新时间（ISO 8601 规范）。 | `"2026-03-13T14:11:00.000Z"` |

---

## 4. 关系模型 (GraphEdges Table)

所有关联边在 D1 数据库中统一存储在 `GraphEdges` 表中。

### 4.1 合法关系类型 (`AllowedRelationshipType`)

| 关系类型标识 | 起始节点类型 $\rightarrow$ 目标节点类型 | 语义描述 |
| :--- | :--- | :--- |
| `IS_SUBTOPIC_OF` | `KnowledgePoint` $\rightarrow$ `Topic` | 知识点隶属于某大纲主题 |
| `MENTIONED_ON_PAGE` | `KnowledgePoint` / `Topic` $\rightarrow$ `Page` | 知识点/主题在某教科书页面被提及 |
| `IS_A` | `KnowledgePoint` $\rightarrow$ `KnowledgePoint` | 概念继承/分类关系 (如 "线粒体" *IS_A* "细胞器") |
| `IS_PART_OF` | `KnowledgePoint` $\rightarrow$ `KnowledgePoint` | 结构组成关系 (如 "电子传递链" *IS_PART_OF* "线粒体") |
| `IS_STEP_IN` | `KnowledgePoint` $\rightarrow$ `KnowledgePoint` | 过程步骤关系 (如 "糖酵解" *IS_STEP_IN* "细胞呼吸") |
| `CONTRASTS_WITH` | `KnowledgePoint` $\rightarrow$ `KnowledgePoint` | 概念对比关系 (如 "有丝分裂" *CONTRASTS_WITH* "减数分裂") |
| `CONSUMES` | `KnowledgePoint` $\rightarrow$ `KnowledgePoint` | 过程/反应消耗物质 (如 "细胞呼吸" *CONSUMES* "葡萄糖") |
| `PRODUCES` | `KnowledgePoint` $\rightarrow$ `KnowledgePoint` | 过程/反应生成物质 (如 "光合作用" *PRODUCES* "氧气") |
| `REGULATES` | `KnowledgePoint` $\rightarrow$ `KnowledgePoint` | 分子/过程调控关系 (如 "胰岛素" *REGULATES* "血糖浓度") |
| `LOCATION_OF` | `KnowledgePoint` $\rightarrow$ `KnowledgePoint` | 反应/过程发生场所 (如 "细胞质基质" *LOCATION_OF* "糖酵解") |
| `CONTRIBUTED_TO` | `Person` $\rightarrow$ `KnowledgePoint` / `Topic` | 科学家/人物对概念或领域的贡献 |
| `PARTICIPATED_IN` | `Person` $\rightarrow$ `Event` | 人物参与历史发现事件 |
| `LED_TO` | `Event` $\rightarrow$ `KnowledgePoint` | 历史事件促成概念发现 |

### 4.2 D1 `GraphEdges` 表结构规范

| 数据库字段 (`GraphEdges`) | DTO 字段 (`GraphEdgeDTO`) | 类型 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | String | **主键**。关系的 UUID 或 Hash。 | `"edge_uuid_12345"` |
| `start_uuid` | `source` | String | 起始节点 UUID (外键引用 `GraphNodes.uuid`)。 | `"d095215d-..."` |
| `end_uuid` | `target` | String | 终止节点 UUID (外键引用 `GraphNodes.uuid`)。 | `"e5f6g7h8-..."` |
| `edge_type` | `type` | String | 关系类型标识符。 | `"PRODUCES"` |
| `edge_label_zh` | `label_zh` | String | 中文关系标签。 | `"产生"` |
| `edge_label_en` | `label_en` | String | 英文关系标签。 | `"produces"` |
| `description_zh` | `description_zh` | String | 中文关系详细说明。 | `"光合作用光反应阶段产生氧气"` |
| `description_en` | `description_en` | String | 英文关系详细说明。 | `"Produces O2 during light reactions"` |
| `multilingual_descriptions`| - | JSON Text | 多语言关系说明对象。 | `{"es": "...", "ja": "..."}` |
| `created_at` | `createdAt` | TIMESTAMP | 记录创建时间 (ISO 8601)。 | `"2026-03-13T14:11:00.000Z"` |

---

## 5. D1 SQL 查询使用指南

### A. 检索指定节点的 1-Hop 关联拓扑 (节点与边)
```sql
-- 1. 查找中心节点
SELECT * FROM GraphNodes WHERE uuid = 'd095215d-4848-5a19-bbd6-9e21631b5253';

-- 2. 查找关联边 (限制最多 50 条)
SELECT * FROM GraphEdges 
WHERE start_uuid = 'd095215d-4848-5a19-bbd6-9e21631b5253' 
   OR end_uuid = 'd095215d-4848-5a19-bbd6-9e21631b5253'
LIMIT 50;

-- 3. 根据收集到的邻居 UUID 列表批量查询邻居节点
SELECT * FROM GraphNodes WHERE uuid IN ('d095215d-...', 'e5f6g7h8-...');
```

### B. 按学段或学科筛选知识点
```sql
SELECT uuid, node_name_zh, node_name_en, grade 
FROM GraphNodes 
WHERE grade = '高中必修一' AND subject = '生物';
```

### C. 查找特定生物过程的生成物 (PRODUCES) 与消耗物 (CONSUMES)
```sql
SELECT 
    e.edge_type, 
    n.node_name_zh AS related_concept, 
    e.description_zh
FROM GraphEdges e
JOIN GraphNodes n ON e.end_uuid = n.uuid
WHERE e.start_uuid = 'd095215d-4848-5a19-bbd6-9e21631b5253' 
  AND e.edge_type IN ('PRODUCES', 'CONSUMES');
```

---

## 6. 在线 API 交互与严谨逻辑规范

1. **多级匹配与 404 严谨处理**：
   后端查询服务（`graph.service.ts`）按优先级执行：`UUID 精确匹配` $\rightarrow$ `中英文名称精确匹配` $\rightarrow$ `LIKE 模糊匹配`。若完全无法找到相关节点，**必须诚实返回 `null` (对应 API 404)**，严禁静默偷换为默认节点。
2. **时间戳格式归一化**：
   所有数据库时间戳字段在前后端 API 交互中**必须统一采用 ISO 8601 格式**（例如 `2026-03-13T14:11:00.000Z`）。

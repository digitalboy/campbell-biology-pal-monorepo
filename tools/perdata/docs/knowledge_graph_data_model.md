# 知识图谱数据模型与集成指南

## 1. 概述

本文档旨在为需要与本生物学知识图谱进行交互的开发者和项目提供清晰、统一的数据模型定义和集成指导。本知识图谱的核心目标是将《坎贝尔生物学》的非结构化文本内容，转化为一个结构化的、可查询的图形数据库。

数据生成的生命周期如下：
1.  **内容提取**: 使用 Gemini AI 模型分析《坎贝尔生物学》的 PDF 页面。
2.  **结构化输出**: AI 根据预设的 Prompt (`src/prompts/generate_graph.md`)，将知识提取为严格的 JSON 格式，该格式由 Pydantic 模型 (`src/models/graph_models.py`) 定义。
3.  **数据注入**: Python 工作流 (`src/workflows/build_knowledge_graph.py`) 解析 JSON 数据，并通过一个健壮的客户端 (`src/clients/neo4j_client.py`) 将其注入到 Neo4j 图形数据库中。该客户端专为云环境优化，内置了连接保持活跃（Keep-Alive）和针对瞬时网络错误的自动重试机制，以确保数据注入过程的稳定性。在此过程中，会创建额外的节点（如 `Page`）和关系（如 `MENTIONED_ON_PAGE`）。

## 2. ID 生成机制

为了确保图谱中节点的唯一性和确定性，我们采用了一种基于内容的确定性 UUID 生成方案。这对于跨系统数据集成至关重要。

-   **`raw_id`**: 这是一个可读的、规范化的字符串标识符（例如 `"cell_biology"` 或 `"atp"`）。它通常是概念的英文小写形式，并去除首尾空格。在 AI 生成的 JSON 中，此字段通常被命名为 `id`、`source_id` 或 `target_id`。
-   **`id` (UUID)**: 这是节点在数据库中存储的**主键**。它是由 `raw_id` 通过 `uuid.uuid5` 算法和一个固定的项目命名空间（`PROJECT_NAMESPACE`）生成的。

**核心逻辑**:
```python
# src/models/graph_models.py
PROJECT_NAMESPACE = uuid.UUID("a8b9c0d1-e2f3-4a5b-8c9d-0e1f2a3b4c5d")

def generate_deterministic_uuid(name: str) -> UUID:
    # name 参数即为 raw_id
    return uuid.uuid5(PROJECT_NAMESPACE, name)

# 示例
# generate_deterministic_uuid("biology") -> UUID('...')
```
任何需要与图谱数据进行链接的外部系统，都**必须**使用相同的 `PROJECT_NAMESPACE` 和 `raw_id` 来生成完全一致的 UUID。

---

## 3. 节点模型 (Node Models)

图谱包含三种核心节点类型。

### 3.1. `Topic` (主题)

`Topic` 节点代表 IBO（国际文凭组织）教学大纲中的高级别、权威的知识领域分类。

-   **来源**: `Topic` 节点**不能**由 AI 随意创建。它们必须来自一个预定义的、权威的列表 (`src/data/ibo_syllabus.json`)。
-   **用途**: 作为知识的顶层分类，用于组织和导航 `KnowledgePoint` 节点。
-   **Neo4j 标签**: `Topic`

**属性 (Properties)**:

| 字段名 (Flattened) | 类型   | 描述                                                               | 示例                               |
| :----------------- | :----- | :----------------------------------------------------------------- | :--------------------------------- |
| `id`               | String | **主键**。由 `raw_id` 生成的确定性 UUID。                          | `"a1b2c3d4-..."`                   |
| `raw_id`           | String | 来源于 `ibo_syllabus.json` 的 `id` 字段。                          | `"field_genetics_evolution"`       |
| `name_en`          | String | 英文名称。                                                         | `"Genetics and Evolution"`         |
| `name_zh`          | String | 中文名称。                                                         | `"遗传学与进化生物学"`             |
| `description_en`   | String | 英文描述。                                                         | `"The study of heredity..."`       |
| `description_zh`   | String | 中文描述。                                                         | `"研究遗传、基因变异..."`          |
| `type`             | String | 用于区分 IBO 数据类型，如 `field` 或 `category`。                  | `"field"`                          |
| *(...其他语言)*    | String | 支持 `es`, `fr`, `de`, `ja` 等多语言扩展。                         |                                    |

### 3.2. `KnowledgePoint` (知识点)

`KnowledgePoint` 是图谱中最细粒度的知识单元。它代表了从教科书中提取的具体生物学概念、术语、结构或过程。

-   **来源**: 由 AI 模型从 PDF 文本中识别和提取。
-   **用途**: 构建生物学概念之间的具体关系网络。
-   **Neo4j 标签**: `KnowledgePoint`

**属性 (Properties)**:

| 字段名 (Flattened) | 类型   | 描述                                      | 示例                     |
| :----------------- | :----- | :---------------------------------------- | :----------------------- |
| `id`               | String | **主键**。由 `raw_id` 生成的确定性 UUID。 | `"e5f6g7h8-..."`         |
| `raw_id`           | String | AI 提取并规范化的概念 ID。                | `"atp"`                  |
| `name_en`          | String | 英文名称。                                | `"Adenosine Triphosphate"` |
| `name_zh`          | String | 中文名称。                                | `"三磷酸腺苷"`           |
| `definition_en`    | String | 英文定义。                                | `"The main energy..."`   |
| `definition_zh`    | String | 中文定义。                                | `"细胞主要的能量货币..."`  |
| *(...其他语言)*    | String | 支持 `es`, `fr`, `de`, `ja` 等多语言扩展。|                          |

### 3.3. `Page` (页面)

`Page` 节点是在数据注入阶段创建的，用于将知识点和主题与其在《坎贝尔生物学》中的来源页面进行关联。

-   **来源**: 由 `build_knowledge_graph.py` 工作流根据正在处理的 PDF 页码创建。
-   **用途**: 提供知识的溯源依据。
-   **Neo4j 标签**: `Page`

**属性 (Properties)**:

| 字段名 | 类型    | 描述                  | 示例 |
| :----- | :------ | :-------------------- | :--- |
| `number` | Integer | PDF 文档中的物理页码。 | `85` |

---

## 4. 关系模型 (Relationship Models)

关系（或称“边”）连接了图谱中的节点，描述了它们之间的交互和联系。

### 4.1. 关系类型 (`AllowedRelationshipType`)

以下是当前系统中定义的所有合法关系类型：

| 类型               | 源节点类型         | 目标节点类型                 | 描述                                                               |
| :----------------- | :----------------- | :--------------------------- | :----------------------------------------------------------------- |
| **`IS_SUBTOPIC_OF`** | `KnowledgePoint`   | `Topic`                      | **核心分类关系**。表示一个具体知识点隶属于某个 IBO 主题。          |
| **`MENTIONED_ON_PAGE`** | `KnowledgePoint`, `Topic` | `Page`                       | **溯源关系**。表示一个节点在教科书的某一页被提及。                 |
| `IS_A`             | `KnowledgePoint`   | `KnowledgePoint`             | 表示“是一种”的分类关系 (e.g., "线粒体" IS_A "细胞器")。            |
| `IS_PART_OF`       | `KnowledgePoint`   | `KnowledgePoint`             | 表示“是...的一部分”的组成关系 (e.g., "电子传递链" IS_PART_OF "线粒体")。 |
| `IS_STEP_IN`       | `KnowledgePoint`   | `KnowledgePoint`             | 表示一个过程是另一个更大过程中的一个步骤。                         |
| `CONTRASTS_WITH`   | `KnowledgePoint`   | `KnowledgePoint`             | 表示两个概念形成对比 (e.g., "有丝分裂" CONTRASTS_WITH "减数分裂")。 |
| `CONSUMES`         | `KnowledgePoint`   | `KnowledgePoint`             | 表示一个过程消耗某种物质 (e.g., "细胞呼吸" CONSUMES "葡萄糖")。    |
| `PRODUCES`         | `KnowledgePoint`   | `KnowledgePoint`             | 表示一个过程产生某种物质 (e.g., "光合作用" PRODUCES "氧气")。      |
| `REGULATES`        | `KnowledgePoint`   | `KnowledgePoint`             | 表示一个实体（如激素、酶）调节另一个实体或过程。                   |
| `LOCATION_OF`      | `KnowledgePoint`   | `KnowledgePoint`             | 表示某事件或过程发生的地点 (e.g., "细胞质" LOCATION_OF "糖酵解")。 |
| `CONTRIBUTED_TO`   | `KnowledgePoint` (Person) | `KnowledgePoint`, `Topic` | 表示某个人物对某个知识点或主题做出了贡献。                       |
| `PARTICIPATED_IN`  | `KnowledgePoint` (Person) | `KnowledgePoint` (Event) | 表示某个人物参与了某个历史事件。                                   |
| `LED_TO`           | `KnowledgePoint` (Event) | `KnowledgePoint`             | 表示某个事件导致了某个知识点的发现或发展。                       |

### 4.2. 关系属性

关系本身也可以拥有属性，以提供更丰富的上下文。

-   **来源**: Pydantic 模型 `RelationshipProperties`。
-   **用途**: 描述关系的细节。

**属性 (Properties)**:

| 字段名        | 类型    | 描述                                     | 示例                               |
| :------------ | :------ | :--------------------------------------- | :--------------------------------- |
| `step_number` | Integer | 在一个多步骤过程中，当前关系的顺序编号。 | `(Step A) -[:IS_STEP_IN {step_number: 1}]-> (Process)` |

---

## 5. 如何使用数据 (更多 Cypher 查询示例)

**A. 查找某一页面的所有直接关联节点 (一度节点):**
```cypher
// 查找第 85 页提及的所有 Topic 和 KnowledgePoint
MATCH (n)-[:MENTIONED_ON_PAGE]->(p:Page {number: 85})
RETURN n.name_en AS NodeName, labels(n) AS NodeType
```

**B. 查找某一 IBO 主题下的所有知识点：**
```cypher
MATCH (kp:KnowledgePoint)-[:IS_SUBTOPIC_OF]->(t:Topic)
WHERE t.raw_id = 'field_genetics_evolution'
RETURN kp.name_en AS KnowledgePoint, t.name_en AS Topic
```

**C. 查找 "ATP" 在哪些页面被提及：**
```cypher
MATCH (kp:KnowledgePoint {raw_id: 'atp'})-[:MENTIONED_ON_PAGE]->(p:Page)
RETURN p.number
ORDER BY p.number
```

**D. 查找 "糖酵解" (glycolysis) 的所有步骤：**
```cypher
MATCH (step:KnowledgePoint)-[r:IS_STEP_IN]->(process:KnowledgePoint {raw_id: 'glycolysis'})
RETURN step.name_en AS Step, r.step_number AS StepNumber
ORDER BY r.step_number
```

**E. 探索两个概念之间的关系路径：**
```cypher
// 查找 "ATP" 和 "光合作用" (photosynthesis) 之间的最短路径
MATCH (start:KnowledgePoint {raw_id: 'atp'}), (end:KnowledgePoint {raw_id: 'photosynthesis'})
MATCH path = allShortestPaths((start)-[*]-(end))
RETURN path
```

**F. 查找起调控作用的分子：**
```cypher
// 查找所有调控其他过程或物质的节点
MATCH (regulator:KnowledgePoint)-[:REGULATES]->(process:KnowledgePoint)
RETURN regulator.name_en AS Regulator, process.name_en AS RegulatedProcess
LIMIT 25
```

**G. 查找一个过程的输入和输出：**
```cypher
// 查找 "细胞呼吸" (cellular_respiration) 消耗什么，又产生什么
MATCH (consumer:KnowledgePoint {raw_id: 'cellular_respiration'})-[r1:CONSUMES]->(consumed:KnowledgePoint)
MATCH (producer:KnowledgePoint {raw_id: 'cellular_respiration'})-[r2:PRODUCES]->(produced:KnowledgePoint)
RETURN consumed.name_en AS Consumed, produced.name_en AS Produced
```

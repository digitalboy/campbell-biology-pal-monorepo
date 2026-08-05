import uuid
from uuid import UUID
from pydantic import BaseModel, Field, model_validator
from typing import List, Literal, Optional, Annotated

# --- [A] 核心类型定义 (无变化) ---
PROJECT_NAMESPACE = uuid.UUID("a8b9c0d1-e2f3-4a5b-8c9d-0e1f2a3b4c5d")


def generate_deterministic_uuid(name: str) -> UUID:
    return uuid.uuid5(PROJECT_NAMESPACE, name)


RawIdStr = Annotated[str, Field(strip_whitespace=True, to_lower=True)]


# --- [B] 节点和关系的组件模型 ---
# --- 修改点: MultilingualText 字段改为必选 ---
class MultilingualText(BaseModel):
    # 将 Optional[str] 改为 str，并使用 Field(...) 表示必选
    en: str = Field(..., description="English translation")
    zh: str = Field(..., description="Chinese translation")
    es: str = Field(..., description="Spanish translation")
    fr: str = Field(..., description="French translation")
    de: str = Field(..., description="German translation")
    ja: str = Field(..., description="Japanese translation")
# --- /修改点 ---


class RelationshipProperties(BaseModel):
    step_number: Optional[int] = None


# --- [C] 关系模型 ---
AllowedRelationshipType = Literal[
    # --- 现有生物学关系 ---
    "IS_SUBTOPIC_OF",
    "MENTIONED_ON_PAGE",
    "IS_A",
    "IS_PART_OF",
    "IS_STEP_IN",
    "CONTRASTS_WITH",
    "CONSUMES",
    "PRODUCES",
    "REGULATES",
    "LOCATION_OF",    
    "CONTRIBUTED_TO",  # e.g., (Person)-[CONTRIBUTED_TO]->(KnowledgePoint/Topic)
    "PARTICIPATED_IN",  # e.g., (Person)-[PARTICIPATED_IN]->(Event)
    "LED_TO",  # e.g., (Event)-[LED_TO]->(KnowledgePoint)
]


class Relationship(BaseModel):
    source_raw_id: RawIdStr = Field(..., alias="source_id")
    target_raw_id: RawIdStr = Field(..., alias="target_id")

    source_id: Optional[str] = None
    target_id: Optional[str] = None

    type: AllowedRelationshipType
    properties: Optional[RelationshipProperties] = None

    # --- 核心修复点：将验证器模式从 "before" 改为 "after" ---
    @model_validator(mode="after")
    def process_relationship_ids(self) -> "Relationship":
        """
        在模型字段被 Pydantic 完全填充后运行。
        这时 self.source_raw_id 已经有了正确的值 (e.g., "biology")。
        """
        # 从已经被正确填充的 raw_id 字段生成 UUID
        if self.source_raw_id:
            self.source_id = str(generate_deterministic_uuid(self.source_raw_id))

        if self.target_raw_id:
            self.target_id = str(generate_deterministic_uuid(self.target_raw_id))

        return self


# --- [D] 节点模型 (无变化, 它们的验证器已经是正确的) ---
class TopicNode(BaseModel):
    raw_id: RawIdStr = Field(..., alias="id")
    id: Optional[str] = None
    names: MultilingualText
    descriptions: MultilingualText

    @model_validator(mode="before")
    def process_ids(cls, data):
        # 这个验证器是正确的，因为 raw_id 和 id 都来自同一个 JSON 键 "id"
        if data.get("id"):
            uuid_obj = generate_deterministic_uuid(data["id"])
            data["id"] = str(uuid_obj)
        return data


class KnowledgePointNode(BaseModel):
    raw_id: RawIdStr = Field(..., alias="id")
    id: Optional[str] = None
    names: MultilingualText
    definitions: MultilingualText

    @model_validator(mode="before")
    def process_ids(cls, data):
        # 这个验证器也是正确的
        if data.get("id"):
            uuid_obj = generate_deterministic_uuid(data["id"])
            data["id"] = str(uuid_obj)
        return data


# --- [E] 完整图谱根模型 (无变化) ---
class KnowledgeGraph(BaseModel):
    topics: List[TopicNode]
    knowledge_points: List[KnowledgePointNode]
    relationships: List[Relationship]

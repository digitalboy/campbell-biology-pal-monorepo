# src/models/quiz_models.py

from pydantic import BaseModel, Field, validator
from typing import List, Annotated
import enum

# ==============================================================================
# [A] 给 Gemini API 的纯净版 Schema
# ==============================================================================


class DifficultyEnum(str, enum.Enum):
    """
    定义题目的难度等级。
    使用 str 和 enum.Enum 双继承，使其既是枚举又是字符串。
    """

    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class _PureLocalizedText(BaseModel):
    en: str
    zh: str
    es: str
    fr: str 
    de: str 
    ja: str 


class _PureOption(BaseModel):
    id: str
    text: _PureLocalizedText
    feedback: _PureLocalizedText | None = None


class GeminiQuestionSchema(BaseModel):
    """
    这是传递给 Gemini `response_schema` 的模型。
    【重要】: 这个模型不包含 `page_number`，因为我们不信任 AI 来提供这个关键数据。
    """

    difficulty: DifficultyEnum
    question_text: _PureLocalizedText
    options: List[_PureOption]
    correct_answers: List[str]
    explanation: _PureLocalizedText


# ==============================================================================
# [B] 我们内部使用的验证版模型
# ==============================================================================

# 为带有约束的类型创建别名，使代码更清晰
ConstrainedStr = Annotated[str, Field(strip_whitespace=True, min_length=1)]


class ValidatedOption(BaseModel):
    """
    内部验证版的 Option 模型，增加了字段约束。
    """

    id: ConstrainedStr
    text: _PureLocalizedText
    feedback: _PureLocalizedText | None = None


class ValidatedQuestion(BaseModel):
    """
    用于在接收到 Gemini 响应后，进行我们自己内部的、严格的数据验证。
    """

    page_number: Annotated[int, Field(gt=0)]
    difficulty: DifficultyEnum
    question_text: _PureLocalizedText
    options: Annotated[List[ValidatedOption], Field(min_length=2)]
    correct_answers: Annotated[List[ConstrainedStr], Field(min_length=1)]
    explanation: _PureLocalizedText

    @validator("correct_answers")
    def validate_correct_answers_exist_in_options(cls, v, values):
        """
        一个自定义验证器，确保所有正确答案的ID都存在于选项ID中。
        """
        if "options" in values:
            option_ids = {opt.id for opt in values["options"]}
            for answer_id in v:
                if answer_id not in option_ids:
                    raise ValueError(
                        f"Correct answer '{answer_id}' is not a valid option ID."
                    )
        return v

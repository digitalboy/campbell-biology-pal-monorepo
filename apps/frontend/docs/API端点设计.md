### 后端 API 端点清单 (V1.5)

#### **设计原则**

*   **基地址**: 所有端点都以 `/api/v1/` 为前缀。
*   **认证**: **必需**。除特别注明外，所有端点都通过请求头中的 `Authorization: Bearer <JWT>` 进行验证。前端通过 Firebase SDK 获取 JWT，后端进行验证。
*   **数据格式**: 所有请求和响应的主体都使用 `application/json` 格式。
*   **错误处理**: API 将返回标准的 HTTP 状态码（如 `400`, `401`, `404`, `500`），响应体中会包含一个错误信息对象，例如 `{ "error": "资源未找到" }`。
*   **分页**: 对于返回列表的端点，将使用标准的查询参数进行分页，例如 `?limit=20&offset=0`。

#### **API 与数据库的关系**

API 是前后端之间的契约，它定义了清晰的数据结构。数据库的内部实现（例如将JSON对象作为字符串存储）被后端服务所封装。后端的职责就是从数据库读取原始数据，在代码中进行解析和转换，最终以API契约规定的格式将干净、结构化的JSON对象返回给前端。

---

### **1. 认证与用户 (Auth & Users)**

#### `POST /api/v1/users/sync`
*   **描述**: 同步用户信息。用户在前端首次登录成功后调用，以在后端创建或更新用户记录。
*   **认证**: **必需**
*   **请求体**:
    ```json
    {
      "email": "new.user@example.com",
      "nickname": "New User",
      "avatar_url": "https://example.com/avatar.png"
    }
    ```
*   **成功响应 (200 OK)**: 返回创建或更新后的用户资料。
    ```json
    {
      "id": "firebase-uid-12345",
      "email": "new.user@example.com",
      "nickname": "New User",
      "avatar_url": "https://example.com/avatar.png",
      "created_at": "2024-08-10T12:00:00Z"
    }
    ```

#### `GET /api/v1/users/me`
*   **描述**: 获取当前登录用户的个人公开资料。
*   **认证**: **必需**
*   **成功响应 (200 OK)**:
    ```json
    {
      "id": "firebase-uid-12345",
      "email": "current.user@example.com",
      "nickname": "Current User",
      "avatar_url": "https://example.com/avatar.png",
      "created_at": "2024-08-10T12:00:00Z"
    }
    ```

#### `PUT /api/v1/users/me`
*   **描述**: 更新当前登录用户的个人公开资料（昵称、头像）。
*   **认证**: **必需**
*   **请求体**:
    ```json
    {
      "nickname": "Updated Nickname",
      "avatar_url": "https://example.com/new-avatar.png"
    }
    ```

#### `GET /api/v1/users/me/dashboard-stats`
*   **描述**: 获取用于展示个人学习仪表盘的所有统计和图表数据。
*   **认证**: **必需**

#### `GET /api/v1/users/me/reviews/due`
*   **描述**: 获取当前用户所有“到期应复习”的题目完整列表。
*   **认证**: **必需**
*   **成功响应 (200 OK)**:
    ```json
    {
      "due_questions": [
        {
          "id": "q-abc-123",
          "last_reviewed_at": "2024-10-26T10:00:00Z",
          "review_stage": 2,
          // ... 此处包含完整的 Question 对象所有字段 (question_text, options, etc.)
        }
      ]
    }
    ```

---

### **2. 核心内容与学习 (Content & Learning)**

#### `GET /api/v1/pages/{pageNumber}/companion-data`
*   **描述**: 获取指定教材页码的所有伴读数据。这是一个核心的复合端点，一次性返回前端右侧面板需要的所有内容，以提高加载效率。
*   **认证**: **必需**
*   **成功响应 (200 OK)**:
    ```json
    {
      "pageNumber": 192,
      "pageImageUrl": "https://<r2-bucket-url>/pages/192.png",
      "knowledge_graph": { /* ... */ },
      "questions": [ /* ... */ ]
    }
    ```

---

### **3. 练习与评测 (Quiz & Assessment)**

#### `POST /api/v1/questions/{questionId}/submit`
*   **描述**: 提交单个问题的答案。后端会校验答案，记录对错，并更新用户的学习统计和复习计划。
*   **认证**: **必需**
*   **路径参数**:
    *   `questionId` (string): 要回答的问题的ID。
*   **请求体**:
    ```json
    {
      "selectedAnswers": ["A", "C"]
    }
    ```
*   **成功响应 (200 OK)**:
    ```json
    {
      "isCorrect": false,
      "correctAnswers": ["A", "D"],
      "explanation": {
        "en": "The correct answer is A and D because...",
        "zh": "正确答案是A和D，因为..."
      }
    }
    ```
*   **错误响应**:
    *   `400 Bad Request`: 请求体格式错误。 `{ "error": "selectedAnswers must be an array of strings." }`
    *   `404 Not Found`: 问题ID不存在。 `{ "error": "Question with ID q-xyz-789 not found." }`
*   **后端实现说明**:
    1.  校验答案的正确性。
    2.  **如果题目来自复习队列且回答正确**，则更新其在 `SpacedRepetitionSchedule` 表中的 `review_stage` 和 `next_review_at`。
    3.  **如果回答错误**，则在 `SpacedRepetitionSchedule` 表中创建或重置其复习计划。
    4.  返回详细的答题结果，包括正确答案和解析。

#### `GET /api/v1/users/me/wrong-answers` (错题本)
*   **描述**: 获取当前用户的所有错题。
*   **认证**: **必需**
*   **分页**: 支持 `?limit=<number>&offset=<number>`。

---

### **4. 社交与讨论 (Social & Discussion)**

#### `GET /api/v1/comments`
*   **描述**: 获取某个特定锚点（教材页面或问题）的所有评论，按时间倒序排列。
*   **认证**: **必需**
*   **URL 查询参数**:
    *   `anchor_type` (string, **必需**): 锚点类型。可选值为 `'page'` 或 `'question'`。
    *   `anchor_id` (string, **必需**): 锚点ID (页码或问题ID)。
    *   `limit` (number, 可选, 默认20): 每页数量。
    *   `offset` (number, 可选, 默认0): 偏移量。

#### `POST /api/v1/comments`
*   **描述**: 发表一条新的评论或回复。
*   **认证**: **必需**
*   **请求体**:
    ```json
    {
      "parent_type": "page",
      "parent_id": "192",
      "parent_comment_id": null, // or the ID of the comment being replied to
      "content": "我对这个概念有疑问..."
    }
    ```

---

### **5. 搜索 (Search)**

#### `GET /api/v1/search`
*   **描述**: 根据用户输入的查询字符串，在知识图谱节点和教材内容中进行全局搜索。
*   **认证**: **必需**
*   **URL 查询参数**: `?q=<search_query>` (例如: `?q=线粒体`)
*   **成功响应 (200 OK)**:
    ```json
    {
      "query": "线粒体",
      "results": {
        "knowledge_points": [
          {
            "id": "uuid-for-mitochondrion",
            "names": { "en": "Mitochondrion", "zh": "线粒体" },
            "match_snippet": "A key organelle in cellular respiration."
          }
        ],
        "textbook_pages": [
          {
            "page_number": 168,
            "match_snippet": "...能量转换的主要场所是**线粒体**..."
          }
        ],
        "topics": [
             {
                "id": "uuid-for-cellular-respiration",
                "names": { "en": "Cellular Respiration", "zh": "细胞呼吸" }
             }
        ]
      }
    }
    ```

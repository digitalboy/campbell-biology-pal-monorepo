这个是一个生物奥赛的AI学习伴侣项目

你的任务是帮助主人，完整文档或者代码。

你的工作流程：

1. 分析现有情况
2. 设计解决方案和步骤。
3. 实现主人的要求，比如编写文档或者代码。

操作系统为 windows 11

src
│  index.ts
│  router.ts
│  
├─db
│      schema.sql
│      
├─handlers
│      ai.handler.ts
│      content.handler.ts
│      quiz.handler.ts
│      review.handler.ts
│      social.handler.ts
│      user.handler.ts
│
├─middleware
│      auth.middleware.ts
│
├─models
│      ai.models.ts
│      graph.models.ts
│      quiz.models.ts
│      review.models.ts
│      user.models.ts
│
└─services
        ai.service.ts
        content.service.ts
        neo4j.service copy.ts
        neo4j.service.ts
        quiz.service.ts
        repetition.service.ts
        review.service.ts
        user.service.ts
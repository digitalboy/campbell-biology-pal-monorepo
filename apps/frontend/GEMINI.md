这是一个前端项目，将部署在 cloudflare pages 上。

你的是任务帮助主人编码，或者编写文档。

运行在 windows 11 上

沟通语言是中文


│  App.vue
│  firebaseConfig.ts
│  i18n.ts
│  main.ts
│  vite-env.d.ts
│  
├─assets
├─components
│  ├─features
│  │  ├─ai-chat
│  │  │      ChatView.vue
│  │  │      
│  │  ├─dashboard
│  │  │      PersonalDashboardDialog.vue
│  │  │      
│  │  ├─learning-interface
│  │  │      CommentPanel.vue
│  │  │      CompanionPanel.vue
│  │  │      PdfViewer.vue
│  │  │      QuestionList.vue
│  │  │      
│  │  └─review-session
│  │          ReviewView.vue
│  │
│  ├─shared
│  │      CommentForm.vue
│  │      CommentItem.vue
│  │      GlobalHeader.vue
│  │      LanguageSwitcher.vue
│  │      LoadingIndicator.vue
│  │      QuestionViewer.vue
│  │      ThemeToggle.vue
│  │      UserNav.vue
│  │
│  └─ui
│      ├─avatar
│      │      Avatar.vue
│      │      AvatarFallback.vue
│      │      AvatarImage.vue
│      │      index.ts
│      │
│      ├─badge
│      │      Badge.vue
│      │      index.ts
│      │
│      ├─button
│      │      Button.vue
│      │      index.ts
│      │
│      ├─card
│      │      Card.vue
│      │      CardAction.vue
│      │      CardContent.vue
│      │      CardDescription.vue
│      │      CardFooter.vue
│      │      CardHeader.vue
│      │      CardTitle.vue
│      │      index.ts
│      │
│      ├─chart
│      │      ChartCrosshair.vue
│      │      ChartLegend.vue
│      │      ChartSingleTooltip.vue
│      │      ChartTooltip.vue
│      │      index.ts
│      │      interface.ts
│      │
│      ├─chart-donut
│      │      DonutChart.vue
│      │      index.ts
│      │
│      ├─dialog
│      │      Dialog.vue
│      │      DialogClose.vue
│      │      DialogContent.vue
│      │      DialogDescription.vue
│      │      DialogFooter.vue
│      │      DialogHeader.vue
│      │      DialogOverlay.vue
│      │      DialogScrollContent.vue
│      │      DialogTitle.vue
│      │      DialogTrigger.vue
│      │      index.ts
│      │
│      ├─drawer
│      │      Drawer.vue
│      │      DrawerClose.vue
│      │      DrawerContent.vue
│      │      DrawerDescription.vue
│      │      DrawerFooter.vue
│      │      DrawerHeader.vue
│      │      DrawerOverlay.vue
│      │      DrawerTitle.vue
│      │      DrawerTrigger.vue
│      │      index.ts
│      │
│      ├─input
│      │      index.ts
│      │      Input.vue
│      │
│      ├─pagination
│      │      index.ts
│      │      Pagination.vue
│      │      PaginationContent.vue
│      │      PaginationEllipsis.vue
│      │      PaginationFirst.vue
│      │      PaginationItem.vue
│      │      PaginationLast.vue
│      │      PaginationNext.vue
│      │      PaginationPrevious.vue
│      │
│      ├─progress
│      │      index.ts
│      │      Progress.vue
│      │
│      ├─scroll-area
│      │      index.ts
│      │      ScrollArea.vue
│      │      ScrollBar.vue
│      │
│      ├─sonner
│      │      index.ts
│      │      Sonner.vue
│      │
│      ├─tabs
│      │      index.ts
│      │      Tabs.vue
│      │      TabsContent.vue
│      │      TabsList.vue
│      │      TabsTrigger.vue
│      │
│      ├─textarea
│      │      index.ts
│      │      Textarea.vue
│      │
│      └─tooltip
│              index.ts
│              Tooltip.vue
│              TooltipContent.vue
│              TooltipProvider.vue
│              TooltipTrigger.vue
│
├─composables
│      useColorMode.ts
│
├─layouts
│      DefaultLayout.vue
│
├─lib
│      utils.ts
│
├─locales
│      de.json
│      en.json
│      es.json
│      fr.json
│      ja.json
│      zh.json
│
├─router
│      index.ts
│
├─services
│      apiClient.ts
│      authService.ts
│      commentService.ts
│      reviewService.ts
│
├─stores
│      authStore.ts
│      commentStore.ts
│      learning.ts
│      ui.ts
│
├─styles
│      main.css
│
├─types
│      api.ts
│
└─views
        AIChatView.vue
        LearningView.vue
        LoginView.vue
        NotFoundView.vue
        ReviewSessionView.vue


这是一个前端项目，


### 项目技术栈清单 (V2)

本文档详细列出了“奥赛生物智能学习伴侣”前端项目所使用的核心技术、库和工具。

---

#### **1. 核心框架与生态 (Core Framework & Ecosystem)**

*   **框架 (Framework)**: **Vue 3.x**
    *   *描述*: 项目的渐进式 JavaScript 框架基础。
*   **构建工具 (Build Tool)**: **Vite**
    *   *描述*: 提供极速的冷启动和热模块替换（HMR）的现代前端构建工具。
*   **路由 (Routing)**: **Vue Router**
    *   *描述*: Vue.js 的官方路由，用于构建单页面应用（SPA）的页面导航。
*   **状态管理 (State Management)**: **Pinia**
    *   *描述*: Vue 官方推荐的状态管理库，用于管理用户认证、学习数据等全局状态。

---

#### **2. UI 与样式 (UI & Styling)**

*   **UI 组件库 (UI Components)**: **shadcn-vue**
    *   *描述*: 一套可重用的、遵循设计原则的无样式组件集合，可高度自定义。
*   **CSS 框架 (CSS Framework)**: **Tailwind CSS v4 （与 v3 有重大不同）**
    *   *描述*: 一个功能类优先的 CSS 框架，用于快速构建自定义用户界面。
*   **图标系统 (Icon System)**: **Lucide Icons** + **自定义 SVG**
    *   *描述*: 主要使用 `lucide-vue-next` 作为项目的标准图标库，以确保与 `shadcn-vue` 组件的视觉一致性。对于品牌 Logo 或特定功能所需的独特图标，将使用自定义的 SVG 文件，并通过 `vite-svg-loader` 等工具直接作为 Vue 组件导入。

---

#### **3. 功能与服务集成 (Features & Service Integration)**

*   **认证服务 (Authentication)**: **Firebase Authentication**
    *   *描述*: 用于处理用户注册、登录和会话管理。
*   **数据请求 (Data Fetching)**: **Axios** (或 Fetch API)
    *   *描述*: 用于与后端 `/api/v1/` 端点进行 HTTP 通信。
*   **国际化 (i18n)**: **Vue-i18n**
    *   *描述*: 实现多语言用户界面的标准库，支持中英文切换。
*   **图表与可视化 (Charts & Visualization)**: (待定, 例如: **ECharts**, **D3.js**, 或 **Chart.js**)
    *   *描述*: 用于渲染个人学习仪表盘中的统计图表和知识图谱。

---

#### **4. 开发与部署 (Development & Deployment)**

*   **代码规范 (Linting)**: **ESLint**
    *   *描述*: 用于发现并修复代码中的问题，保证代码风格一致性。
*   **代码格式化 (Formatting)**: **Prettier**
    *   *描述*: 自动格式化代码，确保团队遵循统一的编码风格。
*   **部署平台 (Deployment)**: **Cloudflare Pages**
    *   *描述*: 用于项目的持续集成与全球化静态部署。


## 多语言服务

你必须为所有文本内容提供全部六种语言的翻译 (`en`, `zh`, `es`, `fr`, `de`, `ja`)

## 开发平台

windows11  vscode

## PDF 

每个pdf 都是单页的，原本的 pdf 已经被拆分了。
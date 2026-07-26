# Shop — 多店铺电商平台

模块化单体架构的多店铺电商平台，支持 22+ 个业务模块按需插拔，可随时拆分为微服务。

## 技术栈

| 层     | 技术                                                            |
| ------ | --------------------------------------------------------------- |
| 前端   | TanStack Start (React 19, TypeScript 7, Vite 8, Tailwind v4)    |
| 后端   | Spring Boot 4.1 + Spring Modulith 2.1 + REST (OpenAPI) + MyBatis-Plus 3.5 |
| 数据库 | PostgreSQL 18 (Schema 隔离) + Redis 7                           |
| 工具   | Maven + pnpm + Docker Compose + Lefthook + Oxlint/Oxfmt         |

## 前置要求

- Java 25 + Maven
- Node.js 22+ + pnpm 11+
- Docker + Docker Compose

## 快速开始

```bash
# 1. 启动数据库
docker compose -f deploy/docker-compose.yml up -d

# 2. 启动后端（http://localhost:8080）
pnpm dev:server

# 3. 启动前端（http://localhost:3000，新终端）
pnpm dev:web

# 或者一键启动前后端
pnpm dev
```

打开 http://localhost:3000 查看系统状态。

## 目录结构

```
shop/
├── apps/
│   ├── web/                    # 买家端（SSR）
│   ├── seller/                 # 卖家工作台（SPA）
│   ├── admin/                  # 平台管理端（SPA）
│   ├── mobile-buyer/           # Expo / React Native
│   ├── mobile-seller/
│   └── server/                 # Spring Boot 模块化单体
│       └── src/main/java/com/shop/platform/
│           ├── common/         # 跨模块共享（响应封装、异常体系、UserIdHolder）
│           ├── config/         # 全局基础设施（Filter、Advice、ExceptionHandler）
│           ├── auth/           # 模块 = 顶层包 = PG schema
│           ├── product/
│           └── …               # 22 个业务模块
├── packages/
│   ├── api-client/             # OpenAPI 生成的 TS client
│   ├── domain/                 # 纯 TS 业务逻辑
│   ├── ui-web/                 # shadcn 组件库
│   ├── i18n/                   # 翻译资源
│   └── config/                 # 共享配置（tsconfig / oxlint / oxfmt）
├── openapi/                    # OpenAPI 契约（唯一 API 事实来源）
├── deploy/                     # Docker Compose / K8s
├── docs/                       # PRD / ADR / 架构文档
└── scripts/                    # 工具脚本
```

## 常用命令

```bash
pnpm dev          # 启动前后端
pnpm dev:web      # 只启动前端
pnpm dev:server   # 只启动后端
pnpm build        # 构建全部
pnpm lint         # 前端 lint + 后端编译检查
pnpm format       # 格式化前端 + 后端代码
pnpm typecheck    # TypeScript 类型检查
```

## 开发规范

### 提交信息

遵循 Conventional Commits 格式：

```
feat(web): 商品列表页加筛选
fix(server): 修复库存扣减并发问题
refactor(api-client): 提取公共请求逻辑
```

scope 可选，填具体模块名。

### 架构原则

- **模块化单体**：模块之间不 import 对方的 service/repo，只靠 Event Bus 通信
- **Schema 隔离**：每个模块拥有自己的 PG schema，可只读跨 schema 查，不许跨 schema JOIN
- **`common/` 纯包**：跨模块共享类型，不属于任何 Modulith 模块，无 `@ApplicationModule`
- **`config/` 全局基础设施**：Filter、Advice、ExceptionHandler 等 Spring 组件

# Shop — 多店铺电商平台

模块化单体架构的多店铺电商平台：后端按业务模块划分（模块 = 顶层包 = PG schema），由 Spring Modulith 强制校验边界，可随时拆分为微服务。

## 技术栈

| 层     | 技术                                                                               |
| ------ | ---------------------------------------------------------------------------------- |
| 前端   | TanStack Start (React 19, TypeScript 7, Vite 8, Tailwind v4)                       |
| 后端   | Spring Boot 4.1 + Spring Modulith 2.1 + REST + MyBatis-Plus 3.5                    |
| 数据库 | PostgreSQL 18 (Schema 隔离) + Redis 7                                              |
| 工具   | Maven + pnpm + Lefthook + Oxlint/Oxfmt (TS) + Spotless / Google Java Format (Java) |

## 前置要求

- Java 25 + Maven
- Node.js 22+ + pnpm 11+
- WSL2 上运行的 PostgreSQL 18 + Redis 7（localhost 直连，无需 Docker）

## 快速开始

```bash
# 1. 数据库与 Redis 已在 WSL2 上运行（localhost 直连即可）

# 2. 启动后端（http://localhost:8080）
pnpm dev:server

# 3. 启动买家端（新终端，http://localhost:3000）
pnpm dev:web

# 或者一键启动前后端
pnpm dev
```

## 目录结构

```
shop/
├── apps/
│   ├── web/                    # 买家端 SSR（TanStack Start，3000 端口）
│   ├── seller/                 # 卖家工作台 SPA（5000 端口）
│   ├── admin/                  # 平台管理端 SPA（4000 端口）
│   └── server/                 # Spring Boot 模块化单体（8080 端口）
│       └── src/main/java/com/shop/platform/
│           ├── common/         # 共享纯包：异常体系、Money/PhoneNumber、UserIdHolder 等（框架无关）
│           ├── infra/          # 共享纯包：JWT、限流、Filter、MyBatis 配置等跨模块技术适配
│           └── auth/ product/ inventory/ cart/ favorite/ order/ payment/ cms/ shop/ admin/ user/
│                              # 业务模块 = 顶层包 = PG schema；内部 controller → dto → service → mapper 三层到底
├── packages/
│   ├── api/                    # TS SDK（@hey-api/openapi-ts 从 openapi/api-docs.json 生成）+ zod schema
│   ├── ui-web/                 # shadcn/ui + BaseUI 组件库（CLI 生成，不手写）
│   └── config/                 # tsconfig / oxlint / oxfmt 共享配置
├── openapi/                    # OpenAPI 契约 api-docs.json（后端 /v3/api-docs 导出，pnpm gen:sdk 刷新）
└── docs/                       # 约定文档（错误码唯一真相源见 docs/error-codes.md）
```

## 架构原则

- **模块隔离**：模块之间不 import 对方的 service/repo。模块间通信有两条正规通道 ——
  **api 包**（`@NamedInterface("api")`，跨模块同步同事务的查询 `XxxReadQuery` 与命令 `XxxCommand`，
  失败抛异常回滚调用方事务）+ **events 包**（`@NamedInterface("events")`，纯通知）。
  命令语义（扣库存、推进订单状态）走 api 同步调用，不走事件；消费方在 `allowedDependencies` 显式登记
- **Schema 隔离**：每个模块拥有自己的 PG schema，可只读跨 schema 按 ID 查字段，不许跨 schema JOIN
- **`common/` 与 `infra/` 是共享纯包**：不属于任何业务模块，经 `@Modulithic(sharedModules)` 显式登记为共享模块
- **Modulith 强制校验**：测试期跨模块 import 直接报错（见 `ModularityTests`），命名规约由 ArchUnit 校验（见 `NamingRulesTest`）

## 已实现范围与已知边界

已闭环：注册登录（短信/密码 + refresh token 轮换）、商品与 SKU、多店铺、购物车、收藏、
结算预览、按店拆单下单、库存冻结/扣实/释放/回补（含流水账本）、两段式支付（MOCK 渠道）、
订单状态机（发货/收货/取消/超时关单）、已付款取消退款单据、静态 RBAC、CMS 首页配置。

尚未实现（刻意留白，不是遗漏）：

- **搜索**只有 `name LIKE '%kw%'`，无倒排索引/相关性排序，量级上去必须换方案
- **支付**仅 MOCK 渠道，未接真实网关（两段式状态机已按可替换设计，见 `PaymentService`）
- **无缓存层、无消息队列**：热点只读直接打库；跨模块异步仅用 Modulith 事件登记表（outbox）
- **营销**（优惠券/满减/秒杀/积分）、**运费计费**（恒 0）、**售后退货**、**分账结算与商家提现**、
  **物流对接**、**买家评价** 均未开始
- **平台管理端**（apps/admin）目前只有登录与首页骨架
- 未做过多实例部署与压测；已知的单机假设都在代码注释里标了出处
  （如订单号的进程内序列、超时关单不加分布式锁的理由见 `OrderTimeoutCloser`）

详细开发规范（模块组织、错误码、UI 组件接入等）见 [AGENTS.md](AGENTS.md)。

## 数据库与 Redis

PostgreSQL 18 与 Redis 7 运行在 WSL2 上，Windows 侧通过 localhost 直连：

```
数据库：shop:shop_dev@localhost:5432/shop
Redis：localhost:6379
```

## 开发规范

### 提交信息

遵循 Conventional Commits 格式，scope 可选：

```
feat(web): 商品列表页加筛选
fix(server): 修复库存扣减并发问题
refactor(server): 收口金额字段到 Money 值对象
```

### 常用命令

```bash
pnpm dev          # 启动前后端
pnpm dev:web      # 只启动买家端
pnpm dev:seller   # 卖家工作台
pnpm dev:admin    # 平台管理端
pnpm dev:server   # 只启动后端
pnpm build        # vite build + mvn compile
pnpm lint         # oxlint --fix + mvn compile
pnpm format       # oxfmt + spotless:apply
pnpm typecheck    # tsc --noEmit（三个前端 app）
pnpm gen:sdk      # 需后端已启动：拉 /v3/api-docs 覆盖契约并重新生成 packages/api/src/sdk
```

后端测试分快慢两环：`mvn test` 只跑 `*Test`（单元 + MockMvc 接口层，不碰数据库），
`mvn verify` 追加 `*IT`（真库集成测试，需 shop_test 库可达）。CI 门禁必须用 `mvn verify`。

Lefthook 在 pre-commit 自动格式化暂存文件并跑 lint，commit-msg 校验提交信息格式，pre-push 跑全量 lint / typecheck / Java 编译。

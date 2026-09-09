# 架构总览

> 本文回答"为什么这样设计、东西在哪、怎么流动"。可执行的硬规则在 [AGENTS.md](../AGENTS.md)（前端）与 [apps/server/AGENTS.md](../apps/server/AGENTS.md)（后端），本文不重复执法条款。

## 1. 系统组成

```
shop/（monorepo，pnpm workspace + Maven，不用 monorepo 工具）
├── apps/
│   ├── web/      买家端 SSR（TanStack Start）        :3000
│   ├── seller/   卖家工作台 SPA（Vite + React）      :5000
│   ├── admin/    平台管理端 SPA（Vite + React）      :4000
│   └── server/   Spring Boot 4.1 模块化单体          :8080
├── packages/
│   ├── api/          OpenAPI SDK + zod 校验 + Money/错误码工具（@hey-api 生成）
│   ├── ui-web/       shadcn/BaseUI 组件库 + 主题 token（DESIGN.md 见包内）
│   ├── common/       前端共享纯逻辑
│   ├── config/       tsconfig / oxlint / oxfmt 共享配置
│   └── test-utils/   跨 app 测试装置（MSW handlers / setup）
└── openapi/api-docs.json   接口契约唯一真相源（由后端 /v3/api-docs 导出）
```

三端共享同一个后端与同一份契约 SDK；视觉上共享 ui-web，端差异走端级 token 覆盖（见 DESIGN.md §6）。

## 2. 后端模块图

模块 = 顶层包 = PG schema（`product.products`）。模块间通信只有两条路：**api 包同步调用**（`@NamedInterface("api")`）与 **events 纯通知事件**（`@NamedInterface("events")`），消费方在 `@ApplicationModule(allowedDependencies)` 显式登记，ArchUnit 强制。`common/`（框架无关契约）与 `infra/`（JWT/限流/MyBatis 等技术适配）是共享纯包，经 `@Modulithic(sharedModules)` 登记后任何模块可引用。

当前依赖登记（来自各模块 `package-info.java`，改依赖 = 改登记）：

```
auth（叶子）        user（叶子）        cms（叶子）         inventory（叶子）
shop   → auth::api
product → inventory::api
cart   → product::api, inventory::api, shop::api
favorite → product::api
order  → product::api, inventory::api, shop::api, user::api, cart::api, cart::events
payment → order::api, order::events
admin  → shop::events, shop::api, auth::api
```

事件流：`cart.CartCheckedOutEvent`（结算）→ order 消费；`order` 事件 → payment 消费；`shop` 事件 → admin 消费（入驻审核）。事件发布走 Spring Modulith 事件总线（`infra/events/EventPublicationRecoveryJob` 负责失败恢复）。

模块内部三层到底：`controller → service → mapper`，命名契约见 apps/server/AGENTS.md。

## 3. 数据与基础设施

- PostgreSQL 18（WSL2，`localhost:5432`，`shop:shop_dev`）：**schema 隔离**是模块边界的数据面——模块只拥有并访问自己的 schema，跨 schema 只读查询一律收进 owning 模块的 api 包；禁止跨 schema JOIN。
- Redis 7（WSL2，`localhost:6379`）。
- 主键策略见 §5。

## 4. 关键链路

### 4.1 请求链路

```
浏览器 ── 同源相对路径 ──► Vite dev server（proxy: /auth /api /user /cart/ /orders/ /payments /favorites）──► Spring :8080
SSR loader ── 绝对地址 VITE_BACKEND_URL ────────────────────────────────────────────────────────────────► Spring :8080
```

浏览器端 baseUrl 用空串（同源，规避 CORS 与 refresh cookie 的跨域问题）；SSR loader 必须用绝对地址直连后端。代理 key 带尾斜杠的场景（`/cart/`、`/orders/`）是为了躲开"页面路由与 API 前缀同名"的劫持坑（详见 apps/web/vite.config.ts 注释）。

### 4.2 契约与 SDK 生成流

```
Spring /v3/api-docs ──pnpm gen:sdk──► openapi/api-docs.json ──@hey-api/openapi-ts──► packages/api/src/sdk
```

SDK 自带 zod schema 并做**响应校验**，契约漂移在客户端运行期直接报错；lefthook pre-push 有 sdk-drift 检查比对生成物与 api-docs.json。

### 4.3 认证链路

双 token 域隔离：`kind=user`（买家）与 `kind=staff`（员工/卖家/管理员）两套 JWT 过滤链。access token 只存前端内存（不落 storage），refresh token 走 httpOnly cookie；启动时 `bootstrapAuth()` 静默刷新，401 自动 refresh 重发（@shop/common 的 sdk-client.ts 拦截器）。admin 端 refreshPath 不同（`admin/auth/refresh`）。设计动机与攻击面：[docs/decisions/auth.md](decisions/auth.md)；实现对照：apps/server/docs/auth-implementation.md。

### 4.4 下单数据流（示意，以代码为准）

```
买家端购物车（cart 模块，Redis/PG）
  → 结算：cart 发 CartCheckedOutEvent
  → order 模块消费事件创建订单（依赖 cart::api、inventory::api 扣减、user::api 收货地址）
  → payment 模块消费 order 事件 / 调 order::api 完成支付
  → 履约态流转（PAID → 待发货 → …，前端投影见 apps/web/src/shared/order-status.ts）
```

## 5. 全库 ID 策略（所有模块通用）

**主键统一使用 uuidv7，类型 `UUID`。**

- 列定义：`id UUID PRIMARY KEY DEFAULT uuidv7()`（PG 18 原生函数，无需扩展）
- Java 侧：`java.util.UUID`，MyBatis-Plus `@TableId(type = IdType.INPUT)`
- 实际生成走应用层：`MyBatisPlusMetaObjectHandler` 在 insert 时用 `UuidCreator.getTimeOrderedEpoch()` 填充（字段已有值则不覆盖）；DB default 只是兜底
- 配套基础设施（`infra/`）：`MyBatisConfig` + `UuidTypeHandler` —— MyBatis 不注册会导致 uuid 列映射为 null、`selectById(UUID)` 报 no getter；已全局注册，新实体直接用 `UUID` 即可
- 禁止再引入其他主键方案（自增 / 雪花 / uuidv4），关联表、日志表同样遵守

选型理由：

1. **可枚举问题消失**：ID 可安全暴露在任何接口 / URL / 日志 / 消息队列中，无需逐接口评估暴露面，也不需要双 ID（内部自增 + 外部随机）方案
2. **生成无协调**：多副本部署、未来拆服务均无需改动（对比雪花的 workerId 分配问题）
3. **时间有序**：索引局部性接近自增，写入性能无 uuidv4 的碎片化问题
4. 代价：16B（vs BIGINT 8B），正常业务规模下无感

配套规则：**给用户看的业务编号（订单号、售后单号、支付流水号）是独立业务字段**（日期段 + 随机段），不是主键，不要用主键充当编号。

## 6. 前端 domain ↔ 后端模块对应

前端 domain 按**界面**组织，与后端模块不是 1:1（如"地址"属于界面上独立的 domain，后端却是 user 模块的 `/user/addresses`）。API 前缀与模块对应：

| API 前缀                | 后端模块             | 前端主要消费方                                                |
| ----------------------- | -------------------- | ------------------------------------------------------------- |
| `/auth/*`               | auth                 | 三端登录（web 弹窗 / seller / admin 各自装配 refreshPath）    |
| `/user/*`               | user                 | web（含收货地址 domain）                                      |
| `/cart/*`               | cart                 | web 的 cart domain                                            |
| `/orders/*` `/payments` | order / payment      | web 的 order、checkout domain                                 |
| `/api/*`                | product、cms、search | web 的 product / home domain；admin 的类目、CMS               |
| `/shops/*` `/seller/*`  | shop                 | seller 全域（X-Shop-Id 上下文头）                             |
| `/admin/*`              | admin                | admin 全域（权限拦截见 docs/conventions/permission-codes.md） |

## 7. 文档地图

- 操作规范：[AGENTS.md](../AGENTS.md)、[apps/server/AGENTS.md](../apps/server/AGENTS.md)
- 持续约定：[docs/conventions/](conventions/)（权限码表、业务事件日志）
- 设计决策：[docs/decisions/](decisions/)（auth 设计笔记、[模块边界目标形态与改造路线](decisions/module-boundaries.md)）
- 依据清单（收编的外部文档）：[docs/reference/](reference/)
- 模块实现对照（快照）：[apps/server/docs/](../apps/server/docs/)

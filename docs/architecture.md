# 架构总览

> 本文回答"为什么这样设计、东西在哪、怎么流动"。可执行的硬规则在 [AGENTS.md](../AGENTS.md)（通用）与 [docs/conventions/frontend.md](conventions/frontend.md)（前端细则）、[apps/server/AGENTS.md](../apps/server/AGENTS.md)（后端），本文不重复执法条款。

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

模块 = 顶层包 = PG schema（`product.products`）。模块间通信只有两条路：**api 包同步调用**（`@NamedInterface("api")`）与 **events 纯通知事件**（`@NamedInterface("events")`），消费方在 `@ApplicationModule(allowedDependencies)` 显式登记，ArchUnit 强制。`common/`（框架无关契约）与 `infra/`（JWT/Filter/MyBatis 等技术适配）是共享纯包，经 `@Modulithic(sharedModules)` 登记后任何模块可引用。

当前依赖登记（来自各模块 `package-info.java`，改依赖 = 改登记）：

```
account（叶子）     cms（叶子）         inventory（叶子）
shop   → account::api
product → inventory::api
cart   → product::api, inventory::api, shop::api, order::events
favorite → product::api
order  → product::api, inventory::api, shop::api, account::api, coupon::api
coupon → shop::api（券包展示店名；券的领取与核销在本模块闭环，不反向依赖 order）
logistics → order::api, shop::api（发货入口在物流侧：经 OrderCommand.markShipped / markDelivered 同事务推进订单，order 不认识物流）
aftersale → order::api, inventory::api, logistics::api, coupon::api（退款完成退券；回寄经物流模块落 RETURN 包裹）
payment → order::api, order::events, aftersale::events
```

券的两个方向都是同事务 api 命令：order 下单占用/支付核销/取消释放、aftersale 退款退券——券与订单/资金要么一起成立要么一起不成。设计见 [docs/decisions/coupon.md](decisions/coupon.md)。

事件流：`order.OrderPlacedEvent`（下单）→ cart 消费清理已购 SKU；`order.OrderCancelledEvent`（已付款单取消）与 `aftersale.AfterSaleRefundedEvent`（售后退款）→ payment 消费落退款单据。三条都是同事务同步监听；`kernel.event_publication` 登记表与 `infra/events/EventPublicationRecoveryJob` 保留给将来的 AFTER_COMMIT 消费方（如接真实支付网关后的退款），当前没有消费方在用。

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

**可空字段的两种写法必须分清**（这决定生成物是 `T` 还是 `T | null`）：

- 真会发 null 的字段（如划线价、已删除的商品快照、未选地址）标 `@Schema(nullable = true)`，前端按可空处理。
- 业务上不可能为空的字段**不要**标——典型是买家侧 `PublicProductResponse.minPrice/maxPrice`（发布门槛 + `ensureNotAllOutOfStock` 保证上架商品必有在售且已定价的 SKU）。标了就是过度声明：生成物凭空多出前端分支，真出契约事故时反而少了 zod 这道闸。

springdoc 对 `@Schema(nullable = true)` 打在 `$ref` 类型上会输出畸形表达 `{ "type": "null", "$ref": … }`（`type:"null"` 反而否掉了那句 `$ref`），生成器只取 `$ref`，可空字段就悄悄变成非空。`infra/web/OpenApiConfig` 在契约出口把它改写成 3.1 规范的 `anyOf: [{ $ref }, { type: "null" }]`；`scripts/contract-audit.mjs` 的 ERROR 闸门覆盖四种可空写法，漏标或表达退化会在 `gen:sdk` 时直接失败。

### 4.3 认证链路

双 token 域隔离：`kind=user`（买家）与 `kind=staff`（员工/卖家/管理员）两套 JWT 过滤链。access token 只存前端内存（不落 storage），refresh token 走 httpOnly cookie；启动时 `bootstrapAuth()` 静默刷新，401 自动 refresh 重发（@shop/common 的 sdk-client.ts 拦截器）。admin 端 refreshPath 不同（`admin/auth/refresh`）。设计动机与攻击面：[docs/decisions/auth.md](decisions/auth.md)。

### 4.4 下单数据流（示意，以代码为准）

```
买家端购物车（cart 模块，PG）
  → 结算：前端把勾选条目归约成 SKU 行（skuId + 件数）提交 /orders/preview 与 /orders/create
  → order 模块按 product::api 重算价格、inventory::api 冻结库存、account::api 取收货地址快照，按店拆单落库
  → order 发 OrderPlacedEvent，cart 同事务监听按 userId + skuId 删已购条目
  → payment 模块消费 order 事件 / 调 order::api 完成支付
  → 履约态流转（PAID → 待发货 → …，前端投影见 apps/web/src/shared/order-status.ts）
  → 卖家发货入口在 logistics（POST /seller/shipments）：同事务落包裹 + 经 order::api 推进 PAID → 已发货，
    一单可多包裹；签收节点把 delivered_at 写回订单，收货倒计时从签收起算。
    轨迹节点由承运商推送（/logistics/webhooks，签名校验后落库）、轮询兜底或运营补录写入，
    包裹状态是轨迹的投影（设计见 docs/decisions/logistics.md）
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

前端 domain 按**界面**组织，与后端模块不是 1:1（如"地址"属于界面上独立的 domain，后端却是 account 模块的 `/user/addresses`）。API 前缀与模块对应：

| API 前缀                | 后端模块                                                         | 前端主要消费方                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth/*`               | account                                                          | 三端登录（web 弹窗 / seller / admin 各自装配 refreshPath）                                                                                                             |
| `/user/*`               | account                                                          | web（含收货地址 domain）                                                                                                                                               |
| `/cart/*`               | cart                                                             | web 的 cart domain                                                                                                                                                     |
| `/orders/*` `/payments` | order / aftersale / payment / logistics / coupon                 | web 的 order、checkout domain（`/orders/{id}/after-sales/*` 由 aftersale 承接、`/orders/{id}/tracking` 由 logistics 承接；结算预览与下单的券在 coupon，经 order 编排） |
| `/coupons/*`            | coupon                                                           | web 的券包 domain（`/coupons/mine` 券包、`/coupons/{id}/claim` 领券；`/api/shops/{id}/coupons` 是匿名的店铺领券页）                                                    |
| `/api/*`                | product、cms、search                                             | web 的 product / home domain；admin 的类目、CMS                                                                                                                        |
| `/shops/*` `/seller/*`  | shop / order / product / logistics / aftersale                   | seller 全域（X-Shop-Id 上下文头；`/seller/orders` 归 order、`/seller/products` 归 product、`/seller/shipments` 归 logistics、`/seller/after-sales` 归 aftersale）      |
| `/admin/*`              | account（员工登录）/ shop（入驻审核）/ cms / product / logistics | admin 全域（权限拦截见 docs/conventions/permission-codes.md）                                                                                                          |
| `/logistics/webhooks/*` | logistics                                                        | 承运商轨迹推送（匿名，靠报文签名）                                                                                                                                     |

## 7. 文档地图

- 操作规范：[AGENTS.md](../AGENTS.md)、[apps/server/AGENTS.md](../apps/server/AGENTS.md)
- 持续约定：[docs/conventions/](conventions/)（权限码表、业务事件日志、取数口径论证）
- 设计决策：[docs/decisions/](decisions/)（auth 设计笔记、物流四期、售后闭环、[优惠券](decisions/coupon.md)——一期已闭环、二期候选见其 §16、类目体系与规格值 ID 化）；模块切分判据见 [apps/server/AGENTS.md「模块边界规范」](../apps/server/AGENTS.md)
- 外部调研资料：[docs/reference/](reference/)（券平台做法对照）

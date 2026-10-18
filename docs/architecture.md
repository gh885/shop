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
│   ├── common/       契约词表与形状 + 业务字段口径（/contract、/domain，纯常量与纯函数）
│   ├── i18n/         locale 判定与消息格式化（语言清单 owner，@shop/i18n）
│   ├── monitoring/   前端监控单一出口（captureError / track，@shop/monitoring）
│   ├── client/       运行时装配（sdk-client 传输拦截 / auth-kit 登录态，@shop/client）
│   ├── app-kit/      三端应用装配（QueryClient 工厂 / MutationMeta / QueryBoundary / me 查询工厂 / renderWithProviders）
│   ├── config/       tsconfig 共享；oxlint/oxfmt 设置由根 vite.config.ts 的 lint/fmt 块消费
│   └── test-utils/   跨 app 测试装置（MSW handlers / setup）
└── openapi/api-docs.json   接口契约唯一真相源（由后端 /v3/api-docs 导出）
```

三端共享同一个后端与同一份契约 SDK；视觉上共享 ui-web，端差异走端级 token 覆盖（见 DESIGN.md §7）。

## 2. 后端模块图

模块 = 顶层包 = PG schema（`product.products`）。模块间通信只有两条路：**api 包同步调用**（`@NamedInterface("api")`）与 **events 纯通知事件**（`@NamedInterface("events")`），消费方在 `@ApplicationModule(allowedDependencies)` 显式登记，ArchUnit 强制。`common/`（框架无关契约）与 `infra/`（JWT/Filter/MyBatis 等技术适配）是共享纯包，经 `@Modulithic(sharedModules)` 登记后任何模块可引用。

当前依赖登记（15 个业务模块，全部来自各模块 `package-info.java`，改依赖 = 改登记）：

```
account   → audit::api（封号、员工建号/调权/禁用同事务落审计）
shop      → account::api（成员手机号拼装）, account::events（店主注销 → 停店）, audit::api
product   → inventory::api（卖家改 SKU 同步调库存量）, shop::events（店铺停营业 → 级联下架在架商品）
cart      → product::api, inventory::api, shop::api（加购过营业闸门）, order::events, account::events
favorite  → product::api, account::events
order     → product::api, inventory::api, shop::api（运费报价 + 营业闸门）, account::api（账号闸门 + 地址快照）, coupon::api
coupon    → shop::api（券包展示店名）, account::api, account::events（注销作废未使用券）, audit::api
logistics → order::api, shop::api, account::api（补录/处置人姓名）, audit::api
aftersale → order::api（申请前置点查 + settleRefund 账本 + syncAfterSaleBadge 角标）, payment::api（渠道退款）, inventory::api（restock 回补）, logistics::api（回寄落 RETURN 包裹 + 发货事实）, coupon::api（整单退满退券）, shop::api（默认退货地址）
payment   → order::api
review    → order::api（归属/状态/完成时刻/行快照）, account::api（买家昵称）
recommend → product::api（ProductRecallQuery 召回，本模块不认识商品表）
cms（叶子）      inventory（叶子）      audit（叶子：零依赖，只被 account / shop / coupon / logistics 经 api 写）
```

- **account 不是叶子模块**：它的治理动作（封号、员工建号/调权/禁用）要同事务落审计账本，因此 `→ audit::api`。它同时是全仓唯一的注销事件源——其余模块清理自己那份数据靠监听 `account::events`，不是反过来。
- **发货入口在物流侧**：logistics 经 `OrderCommand.recordShipment / applyShippedQuantity / recalcFulfillment` 同事务推进订单（交寄入账 + 按事实重算履约态），order 不认识物流（单向故不成环）。
- **券的两个方向都是同事务 api 命令**：order 下单占用/支付核销/取消释放、aftersale 退款退券——券与订单/资金要么一起成立要么一起不成。券的领取与核销在 coupon 内闭环，不反向依赖 order（流水里的 `order_id` 是裸引用）。规则见 [docs/business-rules/coupon.md](business-rules/coupon.md)（占用/核销/释放/退券的同事务口径：CPN-35、CPN-37–CPN-39、CPN-46）。

跨模块事件流（5 个事件、8 个监听方法）：

| 事件（生产方 events 包）                 | 发布点                                                                                                                | 监听方（同步同事务）                                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order::events` OrderPlacedEvent         | `order/service/OrderService` 下单成功                                                                                 | cart `CartEventListener`：按 userId + skuId 删已购条目                                                                                                                  |
| `order::events` OrderCancelledEvent      | `order/service/OrderTransitionService`（已付款单取消）                                                                | aftersale `OrderCancelledListener`：同事务建整单退款单并执行（AFS-46）                                                                                                  |
| `shop::events` ShopTradingSuspendedEvent | shop 三处：`ShopReviewService`（审核驳回）、`ShopAdminService`（平台禁用）、`ShopAccountDeletionListener`（店主注销） | product `ShopEventListener`：级联下架该店在架商品（恢复 ACTIVE 不反向回上架，要卖家手动重上并复检）                                                                     |
| `account::events` UserDeletedEvent       | `account/service/AccountDeletionExecutor`（冷静期满匿名化）                                                           | cart `CartAccountDeletionListener`、favorite `FavoriteAccountDeletionListener`、coupon `CouponAccountDeletionListener`、shop `ShopAccountDeletionListener` 各清自己那份 |

`shop/service/ShopAccountDeletionListener` 是这条链的接缝：它监听 `UserDeletedEvent` 删掉本人的成员行、把名下仍在营业的店推成 DISABLED（条件更新，抢到才播报），再发 `ShopTradingSuspendedEvent` 让 product 级联下架——注销一个店主要经过两级事件，但每一级都是同事务同步的，所以不存在「店停了商品还挂着」的中间态。店不删、不改店主、不释放店名（ACC-72）。

八个监听方法全是普通 `@EventListener`（同步、同事务、落不成就整体回滚）；全仓没有 `@TransactionalEventListener` / `@ApplicationModuleListener` / `@Externalized`。所以 `kernel.event_publication` 登记表与 `infra/events/EventPublicationRecoveryJob` 目前**没有消费方在用**，是留给接真实网关后的退款的（见 [apps/server/AGENTS.md](../apps/server/AGENTS.md) 的诚实边界与 [docs/business-rules/payment.md](business-rules/payment.md) PAY-33）。

同一句诚实边界的另一面：**这是一个强一致优先的单体，不是"随时可拆微服务"**——模块之间大量同事务同步调用（下单冻库存、支付推单、退款监听），编译期干净、事务上一体，拆任何一个都要先把同事务命令改成 saga 或最终一致。

模块内部三层到底：`controller → service → mapper`，命名契约见 apps/server/AGENTS.md。

## 3. 数据与基础设施

- PostgreSQL 18（默认在云主机，本地经 ssh 隧道以 `localhost:15432` 接，`shop:shop_dev`；端口从 5432 迁来，缘由见 [AGENTS.md](../AGENTS.md)「数据库与 Redis」。CI 的 service 容器仍在 5432，差别只有 `SHOP_DB_PORT` 这一个环境变量）：**schema 隔离**是模块边界的数据面——模块只拥有并访问自己的 schema，跨 schema 只读查询一律收进 owning 模块的 api 包；禁止跨 schema JOIN。
- Redis 7（WSL2，`localhost:6379`）三件事：refresh token 存储（`infra/security/RefreshTokenStore`）、登录/发码限流（`account/infra/RateLimiter`，目前只有 account 用）、**读缓存**（`infra/cache`）。
- **读缓存刻意只三块**：首页三块配置 / 类目树与子树 / 店铺公开信息，名字汇总在 `infra/cache/CacheNames`，TTL 5 分钟只兜漏接的写路径（新鲜度靠写侧 `@CacheEvict`），判权、库存、订单状态这类闸门与账本一律不进缓存。名单、「什么才配上缓存」与序列化口径见 [apps/server/AGENTS.md](../apps/server/AGENTS.md)「读缓存」节。其余热点只读仍直接打库。
- 不引入消息队列：跨模块异步只有 Modulith 事件登记（现状见 §2 的事件表——目前全部同步监听，登记表还没有消费方在用）。
- 主键策略见 §5。

## 4. 关键链路

### 4.1 请求链路

```
浏览器 ── 同源相对路径 ──► Vite dev server（proxy，各端只代理自己用到的前缀）──► Spring :8080
SSR loader ── 绝对地址 VITE_BACKEND_URL ────────────────────────────────────────────────────────────────► Spring :8080
```

浏览器端 baseUrl 用空串（同源，规避 CORS 与 refresh cookie 的跨域问题）；SSR loader 必须用绝对地址直连后端。代理是 dev / preview 工具，三端各配一份：web 是 `/auth` `/api` `/user` `/cart/` `/payments` `/favorites` `/coupons/` `/reviews`（另加下面那个 `/orders` 中间件），seller 是 `/auth` `/shops` `/seller` `/api`，admin 只有 `/admin`。

**「页面路由与 API 前缀同名」有两种解法，别混用**（详见 `apps/web/vite.config.ts` 注释）：

- 静态代理 key 带尾斜杠（`/cart/`、`/coupons/`）：页面在 `/cart`、`/account/coupons`，而 API 永远只调 `/cart/*`，尾斜杠足以把两者分开。`/reviews` 没有同名页面路由，连尾斜杠都不需要。
- `/orders` 不行：页面 `/orders/$orderId` 与 API `GET /orders/{id}` 是**同一条路径**，尾斜杠保不住带参数的页面路径。路径分不了就分请求方——`ordersApiProxy` 插件按 Accept 头分流：文档导航（地址栏/刷新）的 Accept 必含 `text/html`，放行给 SSR；SDK 请求（fetch/ky 默认 `*/*`）转发后端。`/orders/*` 下的 POST 全是 API（下单/预览/取消/确认/售后），无页面 POST，直接转发。

### 4.2 契约与 SDK 生成流

```
Spring /v3/api-docs ──pnpm sdk:gen──► openapi/api-docs.json ──@hey-api/openapi-ts──► packages/api/src/sdk
```

SDK 自带 zod schema 并做**响应校验**；`@hey-api/schemas` 同时生成字段约束数据，由 `@shop/api/schemas` 导出，前端不再手抄结构化上限。lefthook pre-push 与 CI 的 sdk-drift 检查比对全部生成物与 api-docs.json。表单侧取值与例外规则见 [field-constraints.md](conventions/field-constraints.md)。

**可空字段的两种写法必须分清**（这决定生成物是 `T` 还是 `T | null`）：

- 真会发 null 的字段（如划线价、已删除的商品快照、未选地址）标 `@Schema(nullable = true)`，前端按可空处理。
- 业务上不可能为空的字段**不要**标——典型是买家侧 `PublicProductResponse.minPrice/maxPrice`（发布门槛 + `ensureNotAllOutOfStock` 保证上架商品必有在售且已定价的 SKU）。标了就是过度声明：生成物凭空多出前端分支，真出契约事故时反而少了 zod 这道闸。

springdoc 对 `@Schema(nullable = true)` 打在 `$ref` 类型上会输出畸形表达 `{ "type": "null", "$ref": … }`（`type:"null"` 反而否掉了那句 `$ref`），生成器只取 `$ref`，可空字段就悄悄变成非空。`infra/web/OpenApiConfig` 在契约出口把它改写成 3.1 规范的 `anyOf: [{ $ref }, { type: "null" }]`；`scripts/contracts/sdk-audit.mjs` 的 ERROR 闸门覆盖四种可空写法，漏标或表达退化会在 `sdk:gen` 时直接失败。

### 4.3 认证链路

双 token 域隔离：`kind=user`（买家**与卖家**，统一账号）与 `kind=staff`（平台员工/管理员）两套 JWT 过滤链——staff token 只在 `/admin/**` 生效，卖家侧能操作什么由 `X-Shop-Id` + 店铺成员关系在服务端裁决，与 token kind 无关（ACC-25、ACC-27）。access token 只存前端内存（不落 storage），refresh token 走 httpOnly cookie；启动时 `bootstrapAuth()` 静默刷新，401 自动 refresh 重发（@shop/client 的 sdk-client.ts 拦截器）。admin 端 refreshPath 不同（`admin/auth/refresh`），seller 与 web 共用买家那条（`auth/refresh`）。生效规则与「故意不做」边界见 [docs/business-rules/account.md](business-rules/account.md)（ACC-19、ACC-21、ACC-25、ACC-59、ACC-61–ACC-63）；设计动机与攻击面的原始论证见 git 历史（原设计笔记已归档）。

### 4.4 下单数据流（示意，以代码为准）

```
买家端购物车（cart 模块，PG）
  → 结算：前端把勾选条目归约成 SKU 行（skuId + 件数）提交 /orders/preview 与 /orders/create
  → order 模块按 product::api 重算价格、coupon::api 现算券的可用性与减免额、inventory::api 冻结库存、
    account::api 取收货地址快照、shop::api 报运费与营业闸门，按店拆单落库（券同事务占用）
  → order 发 OrderPlacedEvent，cart 同事务监听按 userId + skuId 删已购条目
  → 支付确认由 payment 调 order::api 的 OrderCommand.markPaid 推进（同事务扣实冻结库存 + 券核销）——
    正向不消费事件（没有 OrderPaidEvent）；退款方向的触发是 OrderCancelledEvent（aftersale 消费），渠道退款本身经 payment :: api 同步调用
  → 履约态流转（PAID → 待发货 → …，前端投影见 apps/web/src/order/order-status.ts）
  → 卖家发货入口在 logistics（POST /seller/shipments 录单 → POST /seller/shipments/{id}/dispatch 交寄）：
    录单落「待发货」包裹与发货单行，交寄同事务把件数写进订单行账本并经 order::api 重算履约态，
    一单可多包裹、粒度是订单行 + 数量；物流全部签收时订单自动完成，签收窗口从签收起算。
    轨迹节点由承运商推送（/logistics/webhooks，签名校验后落库）、轮询兜底或运营补录写入，
    包裹状态是时间戳的镜像（规则见 docs/business-rules/logistics.md LOG-11），轨迹只提供展示阶段与三个触发事实
  → 两条时间驱动的超时线（待付款关单、已发货超时自动收货）由 order/service/OrderTimeoutService
    逐笔走 common.Sweep.each 隔离扫描（GEN-57：一笔稳定失败的行不该卡住整批）、逐笔独立事务、无分布式锁
    （正确性靠条件更新闸门）。已付款（待发货）单**不在扫描表里**：超发货时限只提醒不代关单（拍板见
    docs/business-rules/order.md ORD-60），售后侧另有三条超时线归 aftersale（AFS 系列）
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

## 6. 全库金额策略（所有模块通用）

**金额在全链路上只有一个形状：`Money { amount(分), currency }`** —— DB 列对、Java record、OpenAPI schema、TS 类型同名同形。裸 int64 / BigDecimal 不出现在契约里（币种在那一刻就丢了，前端只能替平台猜一个符号），「元」只活在输入框与展示文本里。

| 层                         | 形状                                                            | 落点                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB                         | 金额列 + 同行 `currency VARCHAR(3)`，`CHECK (currency = 'CNY')` | 存金额的表：`product.products` / `product.skus` / `orders.orders` / `orders.items` / `payment.payments` / `aftersale.refunds` / `aftersale.refund_lines` / `aftersale.refund_executions` / `coupon.*` / `shop.shipping_*` |
| Java 实体                  | 两列 + 派生视图（`priceAsMoney()`）                             | `<module>/mapper`                                                                                                                                                                                                         |
| Java 契约 / service / 事件 | `common/Money`（record：非负；跨币种等内部不变量错误抛 500）    | dto / api / controller / service / events                                                                                                                                                                                 |
| OpenAPI / SDK              | 命名 schema `Money`                                             | `openapi/api-docs.json` → `packages/api`                                                                                                                                                                                  |
| TS                         | `Money`（re-export 契约，不写镜像类型）                         | `packages/common/src/domain/money.ts`                                                                                                                                                                                     |

三道闸门，各挡一类事故（论证见 V58 头注释与 `Money` javadoc）：

1. **DB `CHECK`**：币种只认平台定价币种、金额非负、价格区间不自相矛盾（`min_price <= max_price`）——脏数据写不进库
2. **`Money.requirePlatformCurrency()`**：入参币种错时给 400（「填错了」），而不是撞上 DB 约束变 500（「服务器坏了」）；构造与运算阶段破坏金额不变量则属于服务端错误，走 500 与 error 日志
3. **`MoneyTypeRulesTest`（ArchUnit）**：契约层的金额命名字段类型必须是 Money；`currency` 字段只允许出现在 mapper 实体与 Money 里

前端另有单一展示出口（`formatMoney` / 共享 `Price` 组件，符号跟币种），细则见 [conventions/frontend.md「金额（Money）」](conventions/frontend.md)；后端细则见 [apps/server/AGENTS.md「金额（Money）」](../apps/server/AGENTS.md)。

## 7. 前端 domain ↔ 后端模块对应

前端 domain 按**界面**组织，与后端模块不是 1:1（如"地址"属于界面上独立的 domain，后端却是 account 模块的 `/user/addresses`）。下表是全量 `@RequestMapping` 前缀（按角色命名空间排：`/api` 匿名、裸前缀买家、`/seller` 卖家、`/admin` 平台）：

| 前缀                                            | 后端模块         | 落点（controller）                                                           | 主要消费方                                                                                                                                                                            |
| ----------------------------------------------- | ---------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/products`                                 | product          | ProductController                                                            | web 商品列表与关键字搜索（包含匹配，语义与重评条件见 [search-decision.md](reference/search-decision.md)；阶段 B 增强检索采用 Elasticsearch，见 [search-design.md](search-design.md)） |
| `/api/categories`                               | product          | CategoryController                                                           | web 首页分类导航                                                                                                                                                                      |
| `/api/shops/{id}`                               | shop             | ShopPublicController                                                         | web 商详的店名/logo（这份读进 Redis 缓存，ACC-05）                                                                                                                                    |
| `/api/shops/{shopId}/coupons`                   | coupon           | CouponPublicController                                                       | web 店铺领券浮层                                                                                                                                                                      |
| `/api/cms/*`                                    | cms              | CmsPublicController                                                          | web 首页壳（导航 / banner / 推荐词条）                                                                                                                                                |
| `/api/feed`                                     | recommend        | FeedController                                                               | web 首页 feed 流（种子批次 + 游标，不回 total）                                                                                                                                       |
| `/api/reviews/products/{productId}`             | review           | PublicReviewController                                                       | web 商详评价区（聚合 + 好评率）                                                                                                                                                       |
| `/logistics/webhooks/*`                         | logistics        | CarrierWebhookController                                                     | 承运商轨迹推送（匿名，靠报文签名）                                                                                                                                                    |
| `/auth/*`                                       | account          | AuthController                                                               | web 弹窗与 seller 登录（短信/密码，kind=user）                                                                                                                                        |
| `/auth/deletion/*`                              | account          | AccountDeletionController                                                    | web 账号安全页（冷静期 → 匿名化）                                                                                                                                                     |
| `/user/addresses`                               | account          | AddressController                                                            | web 收货地址 domain                                                                                                                                                                   |
| `/cart/*`                                       | cart             | CartController                                                               | web cart domain（页面与 API 同路径，代理口径见 §4.1）                                                                                                                                 |
| `/favorites`                                    | favorite         | FavoriteController                                                           | web 收藏（页面在 /account/favorites）                                                                                                                                                 |
| `/orders/*`                                     | order            | OrderController（preview / create / mine / {id} / cancel / receive）         | web checkout 与订单 domain                                                                                                                                                            |
| `/orders/{id}/tracking`                         | logistics        | TrackingController                                                           | web 物流轨迹页                                                                                                                                                                        |
| `/orders/{id}/refunds/*`                        | aftersale        | RefundController                                                             | web 退款申请 / 撤销 / 回寄                                                                                                                                                            |
| `/payments/*`                                   | payment          | PaymentController                                                            | web 收银台（MOCK 两段式）                                                                                                                                                             |
| `/coupons/*`                                    | coupon           | CouponController（mine / {templateId}/claim）                                | web 券包（页面在 /account/coupons）                                                                                                                                                   |
| `/reviews/*`                                    | review           | MyReviewController（orders/{orderId} / {id}/append）                         | web 订单详情里的评价与追评                                                                                                                                                            |
| `/shops/*`                                      | shop             | ShopController（开店 / mine / subaccounts）                                  | **seller**（开店与子账号管理，买家侧不调）                                                                                                                                            |     |
| `/seller/orders`                                | order            | SellerOrderController                                                        | seller 订单页（X-Shop-Id 上下文头）                                                                                                                                                   |
| `/seller`（裸）                                 | logistics        | SellerLogisticsController（`/seller/shipments` 发货、`/seller/carriers`）    | seller 发货页——发货入口在物流侧，不在 order                                                                                                                                           |
| `/seller/refunds` `/seller/orders/{id}/refunds` | aftersale        | SellerRefundListController / SellerRefundController                          | seller 退款工作台                                                                                                                                                                     |
| `/seller/products`                              | product          | ProductAdminController                                                       | seller 商品管理                                                                                                                                                                       |
| `/seller/coupons`                               | coupon           | SellerCouponController                                                       | seller 建券页                                                                                                                                                                         |
| `/seller/reviews`                               | review           | SellerReviewController（{id}/reply）                                         | seller 评价管理页                                                                                                                                                                     |
| `/seller/addresses` `/seller/shipping-template` | shop             | SellerAddressController / SellerShippingTemplateController                   | seller 商家地址与运费模板                                                                                                                                                             |
| `/admin/auth/*`                                 | account          | StaffAuthController                                                          | admin 登录页（工号 + 密码，kind=staff）——seller 走 `/auth`，不是这里                                                                                                                  |
| `/admin`（裸）                                  | account、product | AdminAccountController（用户/员工）/ CategoryAttrAdminController（属性模板） | admin accounts 两页与类目属性                                                                                                                                                         |
| `/admin/shops`                                  | shop             | AdminShopController                                                          | admin 店铺治理（封店/解封）                                                                                                                                                           |
| `/admin/reviews`                                | **shop**         | ReviewController（入驻审核队列，SHOP_REVIEW）                                | admin 入驻审核——**与商品评价无关**，商品评价没有平台侧前缀                                                                                                                            |
| `/admin/categories`                             | product          | CategoryAdminController                                                      | admin 平台类目                                                                                                                                                                        |
| `/admin/cms`                                    | cms              | CmsContentAdminController（CMS_MANAGE）                                      | admin CMS 三页                                                                                                                                                                        |
| `/admin/coupons`                                | coupon           | AdminCouponController                                                        | admin 券运营（查询 / 作废）                                                                                                                                                           |
| `/admin/logistics` `/admin/logistics/issues`    | logistics        | AdminLogisticsController / AdminShipmentIssueController                      | admin 物流异常处置与轨迹补录                                                                                                                                                          |
| `/admin/audits`                                 | audit            | AdminAuditController                                                         | admin 操作审计（按人 / 对象 / 时间反查 + 导出）                                                                                                                                       |

判权与权限码表见 [docs/conventions/permission-codes.md](conventions/permission-codes.md)。

## 8. 文档地图

入口只有一个：[docs/README.md](README.md)——按「我要做什么」分流。本节不再维护第二份索引。

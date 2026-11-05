# 后端（apps/server）

Spring Boot 4.1 + Spring Modulith 的模块化单体。**当前处于重写期**：只落了地基，还没有业务模块。

## 怎么跑

```bash
docker compose -f compose.dev.yml up -d      # PG 18 + Redis，别的 profile 按需
pnpm dev:server                              # 或 mvn -f apps/server/pom.xml spring-boot:run
pnpm test:server                             # mvn test，需要上面那个库跑着
```

首次启动会自动建本地种子账号（商家 + 店铺 + 主账号 `boss`），密码取自 `apps/server/.env` 的 `SHOP_SEED_PASSWORD`。
没设这个变量就不建——它是研发本地的脚手架，不是生产后门。

## 目录

```
src/main/java/com/shop/platform/
├── common/     纯契约：发号、事件接口、错误码词表、校验规则词表、Money
├── infra/      基础设施：web（错误处理/请求 id）、security（认证与判权）、event（消费去重）
├── audit/      模块：操作审计（平台能力里唯一有自己表的）
├── account/    模块：买家账号（注册 / 登录 / 我是谁）
├── seller/     模块：商家、店铺、子账号、角色与授权
├── clearing/   模块：资金账务（账户 / 分录组 / 分录）
├── governance/      模块：售卖资格（状态 / 类目授权 / 品牌授权 / 资质）
├── catalog/    模块：类目、属性、品牌、SPU/SKU、listing 发布
├── inventory/  模块：单账本库存（四科目 / 预占 / 流水）
├── promotion/  模块：只有 api 契约（AppliedRule / PromotionQuery），规则表未做
├── pricing/    模块：算价（五层流水线 / 报价单证据 / 最大余数法）
├── trade/      模块：订单三层（落单 / 取消 / 详情 / 发货签收回写）
├── fulfillment/ 模块：包裹（发货 / 拆包 / 签收 / 发货时效任务）
├── payment/    模块：支付单（mock / 支付宝，不引 SDK）
├── returns/    模块：售后（仅退款 / 退货退款 / 商家处理 / 退款执行）
├── cart/       模块：购物车与收藏夹
├── logistics/  模块：物流轨迹（承运商推送验签 / 三端查询）
├── media/      模块：素材（七牛直传凭证）
└── staff/      模块：平台员工身份
```

模块与 schema 一一对应，模块内部只住 `controller / dto / service / model / mapper / api / events / internal`。
完整蓝图见 [module-map.md](../../docs/domain/module-map.md)，各目录的职责见同级的 `README.md`。

## 买家主链路（已能用 curl 跑通）

```bash
POST /api/buyer/register            # 注册，直接返回令牌
POST /api/buyer/login               # 登录
GET  /api/buyer/me                  # 我是谁

POST /api/buyer/quotes                    # 算价 → quoteId（不带价格、不带商家）
POST /api/buyer/orders                    # 落单，带 quoteId（不带任何金额）
GET  /api/buyer/orders/{id}               # 详情，三层一次返回
GET  /api/buyer/orders?limit=20&status=&cursor=   # 我的订单，游标分页 + 展示态筛选，走主库
POST /api/buyer/orders/{id}/cancel        # 未付款时取消
POST /api/buyer/orders/{id}/pay           # 发起支付，金额由 trade 从订单读（入口在 orders 不在 payments）

POST /api/buyer/payments/{id}/confirm     # 查单（mock 渠道立刻成功）

GET  /api/buyer/orders/seller-orders/{id}/shipments   # 这一单发了哪些包裹（fulfillment）
POST /api/buyer/orders/packages/{id}/receive          # 确认收货（fulfillment，按包裹）

POST   /api/buyer/favorites/{spuId}      # 收藏（幂等：201=新收，200=已收过）
DELETE /api/buyer/favorites/{spuId}      # 取消收藏（幂等，未收藏也 204）
GET    /api/buyer/favorites?cursor=&limit=  # 我的收藏，下架商品置灰保留
POST   /api/buyer/favorites/exists       # 批量查「这些商品我收藏了吗」（详情页心形 / 卡片小红心）

GET    /api/buyer/catalog/standard-products/{id}/offers  # 同款比价（按 sku.identity_key 分组）
```

> **发起支付的入口在 `orders` 不在 `payments`。** 因为要先知道"该付多少"，而那只有订单持有者
> trade 知道；payment 一旦回查 trade 就成环（`payment → trade.api` + `trade → payment.events`）。
> 所以 trade 算金额、payment 收钱，依赖单向。详见
> [module-map.md](../../docs/domain/module-map.md) 第 6 节。

卖家侧：

```bash
POST /api/seller/login
POST /api/seller/products
POST /api/seller/products/{spuId}/listings

GET    /api/seller/products?status=&keyword=&cursor=&limit=  # 我的商品列表（任何状态，含草稿与驳回）
GET    /api/seller/products/{spuId}/stock    # 库存页：每个 SKU 的四科目
PUT    /api/seller/products/{spuId}/stock     # 改库存（批量覆盖实物/安全库存，带 requestId 幂等键）
GET    /api/seller/products/{spuId}          # 卖家详情（任何状态可读，含草稿与停售 SKU）
PUT    /api/seller/products/{spuId}          # 改基本信息（改已上架的会退回审核）
PUT    /api/seller/products/{spuId}/skus     # 改 SKU 价/重/停售（全量替换，没给的一律停售）
POST   /api/seller/products/{spuId}/offline  # 商家主动下架（只有 online 能下）
POST   /api/seller/products/{spuId}/relist   # 重新提交（回 pending，不直接回 online）
DELETE /api/seller/products/{spuId}          # 删草稿（只有从没提交过挂售的能删）

GET  /api/seller/orders?status=&cursor=&limit=      # 我的订单（按子单），展示态轴是履约不是支付
GET  /api/seller/orders/{sellerOrderId}            # 详情，手机号已脱敏
POST /api/seller/orders/{sellerOrderId}/receiver-phone  # 发货用完整手机号（唯一给的入口）
POST /api/seller/orders/{sellerOrderId}/shipments   # 发货（可分批，每批一个包裹）
GET  /api/seller/orders/{sellerOrderId}/shipments   # 已发的包裹

GET  /api/seller/standard-products                   # 挂靠候选（只出可用的）
PUT  /api/seller/standard-products/products/{spuId}  # 挂靠 / 取消挂靠（传 null 即取消）
GET  /api/seller/standard-products/{id}/bound-count  # 本店有多少商品挂在这个标准品上
```

售后（同一资源在两个分区下是不同入口，买家申请、商家裁决）：

```bash
POST /api/buyer/returns                       # 申请售后（仅退款 / 退货退款）
GET  /api/buyer/returns?cursor=&limit=        # 我的售后单
GET  /api/buyer/returns/{caseId}              # 售后详情
POST /api/buyer/returns/{caseId}/cancel       # 撤销申请
POST /api/buyer/returns/{caseId}/ship-back    # 退货寄回（填运单号）

GET    /api/seller/returns?status=&cursor=    # 本店的售后单
GET    /api/seller/returns/{caseId}           # 详情
POST   /api/seller/returns/{caseId}/approve   # 同意（ReturnApproved → payment 执行退款）
POST   /api/seller/returns/{caseId}/reject    # 拒绝
POST   /api/seller/returns/{caseId}/receive   # 收到退货
POST   /api/seller/returns/{caseId}/confirm-refund  # 确认退款（带 Idempotency-Key）
```

**卖家订单列表补的是一个断掉的入口，不是一个新功能。** 在它之前发货与看包裹都要
`{sellerOrderId}`，而商家没有任何办法拿到那个 id——接口都在，入口没有，整条发货链路在前端不可达。

两边不合成一个「看身份分流」的接口，因为**展示态轴不同**：买家关心「付没付 / 退没退」
（`payment_status`），卖家关心「要不要发货 / 发到哪一步」（`fulfillment_status`）。
列表粒度也不同：买家看订单组（一次下单是一个整体），卖家看子单（一个买家跨三家店下单，
三家各看自己那份）。详见 [trade/README.md](src/main/java/com/shop/platform/trade/README.md)。

平台侧：

```bash
GET   /api/admin/buyers?status=&keyword=&cursor=    # 买家列表（手机号掩码）
PATCH /api/admin/buyers/{buyerId}/status            # 封禁 / 解封（BUYER_MANAGE，封禁同步吊销全端会话）

GET  /api/admin/standard-products?categoryId=&keyword=&includeMerged=
POST /api/admin/standard-products/{sourceId}/merge?targetId=  # 标准品合并（PRODUCT_REVIEW）
```

标准品是 `catalog.spu` 里 `spu_type = 'standard'` 的行，没有独立表。合并态靠
`merged_into IS NOT NULL` 表达，没有 status 列——加一个就是它的同义词，只多一处会漂的地方。

`/api/orders/**` 下有两段：订单本身在 `trade`，包裹与签收在 `fulfillment`。
分成两处是因为模块依赖只能单向——放一起会让 `trade → fulfillment → trade` 成环。

三条贯穿全链路的规矩：

1. **金额从不经过前端。** 算价自己去 catalog 取价，落单只认 `quoteId`，支付从订单读应付，
   发货数量上限由 trade 算（`quantity - shipped_qty`）。任何一处相信前端传的数，前面几步就都白做了。
2. **`buyerId` / `merchantId` 一律从令牌来。** 请求体里没有这两个字段——让前端传就等于允许替别人下单、替别人发货。
   越权统一回 404 而不是 403，否则 403 本身就是"这个 id 存在"的确认。
3. **状态迁移全是条件更新。** 影响 0 行是判决，不是异常：取消与支付抢同一行、重复签收、重复回调，
   都靠这个判定，不靠先查后改。

## HTTP 面的约定

**URL 分区按调用方身份，不按实现模块。** `/api/buyer/**` 买家、`/api/seller/**` 商家、
`/api/admin/**` 平台（员工管理也在 `/api/admin/staff`，员工登录是自己的事在 `/api/staff/login`）。
渠道回调与承运商推送不在这个分区里：`/api/payments/notify/**`、`/api/logistics/carriers/**`，
它们对所有人开放，靠验签不靠登录。同一资源在不同分区下是不同入口（买家和商家各看各的售后），
不合成"看身份分流"的万能接口。

**没有版本前缀，这是立场不是疏漏。** API 只承诺同仓的三端 SPA：前后端同一次提交里生成契约
（`@shop/api`）与代码，不存在部署节奏错开的客户端，加 `/v1` 只是给每个 URL 白付一段前缀。
等出现异构客户端（开放平台、独立 App）那一天再引版本，届时旧路径由网关映射而不是现在预埋。

**列表一律游标分页。** 响应是 `{ items, nextCursor }`，`nextCursor` 为 null 就是最后一页；
游标是 `(created_at, id)` 复合键的 base64url——只按时间比会串同一毫秒的行。查询参数 `limit`
（服务端 clamp 到 1–100）、筛选词表服务端校验（筛错词回 400，不放进去变成永远空页）。

**资金类写操作带 `Idempotency-Key`。** `pay` / 商家确认退款 / 挂账退款支持该头：重试原样返回
第一次的响应（Redis 存 24h），处理中同键并发回 409 `IDEMPOTENCY_IN_PROGRESS`。没带键也能跑，
靠状态机 CAS 兜底——但重试只能拿到 409，拿不回结果。

**查询参数与路径的分工。** 按资源 id 查走路径段，按业务键查走 query
（`GET /api/buyer/payments?outTradeNo=`）。「设默认地址」这类开关是
`PATCH /api/buyer/addresses/{id}`（body 带 `isDefault`），不是对子资源 PUT/DELETE。

**错误 detail 是诊断文案，不是用户文案。** 用户看得懂的话由前端按 `code`（和 status）解析，
后端不做 `Accept-Language` 协商——detail 会进日志和第三方联调记录，写成中文句子正好。
这条是立场：等出现"要把 detail 直接展示给用户"的客户端时再翻案。

**公开读接口有缓存与配额。** 商品详情回 `Cache-Control: max-age=30`（价格/库存的短漂移可接受，
扣减和算价都在下单链路上），并按操作者限流（超了回 429）。

## 三十一个模块，十三个有代码

目录按 module-map 的蓝图一次建全：**31 个模块 = 31 个顶层包 = 31 个 schema**，每个目录有自己的
`README.md`，头部是一段机器可读的 yaml（层、schema、状态、依赖、发/收事件）。

比蓝图多出的是 `staff`（平台员工身份，有自己的表）与 `cart` 里的收藏夹（主分支有、蓝图漏列）。

六档的分布是：核心域 11 / 支撑域 6 / 通用域 4 / 平台能力 2 / **暂存 1**（`cart`）/ **无域 7**。
后两档是 module-map §5.1 与 §5.2 新立的：`cart` 有独有数据但无不变式、无外部依赖，是暂存；
`search` / `analytics` / `logistics` / `media` / `review` / `content` / `cms` 的数据不在自己手里
（别人的投影 / 外部系统的适配 / 用户的创作），是无域。它们仍然是模块，只是不算业务能力。

现在有代码的 17 个：`audit` / `seller` / `clearing` 是完整实现，`media` 部分开工（七牛直传凭证），
`account` / `catalog` / `governance` / `inventory` / `promotion` / `pricing` / `trade` / `fulfillment` /
`payment` / `returns` / `cart` / `logistics` / `staff` 是进行中，其余 14 个还是形状。

```bash
pnpm modules:check     # 读全部 README 的 yaml 块，检查模块图闭不闭合
```

它核六件事：schema 唯一、`depends_on` 不悬空、模块级无环、事件双向闭合、`layer` 必须是六档之一、
暂存档不许被别人依赖。前五件是硬错（退出码非零），事件缺口只报告——
把「还没设计」写成「已经设计」，比缺口本身更坏。

## 四道守卫（都跑在 `mvn test` 里）

1. **原生 SQL 只出现在四类包**：`common` / `infra` / `api` / `mapper`。绕过了数据范围和审计就没意义。
2. **模块内部只住在蓝图那八个子包**。想加子包，先改文档。
3. **错误码注册表与 Java 常量双向对拍**：`contracts/error-codes.yaml` ⇄ `ErrorCodes`。
4. **权限点四方对拍**：`contracts/permissions.yaml` ⇄ `Permission` 枚举 ⇄ `common.permission` 表
   ⇄ 前端生成物。库 ⇄ 枚举那一环由 `Authorizer` 启动时校验（更早、更难绕），
   其余由 `PermissionVocabularyTest` 一条测试全核。

启动时另有两道**跨域**校验，它们不看枚举只看库：

- **跨域授予**：卖家侧不能持有 admin 域的点，平台侧不能持有 seller 域的点。
  这条不是理论洁癖——`SellerOperatorResolver` 曾经给卖家主账号授的是整张 `common.permission` 表，
  于是一个店主拿到了 `SUSPENSE_MANAGE`（手动退真钱）与 `LEDGER_VIEW`（全平台余额）。
- **高危误授**：`risk_level = 'high'` 的点（动钱出口）只许 `SUPER_ADMIN` 持有。

## 闭环状态

按淘宝那套模型去要求，八个环闭上了六个，剩两个断着。这不是缺陷清单，是**接下来的路线**。

| #   | 环       | 已经到哪                                                                                                                                                    | 断在哪                                                                                                                              |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 资金     | 支付回调 → 记账 → 结算 → 打款全链已通，对账与断裂告警在跑                                                                                                   | 打款渠道是 mock（记账照记，钱不出门）；接真渠道时换 `channel` 与回执来源                                                            |
| 2   | 认证     | 登录发令牌、刷新令牌（三端各有 `/refresh`）、验签、判权、停用即拒                                                                                           | —                                                                                                                                   |
| 3   | 事件     | 同事务落库、消费去重、**逐事件行认领**（`EventInbox.claim`）、失败补发、卡住告警                                                                            | —                                                                                                                                   |
| 4   | 审计     | 记录器 + 只追加表 + 清单；六个模块在调：`account` / `catalog` / `governance` / `promotion` / `seller` / `staff`                                             | 订单 / 资金 / 售后侧（`trade` / `payment` / `fulfillment` / `returns` / `inventory`）一条没接；也没有「哪些接口必须审计」的强制检查 |
| 5   | 数据范围 | `checkShop` 显式调用；买家侧归属校验下沉到 service                                                                                                          | 没有查询层强制，漏调不报错，只安静放行                                                                                              |
| 6   | 错误码   | Java 侧与 TS 侧都已对拍（`ErrorCodeVocabularyTest` / `shared-vocabulary.test.ts`）、ProblemDetail 契约                                                      | 注册表里不少的码还没有抛出点                                                                                                        |
| 7   | 会计期间 | 分录有 `effective_date` 列                                                                                                                                  | 没有日切机制决定「业务日期」是谁，跨日冲正会落错期间                                                                                |
| 8   | 下单     | 全链路 HTTP 入口；支付 / 退款 / 落单事件有人消费（记账 / 履约 / 售后）；超时任务全接（发货时效 / 自动收货 / 预占过期 / 售后时限）；物流轨迹有承运商推送入口 | —                                                                                                                                   |

另外三件属于「知道没做，不算断」：分库分表、读写分离、消息队列。判据写在
[database.md](../../docs/domain/database.md) 第 6 节，不到就不上。

## 文档

- 模型与蓝图：[docs/README.md](../../docs/README.md)（唯一索引）
- 目录级说明：各目录下的 `README.md`，只讲「这里放什么、别放什么、怎么加东西」
- 为什么这么设计：`docs/domain/` 下的五份

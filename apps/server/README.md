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
├── trust/      模块：售卖资格（状态 / 类目授权 / 品牌授权 / 资质）
├── catalog/    模块：类目、属性、品牌、SPU/SKU、offer 发布
├── inventory/  模块：单账本库存（四科目 / 预占 / 流水）
├── promotion/  模块：只有 api 契约（AppliedRule / PromotionQuery），规则表未做
├── pricing/    模块：算价（五层流水线 / 报价单证据 / 最大余数法）
├── trade/      模块：订单三层（落单 / 取消 / 详情 / 发货签收回写）
├── fulfillment/ 模块：包裹（发货 / 拆包 / 签收 / 发货时效任务）
└── payment/    模块：支付单（mock / 支付宝，不引 SDK）
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
```

> **发起支付的入口在 `orders` 不在 `payments`。** 因为要先知道"该付多少"，而那只有订单持有者
> trade 知道；payment 一旦回查 trade 就成环（`payment → trade.api` + `trade → payment.events`）。
> 所以 trade 算金额、payment 收钱，依赖单向。详见
> [module-map.md](../../docs/domain/module-map.md) 第 6 节。

卖家侧：

```bash
POST /api/seller/login
POST /api/seller/products
POST /api/seller/products/{spuId}/offers
POST /api/seller/orders/{sellerOrderId}/shipments   # 发货（可分批，每批一个包裹）
GET  /api/seller/orders/{sellerOrderId}/shipments   # 已发的包裹
```

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

## 三十个模块，十一个有代码

目录按 module-map 的蓝图一次建全：**30 个模块 = 30 个顶层包 = 30 个 schema**，每个目录有自己的
`README.md`，头部是一段机器可读的 yaml（层、schema、状态、依赖、发/收事件）。

现在有代码的 11 个：`audit` / `seller` / `clearing` 是完整实现，`account` / `catalog` / `trust` /
`inventory` / `pricing` / `trade` / `fulfillment` / `payment` 是骨架（买家身份、商品发布、售卖资格、
库存预占与释放、算价与报价单、落单与关单、包裹与签收、支付与回调），其余 19 个还是形状。

```bash
pnpm modules:check     # 读全部 README 的 yaml 块，检查模块图闭不闭合
```

它核四件事：schema 唯一、`depends_on` 不悬空、模块级无环、事件双向闭合。前三件是硬错（退出码非零），
第四件只报告——把「还没设计」写成「已经设计」，比缺口本身更坏。

## 三道守卫（都跑在 `mvn test` 里）

1. **原生 SQL 只出现在四类包**：`common` / `infra` / `api` / `mapper`。绕过了数据范围和审计就没意义。
2. **模块内部只住在蓝图那八个子包**。想加子包，先改文档。
3. **错误码注册表与 Java 常量双向对拍**：`contracts/error-codes.yaml` ⇄ `ErrorCodes`。

## 闭环状态

按淘宝那套模型去要求，八个环里闭上了一个（事件），其余七个还断着。这不是缺陷清单，是**接下来的路线**。

| #   | 环       | 已经到哪                                                               | 断在哪                                                     |
| --- | -------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | 资金     | 分录能记、守恒可验、冲正可做                                           | 支付回调 → 清算单 → 结算单 → 打款，四段全缺，钱出不去      |
| 2   | 认证     | 登录发令牌、验签、判权、停用即拒                                       | 没有刷新令牌，access 到期只能重新登录                      |
| 3   | 事件     | 同事务落库、消费去重、失败补发、卡住告警                               | 多实例缺数据库锁，会重复投递                               |
| 4   | 审计     | 记录器 + 只追加表 + 清单；`catalog` 在调它                             | 只有商品发布在写审计，库存调整与订单还没接                 |
| 5   | 数据范围 | `checkShop` 显式调用；买家侧归属校验下沉到 service                     | 没有查询层强制，漏调不报错，只安静放行                     |
| 6   | 错误码   | Java 侧对拍、ProblemDetail 契约                                        | TS 侧没对拍；注册表里大半的码还没有抛出点                  |
| 7   | 会计期间 | 分录有 `biz_date` 列                                                   | 没有日切机制决定「业务日期」是谁，跨日冲正会落错期间       |
| 8   | 下单     | 注册 → 算价 → 落单 → 支付 → 发货 → 签收 → 交易完成，全链路有 HTTP 入口 | 支付与退款事件没人消费；超时任务没接调度；没有物流轨迹回写 |

另外三件属于「知道没做，不算断」：分库分表、读写分离、消息队列。判据写在
[database.md](../../docs/domain/database.md) 第 6 节，不到就不上。

## 文档

- 模型与蓝图：[docs/README.md](../../docs/README.md)（唯一索引）
- 目录级说明：各目录下的 `README.md`，只讲「这里放什么、别放什么、怎么加东西」
- 为什么这么设计：`docs/domain/` 下的五份

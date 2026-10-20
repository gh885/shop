# 平台型商城模块地图（范本）

> 适用于「一个平台、多个独立商家」的零售商城，规模按淘宝/天猫级别设计：
> 多模式履约、多玩法定价、平台治理、资金清分、风控与争议并存。
>
> 这份文档只定**边界**，不定实现。改边界 = 改架构，先过 ADR。

## 0. 一条判据

**一个模块 = 一组只被它写的核心表。**

拆模块时不问"业务上像不像一类"，只问三句：

1. 这张表有不变式吗？（金额要对平、状态不能倒退、库存不能为负）
2. 谁写它？如果有第二个写者，这两个模块迟早要合。
3. 不拆会怎样？答不出具体故障，就不拆。

由此得出**不进域**的三类东西：读侧投影（搜索、推荐、报表）、技术适配（渠道 SDK、承运商、存储）、内容与 UGC（评价、图文、直播）。它们只需要模块边界，不需要域边界。

## 1. 四层

| 层       | 判据                           | 能不能外采                     |
| -------- | ------------------------------ | ------------------------------ |
| 核心域   | 有不变式，写错就是钱或合规事故 | 不能                           |
| 支撑域   | 流程必需，但规则可标准化       | 部分可以（支付通道、物流轨迹） |
| 通用域   | 与业务差异化无关               | 优先外采                       |
| 平台能力 | 横切所有模块的技术底座         | 可以，但边界要自己定           |

## 2. 核心域（12）

| 模块          | 职责                                                             | 核心表                                                                           | 写者                                 |
| ------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------ |
| `catalog`     | 类目树、属性模板、SPU/SKU、品牌、发布状态                        | `category` `attribute` `spu` `sku` `listing`                                     | 平台（发布/类目）+ 商家（草稿/报价） |
| `pricing`     | 算价：活动价、会员价、阶梯价、平台补贴叠加，输出成交价与优惠分摊 | `price_rule` `calc_trace`                                                        | 平台（规则）+ 系统（计算）           |
| `promotion`   | 券、满减、秒杀、拼团、预售的活动定义与额度                       | `campaign` `coupon_stock` `coupon_instance`                                      | 平台（规则）+ 买家（领取）           |
| `trade`       | OrderGroup / SellerOrder、拆单、履约状态机、超时撤销             | `order_group` `seller_order` `order_line`                                        | 买家（创建）+ 系统（流转）           |
| `inventory`   | 多仓/门店/预售/共享库存，ATP 与预占                              | `stock` `reservation` `stock_log`                                                | 系统（唯一写者）                     |
| `fulfillment` | 包裹、发货时效、自提、同城配送                                   | `package` `ship_task` `delivery_slot`                                            | 商家（发货）+ 系统                   |
| `clearing`    | 账本、清分、商家余额、打款、红字冲正、对账                       | `ledger_entry` `seller_balance` `payout_order`                                   | 系统（唯一写者）                     |
| `trust`       | 商家分层、类目授权、资质有效期、违规扣分、冻结、费率模板         | `seller_profile` `category_grant` `credential` `violation` `commission_template` | 平台                                 |
| `returns`     | 仅退款、退货退款、换货、逆向物流                                 | `after_sale_case` `return_shipment`                                              | 买家（申请）+ 平台/商家（裁决）      |
| `dispute`     | 平台介入、仲裁、举证、大众评审                                   | `dispute_case` `evidence` `ruling`                                               | 平台                                 |
| `risk`        | 刷单、套现、黄牛、盗号、内容风控                                 | `risk_event` `rule_set` `decision_log`                                           | 系统                                 |
| `search`      | 索引构建、召回、排序、类目导航                                   | `index_doc` `query_log`                                                          | 系统（投影，只读源数据）             |

`search` 是核心域但**不持有交易数据**：它只有投影，坏了就降级到类目浏览。核心 ≠ 写侧。

## 3. 支撑域（10）

| 模块        | 职责                                             | 边界关键                                    |
| ----------- | ------------------------------------------------ | ------------------------------------------- |
| `seller`    | 入驻申请、主体与资质材料、结算账户、子账号与角色 | 身份与打款验证委托持牌机构，不自建 KYC 全套 |
| `cart`      | 购物车、凑单、失效标记                           | 只存选购意图，不锁价不锁库存                |
| `payment`   | 支付单、渠道聚合、回调、退款、渠道分账单         | 不做分账计算；只认"钱到账"这一事实          |
| `logistics` | 承运商对接、电子面单、轨迹回传                   | 纯技术适配 + 轨迹，不含履约状态机           |
| `review`    | 评价、追评、问大家、买家秀                       | UGC，聚合分回给 `catalog` 做排序输入        |
| `member`    | 等级、积分、权益、会员价资格                     | 只产出资格，不参与算价                      |
| `funding`   | 保证金、账期、授信、商家贷                       | 资金方的债权，不进交易账本                  |
| `invoice`   | 电子发票开具、红冲、抬头管理                     | 税务口径独立于 `clearing` 的账本            |
| `ad`        | 广告位、竞价、计费、效果归因                     | 计费结果进 `clearing`，不反向写订单         |
| `content`   | 图文、短视频、直播、种草                         | 内容是流量入口，不承载交易事实              |

`ad` 在成熟平台是主要营收，但它只依赖 `clearing` 计费，边界清楚，可以独立深化。

## 4. 通用域（7）

| 模块           | 职责                           | 建议                       |
| -------------- | ------------------------------ | -------------------------- |
| `account`      | 买家账号、登录方式、安全设置   | 账号主体自建，登录方式外采 |
| `notification` | 站内信、短信、推送、订阅       | 外采通道，自建模板与频控   |
| `im`           | 买卖家会话、消息、敏感词       | 优先外采，会话留痕自建     |
| `ticket`       | 客服工单、流转、SLA            | 可外采                     |
| `cms`          | 页面搭建、店铺装修、活动落地页 | 自建 schema，渲染可外采    |
| `media`        | 图片/视频上传、转码、CDN       | 全部外采                   |
| `analytics`    | 报表、漏斗、商家看板           | 只消费事件，不产生业务写入 |

## 5. 平台能力（7）

`authz`（授权）、`audit`（操作留痕）、`config`（配置与 AB）、`idgen`（发号）、`scheduler`（定时调度）、`gateway`（入口与限流）、`observability`（日志/指标/链路）。

这些没有业务不变式，但**边界必须自己定**，尤其两条：

- `authz` 要支持三套主体：买家、商家子账号、平台运营。三套的越权口径不同，不能共用一张角色表。
- `audit` 的写入不能依赖业务模块"记得调用"，要在框架层拦截。

## 6. 依赖方向

层间只向下依赖，同层内按业务流单向：

```
平台能力  ← 被所有层依赖，不依赖任何业务模块
通用域    → 平台能力
支撑域    → 通用域 + 核心域（只读 api）
核心域    → 平台能力 + 通用域 + 少量支撑域
```

核心域内部的 DAG：

```
catalog  ← pricing ← promotion
   ↑          ↑         ↑
   └──────────┴─────────┴── trade ──→ inventory
                              │
                              ├──→ fulfillment
                              ├──→ returns ──→ dispute
                              └──→ clearing ←── payment
                                     ↑
                                    risk / trust
```

三条必须遵守的方向约束：

1. **`trade` 不调 `payment`，`payment` 不调 `trade`。** 支付单入口在 `payment`，`PaymentSucceeded` 到达后由 `trade` 校验金额，不等即拒收并告警。
2. **`trade` 不调 `clearing`。** 费率模板归 `trust`（商业条款），下单时钉快照；`clearing` 只执行不定义。
3. **反向影响走 api 命令，不靠监听。** 发货写回订单用 `TradeCommand.recordShipment`；售后徽标写回用 `TradeCommand.syncAfterSaleBadge`。互相监听一定会成环。

## 7. 事件契约

约定：

- 命名 `<聚合><过去式>`，金额一律 `Money(amount, currency)`
- 消费方幂等键：业务主键 + 事件类型，落唯一索引
- 投递走事务性 outbox（事件与业务数据同事务落库），不直发 MQ
- 只发"已经发生的事实"，需要对方回结果的走 api

### 商品与定价

```java
SellerOfferSubmitted(offerId, sellerId, skuId, price, submittedAt)
OfferPublished(offerId, sellerId, skuId, categoryId, price)      // → 搜索索引
OfferOffline(offerId, reason)
PriceRulePublished(ruleVersion, effectiveAt)
```

### 交易

```java
SellerOrderPlaced(orderGroupId, sellerOrderId, sellerId, lines,
                  merchandise, shipping, discountAllocated,
                  commissionBase, rateVersion, placedAt)         // → clearing
OrderPaid(orderGroupId, paymentId, paidAmount, sellerOrders, paidAt)  // → clearing, fulfillment
OrderCancelled(orderGroupId, sellerOrderId, reason, cancelledAt)      // → inventory, promotion
```

`SellerOrderPlaced` 是最关键的一个：它把下单瞬间的金额构成、优惠分摊、费率版本一次钉死，下游只认快照，不回查。

### 资金

```java
PaymentSucceeded(paymentId, orderGroupId, amount, channel, channelTxnId, paidAt)
PaymentFailed(paymentId, orderGroupId, reason)
RefundSucceeded(refundId, paymentId, orderGroupId, amount, refundedAt)
ChannelSplitSettled(channelBatchId, entries, settledAt)           // 渠道分账回执
SplitPosted(orderGroupId, entries, balances)                      // 账本内部事实
ReconciliationBroken(bizDate, diff, sampleEntryIds)               // 对账断裂，进告警
```

### 治理与售后

```java
SellerSuspended(sellerId, scope, reason, until)
CategoryGrantRevoked(sellerId, categoryId)
CredentialExpired(sellerId, credentialType)
ReturnApproved(caseId, sellerOrderId, refundAmount, shippingRefund)
DisputeResolved(caseId, sellerId, ruling, amount)
```

`inventory` 与 `promotion` **不发事件**：预占、释放、券占用、核销都是同事务同步调用，广播只会制造"预占成功但订单已取消"的竞态。

## 8. 代码形态

### 8.1 平铺，层不进路径

**模块 = 顶层包 = schema，三者一对一。**

框架按应用的直接子包识别模块。写成 `core/trade`，被识别的模块是 `core`，`trade` 降级成它的普通子包：`allowedDependencies` 失守、schema 塌成 `core`、整张地图作废。

层是标签，不是目录。为了"看着整齐"破坏这个一对一关系，代价远大于收益。

### 8.2 层在哪三处表达

1. **声明上**：`package-info.java` 的 `displayName` 带层标，`@ApplicationModule(displayName = "Trade [core]", allowedDependencies = …)`
2. **校验上**：一条层序检查——通用域不许依赖核心域，平台能力不许依赖业务域；数据从模块图读，不维护包名清单
3. **文档上**：本文第 2–5 节的分组

代码里不出现 `core` / `support` / `generic` 这类词。

### 8.3 目录

```
com/shop/platform/
├── common/                 平台能力：纯契约、Money、校验、发号
├── infra/                  平台能力：缓存、DB、安全、网关、可观测、调度
├── audit/                  平台能力，但它有自己的表，所以是模块
│
├── catalog/                ┐
├── pricing/                │
├── promotion/              │
├── trade/                  │
├── inventory/              │ 核心域 12
├── fulfillment/            │
├── clearing/               │
├── trust/                  │
├── returns/                │
├── dispute/                │
├── risk/                   │
├── search/                 ┘
│
├── seller/                 ┐
├── cart/                   │
├── payment/                │
├── logistics/              │
├── review/                 │ 支撑域 10
├── member/                 │
├── funding/                │
├── invoice/                │
├── ad/                     │
├── content/                ┘
│
├── account/                ┐
├── notification/           │
├── im/                     │ 通用域 7
├── ticket/                 │
├── cms/                    │
├── media/                  │
└── analytics/              ┘
```

**一条规则决定谁是模块：有没有自己的 schema。** 平台能力 7 个里只有 `audit` 有表，所以只有它是模块；`authz` / `config` / `idgen` / `scheduler` / `gateway` / `observability` 全进 `common` 和 `infra` 共享包，否则每个模块都要在 `allowedDependencies` 里重复登记它们。

### 8.4 模块内部

```
<module>/
├── package-info.java     模块声明 + 允许依赖
├── controller/           REST 入口，一个 handler 只调一个 service 方法
├── dto/                  XxxRequest / XxxQuery
├── service/              编排 + 出参形状
├── model/                聚合、值对象、状态机
├── mapper/               Entity + Mapper
├── api/                  对外同步入口：XxxReadQuery / XxxCommand
├── events/               出站事件
└── internal/             渠道 SDK、文件解析、读模型（外部不许 import）
```

- **按需创建，不预建空目录。** 薄模块可能只有 `controller/ service/ internal/`，没有 `model/` 和 `api/`，这是正常的
- 外部只能 import `api/` 与 `events/`，其余字节码级拒绝
- `api/` 只放两类：按 ID 点查、同事务命令。带谓词或排序的查询不放进来
- `events/` 只放过去式通知。需要对方回结果的，走 api，不发事件

### 8.5 什么时候才该物理分层

只有三种情况值得把层写进路径：多仓库多团队（每层一个构建单元）、层要独立部署、层要独立发布节奏。

这些时候层已经不是标签而是边界了，而边界本来就该由模块表达——所以**仍然不用目录表达**。判断依据见第 11 节。

## 9. 铁律

1. **金额只有 `clearing` 写。** 任何模块不许 UPDATE 余额，只能发事件或调 `clearing :: api`。
2. **算价只有 `pricing` 算。** 其他模块不许自己乘除折扣，不许复制优惠叠加规则。
3. **发布权只有 `catalog` 给。** 商家只能提草稿，平台给上架。
4. **治理判定只有 `trust` 给。** 能不能卖这个类目、资质过没过期、是否被冻结，只有一个出口。
5. **读侧可降级，写侧不可跨域。** 搜索、推荐、报表挂了不影响下单；但任何模块都不许写别人的表。

## 10. 横切约束

**多租户。** 隔离维度是运营主体、区域、业务线（淘宝/天猫/国际），不是商家。商家是数据归属列 `merchant_id`，两者正交。用 `merchant_id` 当租户 ID，跨商家搜索和平台运营视图会永远是后门。

**金额。** 全链路一个形状：`Money(amount, currency)`，落库 `(amount, currency)` 列对 + `CHECK`。禁止裸 int64 和浮点。

**时间。** 所有资金动作归"业务日期"（日切），不归自然时间。跨日切的冲正必须落在正确的会计期间。

**幂等。** 清分入口用 `业务单号 + 清分类型` 分布式锁 + 数据库联合唯一索引双保险；事件消费用业务键去重。

**一致性。** 同事务内能解决的走 api 命令（冻库存、写回投影列）；跨模块影响走事件 + 补偿。**没有跨模块分布式事务。**

## 11. 规模化的四个开关

单体不是妥协，是默认。只有出现下面四个信号之一，才把模块拆成独立部署：

| 信号         | 判据                                  | 拆谁             |
| ------------ | ------------------------------------- | ---------------- |
| 伸缩曲线分叉 | 某个模块的峰值 QPS 是主链的 10 倍以上 | 搜索、推荐、广告 |
| 团队规模     | 一个模块需要 3 个以上团队同时改       | 交易、商品       |
| 合规隔离     | 数据主权或审计要求单独存储            | 清结算、资金     |
| 故障域       | 它挂了不能拖垮下单                    | 搜索、推荐、通知 |

**反过来说：一个模块如果四条都不满足，拆出去只换来网络跳数和一致性成本。**

拆出去之后，订单按买家分片，商家侧查询走异构索引；这是分片键和查询模式的取舍，不是模块边界问题。

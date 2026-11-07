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

这三类不是被扔掉，而是有自己的档位：第 5.2 节「无域」。它们仍然是模块（有自己的 schema），
但不是业务能力。而 `cart` 这类「有独有数据但没不变式」的，归第 5.1 节「暂存」。
两档加起来解释了为什么 30 个模块不是全都有「域」。

## 1. 六个档位

上面第 3 句判据（「不拆会怎样」）回答的是**要不要单独一个模块**。它没回答另一个问题：
**这个模块算不算一个「域」**——即它的存在本身值不值得被当作业务能力来设计、被反复讨论边界。

两个问题分开问，得到六档：

| 档       | 判据                                                       | 能不能外采                     |
| -------- | ---------------------------------------------------------- | ------------------------------ |
| 核心域   | 有不变式，写错就是钱或合规事故                             | 不能                           |
| 支撑域   | 流程必需，但规则可标准化                                   | 部分可以（支付通道、物流轨迹） |
| 通用域   | 与业务差异化无关                                           | 优先外采                       |
| 平台能力 | 横切所有模块的技术底座                                     | 可以，但边界要自己定           |
| 暂存     | 有独有数据，但无不变式、无第二写者、纯叶子                 | 无意义（太薄）                 |
| 无域     | **没有独有数据**：别人的投影 / 外部系统的适配 / 用户的创作 | 视情况                         |

### 1.1 为什么「无域」是单独一档

第 0 节说了「不进域的三类」，但那时没有给出它们的落点，于是它们被随手塞进了最像的那一层：
`search` 进了核心域（还要专门写一句「核心 ≠ 写侧」为它辩护），`review` / `content` / `logistics`
进了支撑域，`media` / `cms` / `analytics` 进了通用域。**那一句辩护就是错位的证据**——
如果分类是对的，不需要辩护。

「无域」的判据是**这份数据离了本模块还能不能重建**：

- `search` 的 `index_doc` 从 `catalog` 投影，删了能重建 → 无域
- `logistics` 的轨迹在承运商那里，本模块只是转码 → 无域
- `review` 的正文是买家写的，本模块只是保存与聚合 → 无域

而 `cart.items` 删了就没了，它是唯一数据源 → 它必须是个域，只是很薄，所以是「暂存」。

**这两类的区别比「有没有不变式」更根本。** 支撑域的定义管的是「数据有没有行业标准」，
「无域」说的是「这份数据该不该归你」。两个维度不同，不能互相替代。

### 1.2 为什么「暂存」是单独一档

购物车和收藏夹三句全过不了：没有不变式（只有行级 CHECK）、没有第二个写者、
答不出「不拆会出什么故障」。但它们有独有数据，所以不能归进「无域」。

它们也不该进支撑域：支撑域的每个成员要么被别人依赖（`seller` / `payment`），
要么有可标准化的规则（`logistics` 的承运商码表）。`cart` 两样都没有，
留在支撑域只会成为那个「为什么它在这儿」的成员。

暂存档的模块正常形状就是：**一张到几张扁平表 + 读时经别人的 api 拼装 + 硬删 + 纯叶子**。
这不是缺陷，是这类模块该有的样子。真出现不变式或第二个写者，它就升级进核心域，
而那时候「要不要拆」会是另一个问题。

## 2. 核心域（11）

| 模块          | 职责                                                                        | 核心表                                                                                                                       | 写者                                 |
| ------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `catalog`     | 类目树、属性模板、SPU/SKU、品牌、上架状态                                   | `category` `attribute` `spu` `sku` `listing`                                                                                 | 平台（发布/类目）+ 商家（草稿/报价） |
| `pricing`     | 算价：取 `promotion` 的规则与 `seller` 的运费模板，输出成交价与逐行分摊证据 | `price_quote` `price_quote_line` `price_quote_rule` `price_quote_shipping`                                                   | 系统（唯一算价点）                   |
| `promotion`   | 券、满减、秒杀、拼团、预售的活动定义与额度                                  | `campaign` `promotion.rule` `coupon_stock` `coupon_instance`                                                                 | 平台（规则）+ 买家（领取）           |
| `trade`       | OrderGroup / SellerOrder、拆单、履约状态机、超时撤销                        | `order_group` `seller_order` `order_line`                                                                                    | 买家（创建）+ 系统（流转）           |
| `inventory`   | 单仓 ATP、预占、库存流水（多仓 / 门店 / 预售后续）                          | `stock` `reservation` `stock_ledger`                                                                                         | 系统（唯一写者）                     |
| `fulfillment` | 包裹、拆包、发货时效、轨迹状态机（只认标准码）                              | `package` `package_item` `ship_task`                                                                                         | 商家（发货）+ 系统                   |
| `clearing`    | 账本、清分、商家余额、打款、红字冲正、对账                                  | `account` `posting_group` `ledger_entry` `clearing_statement` `settlement_batch` `payout`                                    | 系统（唯一写者）                     |
| `governance`  | 商家分层、类目/品牌授权、资质有效期、违规扣分、处置与申诉、费率模板         | `seller_profile` `category_grant` `brand_grant` `credential` `violation` `enforcement_action` `appeal` `commission_template` | 平台                                 |
| `returns`     | 仅退款、退货退款、换货、逆向物流、超时自动处置                              | `rma_case` `case_item` `return_shipment` `case_evidence` `case_log`                                                          | 买家（申请）+ 平台/商家（裁决）      |
| `dispute`     | 平台介入、仲裁、举证、大众评审                                              | `dispute_case` `evidence` `ruling`                                                                                           | 平台                                 |
| `risk`        | 刷单、套现、黄牛、盗号、内容风控                                            | `risk_event` `rule_set` `decision_log`                                                                                       | 系统                                 |

`search` 曾经被放在这里，理由是「核心 ≠ 写侧」。那句辩护其实是在为一个错位找理由：
它只有投影、坏了就降级到类目浏览，按第 1.1 节的判据它是**无域**。
把它移出去之后，剩下的 11 个全部真持有交易数据、真有不变式——核心域反而更清楚了。

## 3. 支撑域（8）

| 模块      | 职责                                                       | 边界关键                                                                                         |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `seller`  | 入驻申请、主体与资质材料、结算账户、子账号与角色、运费模板 | 身份与打款验证委托持牌机构，不自建 KYC 全套；运费模板只出 `FreightRule` 值对象，算钱在 `pricing` |
| `payment` | 支付单、渠道聚合、回调、退款、渠道分账单                   | 不做分账计算；只认"钱到账"这一事实                                                               |
| `member`  | 等级、积分、权益、会员价资格                               | 只产出资格，不参与算价                                                                           |
| `funding` | 保证金、账期、授信、商家贷                                 | 资金方的债权，不进交易账本                                                                       |
| `invoice` | 电子发票开具、红冲、抬头管理                               | 税务口径独立于 `clearing` 的账本                                                                 |
| `ad`      | 广告位、竞价、计费、效果归因                               | 计费结果进 `clearing`，不反向写订单                                                              |

`ad` 在成熟平台是主要营收，但它只依赖 `clearing` 计费，边界清楚，可以独立深化。

`logistics` / `review` / `content` 曾在这里，已按第 1.1 节移进「无域」——
它们的数据分别在承运商、买家、创作者手里，本模块只是转码或保存。

## 4. 通用域（5）

| 模块           | 职责                         | 建议                       |
| -------------- | ---------------------------- | -------------------------- |
| `account`      | 买家账号、登录方式、安全设置 | 账号主体自建，登录方式外采 |
| `notification` | 站内信、短信、推送、订阅     | 外采通道，自建模板与频控   |
| `im`           | 买卖家会话、消息、敏感词     | 优先外采，会话留痕自建     |
| `ticket`       | 客服工单、流转、SLA          | 可外采                     |

`cms` / `media` / `analytics` 曾在这里，已按第 1.1 节移进「无域」。

## 5. 平台能力（7）

`authz`（授权）、`audit`（操作留痕）、`config`（配置与 AB）、`idgen`（发号）、`scheduler`（定时调度）、`gateway`（入口与限流）、`observability`（日志/指标/链路）。

这些没有业务不变式，但**边界必须自己定**，尤其两条：

- `authz` 要支持三套主体：买家、商家子账号、平台运营。三套的越权口径不同，不能共用一张角色表。
- `audit` 的写入不能依赖业务模块"记得调用"，要在框架层拦截。

**平台运营那套身份已落成 `staff` 模块**（schema `staff`：`account` + `role_permission`），
因为它有自己的表，按第 7 节那条判据它就该是模块，不该塞进 `common`。
三套身份共用一把签名密钥，靠 JWT 的 `typ` 声明分流——见 [access-control.md](access-control.md) §1.1。

## 5.1 暂存（1）

| 模块   | 职责                               | 边界关键                                                             |
| ------ | ---------------------------------- | -------------------------------------------------------------------- |
| `cart` | 购物车、收藏夹（同为选购意图暂存） | 只存指针不存快照；不锁价不锁库存；读时经 `catalog :: api` 拼装与置灰 |

判据：有独有数据（删了就没了），但无不变式、无第二写者、无外部依赖。
**「无外部依赖」是这类模块的正常形状，不是缺口**——真出现不变式或第二个写者，它就升级进核心域。

购物车与收藏夹为什么在同一个模块：形状相同、失效处理相同、硬删口径相同、对外依赖相同，
拆开只换来两份要同步维护的边界注释。名字叫 `cart` 是不精确的，等第三个暂存需求
（浏览历史）真的来了再一次性改名，那时才知道该叫什么。

## 5.2 无域（7）

有模块边界、有自己的 schema、有自己的表，但**没有「域」**：它们的数据不在自己手里。

| 模块        | 职责                           | 数据在谁手里 | 类型       |
| ----------- | ------------------------------ | ------------ | ---------- |
| `search`    | 索引构建、召回、排序、类目导航 | `catalog`    | 读侧投影   |
| `analytics` | 报表、漏斗、商家看板           | 各业务模块   | 读侧投影   |
| `logistics` | 承运商轨迹回传、原始码转标准码 | 承运商       | 技术适配   |
| `media`     | 图片/视频上传、转码、CDN       | 对象存储     | 技术适配   |
| `review`    | 评价、追评、问大家、买家秀     | 买家         | 内容与 UGC |
| `content`   | 图文、短视频、直播、种草       | 创作者       | 内容与 UGC |
| `cms`       | 页面搭建、店铺装修、活动落地页 | 运营         | 内容与 UGC |

**判据：这份数据离了本模块还能不能重建。** `index_doc` 能重建、轨迹能重拉、UGC 能重新投稿，
所以它们没有域边界；反过来 `cart.items` 删了就没了，所以它必须是域。

这类模块的约束与域相反：

- **可以随时清空重建**，不许成为任何流程的必经环节（`search` 挂了降级到类目浏览）
- **不许反向写源模块**（`search` 不写 `catalog`，`review` 的聚合分只走 api 回给 `catalog`）
- **它们的表不是业务事实**，不当审计依据、不当对账依据

它们仍需独立模块（而不是塞进 `common`）：有自己的 schema、自己的表、自己的维护节奏，
按第 8.3 节「有没有自己的 schema」这条，它们就是模块。

## 6. 依赖方向

层间只向下依赖，同层内按业务流单向：

```
平台能力  ← 被所有层依赖，不依赖任何业务模块
无域      → 只读源模块的 api 与 events，不被任何域依赖
通用域    → 平台能力
暂存      → 平台能力 + 核心域（只读 api）
支撑域    → 通用域 + 核心域（只读 api）
核心域    → 平台能力 + 通用域 + 少量支撑域
```

「无域」与「暂存」都是**纯叶子**：不被任何模块依赖。这不是巧合，是这两档的定义之一——
一个被别的模块依赖的投影，实际上已经成了别人的数据源，那它就该升级。

核心域内部的 DAG：

```
catalog  ← promotion ← pricing
   ↑           ↑          ↑
   └───────────┴──────────┴── trade ──→ inventory
   │                          │           ↑
   │                          ├──→ fulfillment ─┘
   │                          ├──→ returns ──────┘ ──→ dispute
   │                          └──→ clearing ←── payment
   │                                 ↑
   │                                risk / governance
   └──→ inventory :: api（只读：商品列表的「我还有多少货」；写：商家改库存）
```

`catalog → inventory :: api` 是后加的一条，值得记一下为什么：

卖家商品列表要显示每个商品的库存，而库存的唯一持有者是 `inventory`。可选做法有三个——

1. 列表 SQL 里 `JOIN inventory.stock`：跨 schema 读别人的表，违反铁律 5
2. 让 `inventory` 反过来依赖 `catalog`（它知道 SPU）：多一条反向边，且 `inventory` 不需要知道 SPU
3. **`catalog` 依赖 `inventory :: api`**：单向、只读、口径只有一处

选了 3。它不成环（`trade → catalog → inventory` 与既有的 `trade → inventory` 同向），
代价是核心域内部多一条边，收益是「可售量」的定义只住在 `InventoryQuery` 一处。

`catalog → governance :: events` 同理：商家停业要级联下架在线商品。走事件而不是让
catalog 反向读 governance 的 `seller_profile`，既保持「谁能卖」的判定只住 governance，
也让 catalog 的监听器天然幂等（`EventInbox` 去重 + outbox 重投）。
`catalog → seller :: events`（`ShopClosed` → 关店级联下架）与上面同一条理由——关店是商家自己的
终态决定，事实发生在 seller，下架是 catalog 的反应。

**入驻的双向握手要读成单向。** governance → `seller :: api` 有两条：`MerchantQuery.namesByIds`
（审核队列拼主体名，纯点查）和 `OnboardingCommand.approve/reject`（审核结论回写入驻申请单）。
回写为什么走命令不走事件：卖家端的重提闸门读申请单，事件晚到会出现「管理员已通过、卖家还看不到、
重提还报错」的窗口——同事务命令没有窗口。seller → governance 只剩事件
（`MerchantRegistered` / `MerchantResubmitted`），方向不构成环。

**注意这里有两个不同的库存口径，名字里就分开了**：
`availableToPromiseBy*` 只看默认仓（下单路径只从默认仓发货，问的是「现在能不能卖」）；
`availableAcrossWarehouses(skuIds)` 跨仓求和（商家列表问的是「我还有多少货」）。
两个问题不同，答案自然不同。

**`fulfillment → inventory :: api` 与 `returns → inventory :: api` 也是后加的，理由相同：**
出库和退货入库是这两个模块各自的事实（包裹发了、退货签收了），账在 `inventory`。
反过来让 `inventory` 依赖它们就成环。这两条边都是纯写命令，不带任何"读别人的数据"。

**`fulfillment → returns :: api` 也是后加的：** 自动收货要知道"这批子单有没有未结案售后"
（有就不替买家签收）。这个事实只在 `returns` 手里；查单方向只能 `fulfillment → returns`，
反过来 `returns` 订阅履约事件就成环。

**商家改库存的入口长在 `catalog`，不长在 `inventory`。** 判「这个 SKU 归不归你」需要 SPU → 商家，
那是 `catalog` 的事实；让 `inventory` 去问就与 `catalog → inventory :: api` 成环。
分工是：**归属在 `catalog` 判，账在 `inventory` 记**（`SellerStockService` → `InventoryCommand.adjustAll`）。

`pricing` 还有一条跨层依赖：`seller :: api`（运费模板的 `FreightRule` 值对象）。
模板是店铺配置，`shop_id` 指向 seller 的 `shop`，所以数据归 seller、算钱归 pricing——
和 `promotion` 的 `AppliedRule` 是同一个分工。**`pricing` 不能依赖 `fulfillment`**：
`fulfillment → trade → pricing` 已经是一条链，再加反向边就是环。

三条必须遵守的方向约束：

1. **`trade` 不调 `payment`，`payment` 不调 `trade`。** 支付单入口在 `payment`，`PaymentSucceeded` 到达后由 `trade` 校验金额，不等即拒收并告警。
2. **`trade` 不调 `clearing`。** 费率模板归 `governance`（商业条款），下单时钉快照；`clearing` 只执行不定义。
3. **反向影响走 api 命令，不靠监听。** 发货写回订单用 `TradeCommand.recordShipment`；售后徽标写回用 `TradeCommand.syncAfterSaleBadge`。互相监听一定会成环。

### 第 1 条改过：从"互不调用"到"单向"

原文写的是"`trade` 不调 `payment`，`payment` 不调 `trade`"，但代码里 `payment` 直接调了
`trade.api.TradeQuery.findPayable` 去读应付金额——**两个模块互相 import，是真环**。
`ModularityTest` 的 `verify()` 一跑就报出来，而 `pnpm modules:check` 没抓到，
因为它只比对 `allowedDependencies` 的字符串，不看实际 import。

修法是**单向 `trade → payment :: api`**：

```
POST /api/buyer/orders/{orderGroupId}/pay     ← 买家入口在 trade
  → trade 自己查 payable_amount（它本来就持有订单）
  → payment.api.PaymentCommand.create(orderGroupId, buyerId, amount, currency)
```

- **`payment` 不认识 `trade`**，`PaymentCommand.create` 的金额是参数不是查询
- **金额依然不许前端传**：买家侧入口只收 `orderGroupId`，金额由 trade 在服务端读出来
- **依赖方向单向**，环消失

代价是"发起支付"这个动作的编排住在 `trade.service.PaymentStarter`，而不是 `payment`。
这是有意的：**谁持有数据，谁负责编排**。payment 只回答"钱到没到"。

**关于 `trade` 与 `fulfillment` 的依赖方向**：**只能单向，`fulfillment → trade`。**

一开始把买家侧的"看包裹 / 确认收货"放在 trade 的 controller 里，理由是归属校验 trade 已经做完了。
结果 `modules:check` 当场报环：`trade → fulfillment → trade`。

那个判断是错的。归属校验可以搬家，环搬不了——环一旦存在，两个模块就再也分不开了。
所以买家侧包裹接口住在 `fulfillment`，归属链路「包裹 → 子单 → 订单组 → 买家」在那边走
（它知道包裹属于哪个子单，trade 不知道）。

事件只有 `OrderPaid` 一条，方向也是 `trade → fulfillment`。

## 7. 事件契约

约定：

- 命名 `<聚合><过去式>`，金额一律 `Money(amount, currency)`
- 消费方幂等键：业务主键 + 事件类型，落唯一索引
- 投递走事务性 outbox（事件与业务数据同事务落库），不直发 MQ
- 只发"已经发生的事实"，需要对方回结果的走 api

### 商品与定价

```java
SellerOfferSubmitted(listingId, merchantId, spuId, submittedAt)
ListingPublished(listingId, merchantId, spuId, skuIds, categoryId, minPrice)  // → 搜索索引
ListingOffline(listingId, reason)                                     // → search
```

### 交易

```java
SellerOrderPlaced(orderGroupId, sellerOrderId, merchantId, lines,
                  merchandise, shipping, discountAllocated,
                  commissionBase, rateVersion, placedAt)         // → clearing
OrderPaid(orderGroupId, paymentId, paidAmount, sellerOrders, paidAt)  // → fulfillment, clearing
OrderCancelled(orderGroupId, sellerOrderId, reason, cancelledAt)      // → promotion（库存释放走 api 同步调用）
OrderCompleted(orderGroupId, completedAt)                              // → clearing, review
```

`SellerOrderPlaced` 是最关键的一个：它把下单瞬间的金额构成、优惠分摊、费率版本一次钉死，下游只认快照，不回查。

`OrderPaid` 与 `PaymentSucceeded` 的分工：那个是"渠道说钱到了"，这个是"trade 确认这单该发货了"。
两者之间隔着金额校验和 CAS——**金额不符时 `PaymentSucceeded` 到了，但 `OrderPaid` 不发**。
`fulfillment` 收到 `OrderPaid` 才建发货任务，承诺时效从支付时间起算。

### 资金

```java
PaymentSucceeded(paymentId, orderGroupId, amount, expectedAmount, matched,
                 channel, channelTxnId, paidAt)                       // → clearing, trade
PaymentFailed(paymentId, orderGroupId, reason)
RefundRequested(orderGroupId, sellerOrderId, amount, currency, reason)   // → payment
RefundSucceeded(refundId, paymentId, orderGroupId, sellerOrderId,
                amount, refundedAt)                                      // → trade, clearing
ChannelSplitSettled(channelBatchId, entries, settledAt)           // 渠道分账回执
SplitPosted(orderGroupId, entries, balances)                      // 账本内部事实
ReconciliationBroken(bizDate, diff, sampleEntryIds)               // 对账断裂，进告警
```

### 卖家

```java
MerchantRegistered(eventId, merchantId, merchantName, shopId, occurredAt)  // seller → governance：落档案进入驻审核队列
MerchantResubmitted(eventId, merchantId, occurredAt)                       // seller → governance：被拒重提，档案翻回 applied
ShopClosed(eventId, merchantId, shopId, actorId, occurredAt)               // seller → catalog：关店（终态）级联下架在线商品
```

入驻审核的结论（通过/驳回）**不是事件**：governance 在审核事务里经 `seller :: api` 的
`OnboardingCommand` 直接回写入驻申请单。审核结果要驱动卖家端的重提闸门，事件最终一致会出现
「已通过却重提报错」的窗口；能同事务解决的走命令，是第 6 节那条「反向影响走 api 命令」的同一判据。

### 治理与售后

```java
MerchantApproved(merchantId, approvedAt)                              // → catalog
SellerSuspended(merchantId, scope, reason, until)                    // → seller, catalog, search, clearing
CategoryGrantRevoked(merchantId, categoryId)                         // → seller, catalog
CredentialExpired(merchantId, credentialType)                        // → seller, catalog
GuaranteeLow(merchantId, balance, threshold)                         // funding → governance
RiskDecision(merchantId, decision, score, reasons, decidedAt)        // → governance
DisputeResolved(caseId, merchantId, ruling, amount)                    // → returns, clearing
```

`ReturnApproved` 已从契约里撤掉：退款执行是 `returns` 同步调 `payment.refund` 的命令，不是事件
（见 [rma.md](rma.md) §4）；退款结果仍走事件，`RefundSucceeded` 见第 6 节 payment 的事件清单。

`inventory` 与 `promotion` **不发事件**：预占、释放、券占用、核销都是同事务同步调用，广播只会制造"预占成功但订单已取消"的竞态。

## 8. 代码形态

### 8.1 平铺，层不进路径

**模块 = 顶层包 = schema，三者一对一。**

框架按应用的直接子包识别模块。写成 `core/trade`，被识别的模块是 `core`，`trade` 降级成它的普通子包：`allowedDependencies` 失守、schema 塌成 `core`、整张地图作废。

层是标签，不是目录。为了"看着整齐"破坏这个一对一关系，代价远大于收益。

### 8.2 层在哪三处表达

1. **声明上**：`package-info.java` 的 `displayName` 带层标，`@ApplicationModule(displayName = "Trade [core]", allowedDependencies = …)`
2. **校验上**：一条层序检查——通用域不许依赖核心域，平台能力不许依赖业务域；数据从模块图读，不维护包名清单
3. **文档上**：本文第 2–5.2 节的分组

代码里不出现 `core` / `support` / `generic` / `staging` 这类词。

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
├── inventory/              │ 核心域 11
├── fulfillment/            │
├── clearing/               │
├── governance/             │
├── returns/                │
├── dispute/                │
├── risk/                   ┘
│
├── seller/                 ┐
├── payment/                │
├── member/                 │ 支撑域 6
├── funding/                │
├── invoice/                │
├── ad/                     ┘
│
├── cart/                   暂存 1：购物车 + 收藏夹
│
├── search/                 ┐
├── analytics/              │
├── logistics/              │
├── media/                  │ 无域 7：投影 / 适配 / UGC
├── review/                 │
├── content/                │
├── cms/                    ┘
│
├── account/                ┐
├── notification/           │ 通用域 4
├── im/                     │
└── ticket/                 ┘
```

**一条规则决定谁是模块：有没有自己的 schema。** 平台能力 7 个里只有 `audit` 有表，所以只有它是模块；`authz` / `config` / `idgen` / `scheduler` / `gateway` / `observability` 全进 `common` 和 `infra` 共享包，否则每个模块都要在 `allowedDependencies` 里重复登记它们。

同样地，「无域」的 7 个**仍然是模块**：它们有自己的 schema、自己的表、自己的维护节奏。
「无域」否定的是「它是个业务能力」，不是「它该有模块边界」。

### 8.4 模块内部

```
<module>/
├── package-info.java     模块声明 + 允许依赖
├── controller/           REST 入口，一个 handler 只调一个 service 方法
├── dto/                  XxxRequest / XxxQuery
├── service/              编排 + 出参形状
├── model/                聚合、值对象、状态机
├── mapper/               Mapper：MyBatis 注解 SQL，投影 record（构造器按参数名自动映射）
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
4. **治理判定只有 `governance` 给。** 能不能卖这个类目、资质过没过期、是否被冻结，只有一个出口。
5. **读侧可降级，写侧不可跨域。** 搜索、推荐、报表挂了不影响下单；但任何模块都不许写别人的表。

## 10. 横切约束

**多租户。** 隔离维度是运营主体、区域、业务线（淘宝/天猫/国际），不是商家。商家是数据归属列 `merchant_id`，两者正交。用 `merchant_id` 当租户 ID，跨商家搜索和平台运营视图会永远是后门。

**金额。** 全链路一个形状：`Money(amount, currency)`，落库 `(amount, currency)` 列对 + `CHECK`。禁止裸 int64 和浮点。

**时间。** 所有资金动作归"业务日期"（日切），不归自然时间。跨日切的冲正必须落在正确的会计期间。

**幂等。** 清分入口用 `业务单号 + 清分类型` 分布式锁 + 数据库联合唯一索引双保险；事件消费用业务键去重。

**一致性。** 同事务内能解决的走 api 命令（冻库存、写回投影列）；跨模块影响走事件 + 补偿。**没有跨模块分布式事务。**

**数据访问。** MyBatis 注解 SQL：投影用 record + `@Select`（构造器按参数名自动映射，snake 列名直配），insert / update 同样原样走注解——没有实体、没有 Wrapper、没有 `BaseMapper`；infra 的基础设施（Modulith 事件表、Authorizer、BizSequence 等）仍用 JdbcClient。**写只许条件更新（CAS）**：这个项目每一条写都是条件更新，0 行是判决不是异常——不引回会藏住前置条件的框架（MyBatis-Plus / JPA / Hibernate），由 `ArchitectureTest` 的「写只许带前置条件」拦死。全局约定在 `infra/db/MybatisConfig`：枚举按 `dbValue()` 小写、UUID / `uuid[]` 走 `infra/db` 的 TypeHandler、jsonb 在 SQL 里 `CAST(#{x} AS jsonb)`。

## 11. 规模化的四个开关

单体不是妥协，是默认。只有出现下面四个信号之一，才把模块拆成独立部署：

| 信号         | 判据                                  | 拆谁             |
| ------------ | ------------------------------------- | ---------------- |
| 伸缩曲线分叉 | 某个模块的峰值 QPS 是主链的 10 倍以上 | 搜索、推荐、广告 |
| 团队规模     | 一个模块需要 3 个以上团队同时改       | 交易、商品       |
| 合规隔离     | 数据主权或审计要求单独存储            | 清结算、资金     |
| 故障域       | 它挂了不能拖垮下单                    | 搜索、推荐、通知 |

**反过来说：一个模块如果四条都不满足，拆出去只换来网络跳数和一致性成本。**

拆出去之后，订单三层（group / seller_order / line）共用 `group_id` 哈希分片，买家侧和商家侧各走一张异构索引；这是分片键和查询模式的取舍，不是模块边界问题。

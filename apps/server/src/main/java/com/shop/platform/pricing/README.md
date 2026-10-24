# pricing — 算价

> 核心域 · schema `pricing` · 进行中

```yaml
module: pricing
layer: 核心域
schema: pricing
status: in-progress
depends_on: ["catalog :: api", "promotion :: api", "seller :: api"]
emits: []
consumes: []
```

## 职责

取 `promotion` 的生效规则，按五层流水线算出成交价：基础价、优惠、分摊、运费、证据。
**规则数据不在这里**——优惠规则归 `promotion`（`AppliedRule`），运费模板归 `seller`（`FreightRule`），
这里只拿已展开成值对象的规则自己算钱。

## 模块契约

> 只写**后端内部**的进出口：用了谁的东西、给了谁东西。HTTP 入口在下面单独一节。

### 输入：用了别人什么

| 来源               | 拿什么                                                                                                                    | 用在哪                           | 拿不到会怎样                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| `catalog :: api`   | `findSellable(skuId)` → `SellableSku`：价格、商家、店铺、类目、重量、标题、图、规格                                       | ① 基础价，同时把快照写进报价单行 | 下架 / 不可售 → 进失效行，不炸整单；**全部**失效才 409                   |
| `promotion :: api` | `effectiveRules(categoryIds, merchantId)` → `List<AppliedRule>`：优先级、门槛、比例或定额、基数口径、范围、承担方、互斥组 | ② 促销                           | 一条都没有 → 按原价算，不是错误                                          |
| `seller :: api`    | `activeFor(shopId)` → `FreightRule`：计费口径、包邮门槛、地区费率；`nameOf(shopId)` → 店名                                | ④ 运费；店名给分组明细展示       | 没启用模板 → 409 `SHIPPING_TEMPLATE_MISSING`；缺店名 → 置 null，不拦金额 |

三个都是**同步点查**，都在算价事务里完成。可售性失败有"部分成功"：失效行（下架、挂售变化）
进响应的 `unavailable`，确认页置灰剔除，不落证据、不进指纹；运费模板缺失仍然整单拒——那家店没法计费。
**没有任何事件消费**（`consumes: []`）：算价是只读的快照生成，不该被异步事件推进来推进去。

### 输出：给了别人什么

| 消费方         | 给什么                                                                                                                     | 什么时候                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `trade :: api` | `consumeForOrder(quoteId, current)` → `QuoteSnapshot`：逐行金额 + 每行每条优惠（规则 id / 版本 / 承担方 / 金额）+ 每店运费 | 落单事务内，CAS 与插单同事务   |
| 结算页（HTTP） | 试算响应：`quoteId`、`expiresAt`、四个总额、按店铺分组的逐行明细（含商品快照）、每组运费、`unavailable`                    | 同一份内存结果既落证据又出响应 |

trade 拿到之后拷成三处：`order_line`（金额与商品快照）、`order_line_discount`（每行每条优惠）、
`seller_order.shipping_amount`（按店汇总的运费）。**报价单是这三处的唯一来源**，订单侧不重算。

**不给的**：订单、库存、支付。算价只产出一张报价单，落单是 trade 的事。

### 边界：明确不做的

- **不查库存、不锁库存**——那是 `inventory`，下单才锁
- **不判"能不能卖"**——可售性由 `catalog.findSellable` 回答，算价只消费结论
- **不定义规则**——优惠规则在 `promotion`，运费模板在 `seller`，这里只算钱
- **不发事件**（`emits: []`）——报价单过期靠 TTL + CAS，不靠广播；广播只会制造"过期了但没人知道"的竞态

## 拥有什么

`price_quote` `price_quote_line` `price_quote_rule` `price_quote_shipping`

表都建在 `pricing` schema 里，跨 schema 不 JOIN、不建外键。

**运费模板不在这里**：它是店铺配置，`shop_id` 指向 seller 的 `shop`，所以表和读写都在 `seller`。
pricing 只是**算钱的地方**——包邮门槛要看折后金额，而折后金额只有算价知道。
"计算依赖"不等于"数据归属"，这两件事一度被合并，`V20261023163000` 把表搬回去了。

完整五层模型、分摊算法、承担方规则见
[pricing.md](../../../../../../../../../docs/domain/pricing.md)。

## 目录

```
pricing/
├── controller/  QuoteController：结算页试算
├── dto/         QuoteRequest（HTTP 入参，不含价格也不含商家）、QuoteResponse（分组明细 + 失效行）
├── api/         PricingQuery（落单校验）、PricingRequest（输入形状）
├── service/     PriceQuoteService（试算 + CAS + 响应组装）、QuoteCalculator（五层流水线）、
│                QuoteCleanupJob（证据表日清，留存 30 天——全库写入量最大的表族，不清就无界增长）
├── model/       Allocation（最大余数法，全平台唯一实现）、FreightFee（运费金额）
└── mapper/      PriceQuoteStore（表结构与字段字典见 mapper/README.md）
```

## HTTP 入口

| 方法   | 路径                | 说明                                                                                              |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------- |
| `POST` | `/api/buyer/quotes` | 算价，返回 `quoteId`、`expiresAt`、四个总额、按店铺分组的逐行明细、每组运费、`unavailable` 失效行 |

**请求体里没有价格，也没有商家。** 两者都由 catalog 的 offer 决定，前端填不出来也不该填：

- 传价格等于允许有人编一个价格去下单
- 传商家等于允许把别人的货算进自己的单

`offerId` 是可选校验位：给了就必须与 catalog 一致，用来挡住"用户看到的商品已经被换商家挂售"。
对不上不再是炸整单——那行进失效列表（`cause=OFFER_CHANGED`），确认页置灰让用户剔除。
它**不进 fingerprint**——它由 catalog 决定，买家改不了，算进去会让无关紧要的差别变成一次 `PRICE_CHANGED`。

## 已经落在代码里的四件事

1. **最大余数法只有一处实现**（`Allocation`）。四条性质全部来自算法本身：和恒等于 `amount`、每项非负、
   与输入顺序无关、同输入同输出。实测 500 轮随机输入，之和一分不差；打乱输入顺序结果不变。
   **「尾差给最后一行」那种写法是错的**——它让最后一行系统性偏大，退货时一看就露。

2. **报价单是证据，不是结果**。地址、资格、命中的规则、每层中间结果、分摊矩阵全量落库。
   只存结果不存输入，投诉"运费为什么是 12 块"就还原不出来。

3. **落单校验 + CAS 同事务**。`UPDATE ... WHERE id = ? AND status = 'issued' AND expires_at > now()`，
   影响 0 行就拒单。实测同一张报价第二次使用必被拒；数量变了返回 `PRICE_CHANGED` 且**不烧掉报价**。

4. **运费在分摊之后**，门槛看本店铺的折后金额。实测满 200 元正好命中包邮、未满照收。

## 库约束（已实测生效）

- `ck_quote_sum`：`goods - discount + shipping = payable`，写一个不平的报价单当场被拒
- `ck_line_payable`：`payable = subtotal - discount AND payable >= 0`，算错行金额当场被拒

运费模板的两条约束（`uq_shipping_template_active`、`ck_shipping_default_region`）跟着表去了 `seller`。

## 闭环断点

- **`promotion` 只有规则表**：满减已经能真的减钱、分摊、留证据（演示规则：满 200 减 20），
  但活动聚合、券、预算都没有。券接进来之前要先解决"试算占用、落单核销、过期释放"三段生命周期，
  否则同一张券能被两张报价单同时用掉
- **多币种没做**：混进第二种币种直接拒，不做汇率
- **没有核对任务**：`Σ allocation = amount` 这条跨不出 jsonb，靠落单后跑核对；现在没有那个任务
- **运费模板的读写都归 `seller`**：那边还没有管理接口，模板只能靠 SQL 造，商家改不了运费

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。

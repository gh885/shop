# 算价

> 回答 [questions.md](../questions.md) 第 28–39 题。落在 `pricing` 模块，schema 同名。
> 模块 README 见 [pricing](../../apps/server/src/main/java/com/shop/platform/pricing/README.md)。

## 1. 一分钟稿

> 算价回答一个问题：这个买家、这一时刻、这一车货，每一行该付多少，运费多少，总共多少。
>
> 五层流水线——基础价、促销、分摊、运费、证据。前四层算钱，第五层留证据。**没有第五层，投诉"金额不对"就还原不出来。**
>
> 促销层只执行两种规则：单品打折和满减。规则数据在 `promotion`，这里只拿、只算、只留证。秒杀不做，它是库存和限流问题；券不做，它是发放核销的生命周期；会员价不做，依赖还不存在的等级表。
>
> 整个设计里唯一不能改的是**分摊算法**：最大余数法，全平台只有一个实现。任何新优惠类型都不用碰它。

## 2. 模型与不变式

### 2.1 五层流水线

| 层       | 做什么                                 | 输出                           |
| -------- | -------------------------------------- | ------------------------------ |
| 1 基础价 | 商家挂牌价，取下单时刻快照             | 每行单价                       |
| 2 促销   | 按优先级逐条命中、算减多少             | 每条优惠的金额 + 范围 + 承担方 |
| 3 分摊   | 把每条优惠的金额按比例落到行上         | 每行承担多少                   |
| 4 运费   | 运费模板、包邮门槛                     | 运费金额                       |
| 5 证据   | 输入、命中规则、每层中间结果、分摊矩阵 | 报价单                         |

**运费在分摊之后**，因为"满 99 包邮"的门槛要看折后金额。但商品优惠不能抵扣运费——两条互不相通的钱。

### 2.2 只执行两种规则

| 做的                          | 为什么是它                                   |
| ----------------------------- | -------------------------------------------- |
| 单品打折（`line`，按比例）    | 最简单，但**不需要分摊**，单独做它证不了框架 |
| 满减（`order_group`，按定额） | 逼出分摊、尾差、承担方                       |

两个一组合，骨架就齐了：范围、分摊、尾差、谁出钱、互斥、证据。

**不做的三类，理由各不相同：**

- **秒杀不是优惠，是库存和限流。** 价格通常就是一个固定低价，难点在"十万人抢一千件"。它属于 `inventory`，放算价层是定位错误。
- **券是生命周期问题。** 发放、领取、核销、过期、退券，和"减多少钱"无关。成熟后它只是算价的一个**资格来源**。
- **会员价依赖 `member` 模块。** 现在连等级表都没有。

**一条判据挡住以后的需求：只有"改金额、不改交易结构"的才进算价层。** 拼团、预售、定金、以旧换新都被挡在外面——它们改的是成团条件、尾款、旧机折价，不是价格。

### 2.3 三条扩展点

```
引擎     收集候选 → 资格过滤 → 排序 → 计算 → 分摊 → 运费 → 证据    一次写，永不改
规则类型 按比例减 / 满 X 减 Y / 第二件半价 / 赠品                    加一个类
资格来源 活动命中 / 券 / 会员等级 / 积分                              加一个 provider
```

```java
interface PromotionType {
    String code();        // LINE_PERCENT_OFF / ORDER_THRESHOLD_OFF
    Scope scope();        // LINE | SELLER_ORDER | ORDER_GROUP
    Benefit quote(AppliedRule rule, PricingContext ctx);
}
```

- **加优惠类型** = 实现接口，注册一个 code
- **加资格来源** = 往 `PricingRequest.entitlements` 里塞条目，引擎不区分来源
- **加范围** = 改分摊算法。这个不该经常发生，所以三档一次定够

**分摊只有三种作用范围，共用一套实现，不随优惠类型增长。** 加十种优惠，分摊代码一行不改——这就是"轻松扩展"的真正来源。

### 2.4 谁承担

每条优惠必须记 `bearer`。结算是按商家算的，"减了多少钱"不够，还得知道"谁掏了这笔钱"。

| 优惠              | 承担方                        |
| ----------------- | ----------------------------- |
| 平台券 / 平台补贴 | `platform`                    |
| 商家券 / 店铺满减 | `merchant`                    |
| 跨店满减          | 活动配置决定，默认 `platform` |
| 积分抵现          | `platform`                    |

商家按原价结算、平台出补贴——这是 `clearing` 里两个不同的科目。漏了 `bearer`，结算基数就错，而且事后说不清。

承担方是规则行上的列，归 `promotion`；`price_quote_rule` 只存快照，落单后原样进 `order_line_discount`。

### 2.5 作用范围三档

| 范围           | 摊到哪           | 例子             |
| -------------- | ---------------- | ---------------- |
| `line`         | 这一行，不摊     | 单品打折         |
| `seller_order` | 同一商家的所有行 | 店铺满减         |
| `order_group`  | 整个订单组所有行 | 跨店满减、平台券 |

"订单级"这个词要小心：跨店和店铺是两种不同的分摊范围，不能合成一个分支。

### 2.6 七条不变式

1. **金额全是整数分。** 浮点只活在一次乘除里，立刻落整数。
2. **每条优惠的分摊之和，精确等于它的金额，一分不差。** 落库后由核对任务验 `Σ allocation = price_quote_rule.amount`，`jsonb` 里写不出约束，只能事后验。
3. **分摊算法全平台只有一个实现。** 第二个实现就是第一处不一致。
4. **试算和落单同引擎、同规则版本，落单必须带 `quoteId`。**
5. **已成交订单的快照不可变。** 后续改价、改规则、回滚规则都不影响它。
6. **每条优惠必须有 `bearer`。** 没有承担方的优惠不许上线。
7. **行金额之和必须对得平。** `Σ line.payable + Σ price_quote_shipping.shipping_amount = payable`，这条跨表约束 `CHECK` 写不出来，靠落单后跑核对任务。别假装它已经防住了。

## 3. 表、报价单状态机与分摊算法

四张表：`price_quote` `price_quote_line` `price_quote_rule` `price_quote_shipping`。

**两类规则都不在这里，但钱都在这里算。**

- 优惠规则归 `promotion`，通过 `promotion :: api` 拿 `AppliedRule`
- 运费模板归 `seller`（它是**店铺配置**，`shop_id` 指向 seller 的 `shop`），通过 `seller :: api` 拿 `FreightRule`

运费模板一度住在 `pricing`，理由是"满 99 包邮要看折后金额"。那句话是对的，但它证明的是**计算**必须在这里，不是**数据**必须在这里。两件事混在一起，代价是一个纯计算模块替商家保管配置——它因此长不出 CRUD，至今没有运费模板管理接口就是后果。

### 运费模板（`seller.shipping_template`）

```sql
-- 店铺配置，一个店一套；金额计算在 pricing
id           uuid PRIMARY KEY DEFAULT uuidv7(),
shop_id      uuid NOT NULL,
name         text NOT NULL,
charge_by    text NOT NULL,      -- weight | piece
free_over    bigint,             -- 满额包邮门槛，null = 不免邮
regions      jsonb NOT NULL,     -- [{areaCodes, first, firstFee, additional, additionalFee}]
status       text NOT NULL       -- active | archived
```

约束：`CHECK (charge_by IN ('weight','piece'))`。

`regions` 里必须有一条 `areaCodes: []` 的默认项，所有具体地区都没命中时用它。**这条已经是库约束**（`ck_shipping_default_region`），不是"拒绝启用"的口头约定——补上之前，空 `regions` 的模板会让非包邮单直接 500。

**一个店同时只能有一个 `active` 模板**，否则同一单会出现两套运费：

```sql
CREATE UNIQUE INDEX uq_shipping_template_active
    ON seller.shipping_template (shop_id)
    WHERE status = 'active';
```

四条运行期规则，不写下来实现的人会自己发明：

- **地区匹配取最具体的。** `regions` 里按 `areaCodes` 的层级深度降序，第一条命中的生效；都没命中用 `default` 项。
- **`free_over` 的门槛是该店铺单的折后金额**，不是整单，也不含运费。跨店满减摊到这家店的部分要算进去。
- **按重量计费需要 SKU 重量**，来自 `catalog.sku.weight_g`，落进报价单行作为证据。
- **续重向上取整**：超出首重的部分，不满一个续重单位也按一个算。

**运费金额的计算留在 `pricing.model.FreightFee`**，因为它的输入是前四层的中间结果；规则数据不进来。`seller` 只回答"这家店怎么收费"，不回答"这一单收多少"。

**互斥和优先级归 `promotion`，但语义由这里定死。**

- `priority` **数值小 = 优先级高**，升序执行
- 同一个 `mutex_group` 只取**资格和门槛都通过**的规则里数值最小的第一条
- 平局按 `rule_id` 升序，保证稳定

第三句最容易写错：互斥是在**过滤之后**选，不是在配置期就锁死。先按门槛筛掉不成立的，再在剩下的里按组取一条——否则第一条门槛不够，整组都不命中，白白丢掉能用的优惠。

### price_quote / price_quote_line / price_quote_rule

```sql
-- 报价单：一次算价的完整结果，也是证据
id               uuid PRIMARY KEY DEFAULT uuidv7(),
buyer_id         uuid NOT NULL,
status           text NOT NULL,        -- issued | used | expired
fingerprint      text NOT NULL,        -- 输入指纹，落单时比对
ship_address     jsonb NOT NULL,       -- 算价时的地址：运费和地区限制都看它
entitlements     jsonb NOT NULL DEFAULT '[]',  -- 券 / 会员等级等资格快照
currency         char(3) NOT NULL DEFAULT 'CNY',
goods_amount     bigint NOT NULL,
discount_amount  bigint NOT NULL,
shipping_amount  bigint NOT NULL,      -- Σ price_quote_shipping，按商家汇总
payable_amount   bigint NOT NULL,
rule_ids         uuid[] NOT NULL,      -- 命中的规则，按执行顺序
expires_at       timestamptz NOT NULL,
created_at       timestamptz NOT NULL DEFAULT now(),
CONSTRAINT ck_quote_sum CHECK (
    goods_amount - discount_amount + shipping_amount = payable_amount),
CONSTRAINT ck_quote_status CHECK (status IN ('issued','used','expired'))
```

**证据表要能自证。** 只存结果不存输入，投诉“运费为什么是 12 块”还是查不清——地址和资格必须一起落库。

```sql
-- 行结果
quote_id        uuid NOT NULL,
line_no         integer NOT NULL,
offer_id        uuid NOT NULL,
sku_id          uuid NOT NULL,
merchant_id     uuid NOT NULL,
quantity        integer NOT NULL,
unit_amount     bigint NOT NULL,
weight_g        integer,               -- SKU 重量快照，按重量计费的证据
subtotal        bigint NOT NULL,        -- 单价 × 数量
discount_amount bigint NOT NULL,        -- 本行承担的全部优惠
payable         bigint NOT NULL,        -- subtotal - discount_amount，**不含运费**
PRIMARY KEY (quote_id, line_no),
CONSTRAINT ck_line_qty     CHECK (quantity > 0),
CONSTRAINT ck_line_sub     CHECK (subtotal = unit_amount * quantity),
CONSTRAINT ck_line_disc    CHECK (discount_amount >= 0 AND discount_amount <= subtotal),
CONSTRAINT ck_line_payable CHECK (payable = subtotal - discount_amount AND payable >= 0)
```

```sql
-- 每一条被评估过的规则，命中的和没命中的都记
quote_id         uuid NOT NULL,
rule_id          uuid NOT NULL,
rule_version     text NOT NULL,       -- 规则版本，重算时能对上是哪一版
type             text NOT NULL,
scope            text NOT NULL,
bearer           text NOT NULL,
outcome          text NOT NULL,       -- applied | skipped | truncated
base_amount      bigint NOT NULL,     -- 这条规则的计费基数
threshold        bigint,              -- 门槛（没门槛为 null）
requested_amount bigint,              -- 规则算出想减多少
amount           bigint NOT NULL,     -- 实际减了多少（skipped 为 0）
allocation       jsonb,               -- {"1": 300, "2": 200}，skipped 为 null
PRIMARY KEY (quote_id, rule_id),
CONSTRAINT ck_rule_outcome CHECK (outcome IN ('applied','skipped','truncated'))
```

**`price_quote_rule` 是核心证据表**，不是"命中列表"。只记命中的，投诉"为什么没给我打折"时永远查不清——得连"看过但没过"的一起记，带上基数和门槛。

`requested_amount` 和 `amount` 分开：前者是规则想减多少，后者是被基数截断后实际减多少。两者不等就是 `truncated`。

`allocation` 存成 jsonb 而不是独立表——它是整体证据，从不单独查询，拆表只是多一次 join。

```sql
-- 每个商家单的运费，一行
quote_id       uuid NOT NULL,
merchant_id    uuid NOT NULL,
template_id    uuid NOT NULL,
charge_by      text NOT NULL,      -- weight | piece
weight_g       bigint,             -- 按重量计费时的总重
shipping_amount bigint NOT NULL,
free_applied   boolean NOT NULL,   -- 是否命中了包邮门槛
PRIMARY KEY (quote_id, merchant_id),
CONSTRAINT ck_quote_shipping CHECK (shipping_amount >= 0 AND (weight_g IS NULL OR weight_g >= 0))
```

**运费按商家算，不按整单算。** 每个店有自己的模板和包邮门槛，合并成一个整数就没法解释"为什么收我 12 块"。

`ck_line_payable CHECK (payable >= 0)` 是硬护栏：任何算法漏洞都不允许把行刷成负金额。

### 报价单状态机

```
issued ──落单──→ used
   │
   └──超时──→ expired（30 分钟，与订单超时一致）
```

一张报价单只能被用一次。重复用同一个 `quoteId` 落单，第二次直接拒——这就是下单幂等的天然锚点。

### 分摊算法

**最大余数法（largest remainder），全平台唯一实现。**

```
allocate(金额 amount, 项目集 items, 权重 w, 并列键 t) → 每项分到的整数

  1. total = Σ w(i)
  2. base(i)  = amount × w(i) ÷ total      整数除，向下取整
     frac(i)  = amount × w(i) mod total     等价于小数部分
  3. gap = amount − Σ base(i)               0 ≤ gap < 项目数
  4. 按 (frac 降序, t 升序) 排序，前 gap 项各 +1
  5. 按原顺序返回
```

四条性质，全部来自算法本身，不靠调用方小心：

- **和恒等于 `amount`**——没有尾差需要人工处理
- **每项非负**
- **与输入顺序无关**——排序是全序
- **同输入同输出**——没有浮点，没有哈希遍历

```java
static Map<Integer, Long> allocate(
        long amount, List<Line> items, ToLongFunction<Line> weight) {
    long total = items.stream().mapToLong(weight).sum();
    if (total <= 0) throw new IllegalStateException("分摊基数必须为正");

    long assigned = 0;
    List<long[]> rows = new ArrayList<>();          // {lineNo, base, frac}
    for (Line l : items) {
        long w = weight.applyAsLong(l);
        long base = amount * w / total;
        rows.add(new long[] {l.lineNo(), base, amount * w % total});
        assigned += base;
    }
    long gap = amount - assigned;
    rows.sort(Comparator.comparingLong((long[] r) -> -r[2]).thenComparingLong(r -> r[0]));
    for (int k = 0; k < gap; k++) rows.get(k)[1]++;
    return rows.stream().collect(toMap(r -> (int) r[0], r -> r[1]));
}
```

`amount × w` 必须落在 `long` 内。金额上限和基数上限之积超过 `2^63` 时要换 `BigInteger`——按当前口径（单笔百万级、行数百级）用不到。

**同一个函数，三处复用：**

| 场景               | 权重要哪一列 | 并列键    |
| ------------------ | ------------ | --------- |
| 优惠摊到行         | `subtotal`   | `line_no` |
| 商家子单摊到行     | `subtotal`   | `line_no` |
| 行摊到件（部分退） | 每件 1       | 件序号    |

**尾差不需要额外规则。** 最大余数法本身就把余数分给小数部分最大的那几行，并列按 `line_no` 稳定。「尾差给最后一行」那种写法是错的：它会让最后一行的金额系统性偏大，退货时一看就露。

### 串行顺序与基数

优惠不是并行的——券后的钱再打折才符合直觉，并行会减到负数。

```
applied_groups = {}
for rule in rules（按 priority 升序，数值小者优先；平局按 rule_id）:
    scope_lines = lines 里范围匹配的行
    base = Σ (base_mode == original ? subtotal : payable)
    if rule 有门槛 且 base < threshold:
        记 skipped 证据，continue
    if rule.mutex_group 且 rule.mutex_group in applied_groups:
        记 skipped 证据（互斥），continue
    amount = min(quote(rule, base), base)      // 截断，不许超过基数
    alloc  = allocate(amount, scope_lines, subtotal)
    逐行: discount_amount += alloc; payable -= alloc
    if rule.mutex_group: applied_groups.add(rule.mutex_group)
```

`mutex_group` 的判断放在门槛之后：先过门槛，再按优先级取同组第一条；同组第一条不满足门槛时，后面的规则仍然有机会命中。

两处必须显式：

- **`base_mode` 可配。** 满减通常看原价（`original`），券通常看余额（`after_previous`）。这是配置，不是代码分支。
- **`amount` 截断到 `base`。** 券比商品金额大时截断并记 `truncated = true`，不许出现负数行。多出来的部分不退不补，凭证上留痕。

## 4. 关键时序

### 试算：结算页

```
前端带 (lines, address, entitlements) → pricing
  → 向 promotion 取生效规则（按类目 + 时间过滤，不捞全平台）
  → 校验每行可售（状态、类目授权由 trade 传入，pricing 不查库存）
  → 五层跑完，落 price_quote(issued) + 行 + 证据
  → 返回 { quoteId, 每行金额, 优惠明细, 运费, 应付, expiresAt }
```

### 落单：trade 带 `quoteId` 回来

```
trade 带 quoteId + 当前购物车快照 → pricing
  → 查 quote：status 必须是 issued，未过期
  → 比对 fingerprint（商品、数量、地址、规则版本）
  → 不一致：返回 PRICE_CHANGED，附新报价，让用户确认
  → 一致：把行金额和分摊矩阵交给 trade；trade 调 pricing.consumeQuote(quoteId)，
        在同一个下单事务里由 pricing 自己执行：
        UPDATE price_quote SET status='used' WHERE id=? AND status='issued'
        影响 0 行 → 这张报价刚被别的请求用掉了 → 拒单
```

**CAS 必须和插单在同一个事务**，不能在这里先置 `used` 再让 trade 落单——插单失败就白烧一张报价。命令由 `pricing` 提供，SQL 住在 `pricing` 的 mapper，`trade` 不直接写 `pricing` 的表。

**`fingerprint` 是规范化输入的摘要**：行按 `sku_id` 排序、地址归一（省市区 + 详细串）、`rule_version` 列表排序，一起做 SHA-256。不做归一，两次一模一样的请求会算出两个不同的指纹。

**`fingerprint` 不一致时不能"悄悄用新价"。** 结算页显示 99、扣款 109，是投诉里最难解释的一类。

### 部分退款：按快照摊到件

```
退 2 件 / 共 5 件：
  allocate(该行 discount_amount, 5 件, 每件权重 1)
  → 每件分摊额，退的 2 件按各自分摊额退
```

**不重新跑算价。** 重跑会因为规则版本、优先级变化产生和原单不一致的数字，用户一眼就能看出来。

## 5. 失败模式与未决

### 会错在哪

| 现象                         | 根因                           | 怎么防                                               |
| ---------------------------- | ------------------------------ | ---------------------------------------------------- |
| 分摊之和比优惠总额少 1 分    | 每行各自四舍五入               | 只有最大余数法一处整数化                             |
| 行金额被减成负数             | 优惠没截断到基数               | `amount = min(quote, base)` + `CHECK (payable >= 0)` |
| 同一订单算两次结果不同       | 用浮点，或遍历顺序不稳定       | 全整数、全序排序                                     |
| 老订单重算对不上             | 优先级配置改了                 | 快照里存 `rule_ids` 顺序，重算只用于解释不用于出账   |
| 落单价比试算贵               | 没校验 `quoteId` / fingerprint | 过期或变更一律返回 `PRICE_CHANGED`                   |
| 结算基数算错                 | 优惠没记 `bearer`              | 上线前校验 `bearer` 非空                             |
| 两条同组优惠同时命中         | 互斥只在配置期检查             | 运行期先过门槛、再按组取数值最小的一条               |
| 运费被商品优惠抵掉           | 两条钱混一起                   | 运费独立成层，商品优惠不进运费                       |
| 部分退款后各行实付和原单不符 | 退款时重新算分摊               | 按快照摊到件，不重算                                 |
| 券超发                       | 预算在并发下扣减               | 预算控制属于券那一层，现在不做                       |

### 还没想清

- **运费券要不要做。** 现在商品优惠不能抵扣运费，运费券需要单独一条通路，等真实需求。
- **优惠预算的并发扣减。** 满减活动限前 1000 单，这需要 Redis 或行锁，属于券那一层的题，不是算价的。
- **赠品、加价购。** 它们改了行的构成，不只是金额，接进来要动订单行模型。
- **多币种。** 现在只有 CNY，`currency` 列已经预留，但运费模板和汇率一条都没做。
- **会员价接回来要改依赖。** 模块 README 的 `depends_on` 已经从 `member` 去掉，做会员价时再加回。

## 实现契约

- **表**：4 张，见 §3（运费模板在 `seller`，不在此列）
- **库约束**：`ck_quote_sum`、`ck_quote_status`、`ck_line_qty/sub/disc/payable`、`ck_quote_shipping`、`ck_rule_outcome`
- **输入契约**：`PricingRequest{lines[], address, entitlements[]}`；规则由 `promotion :: api` 返回 `AppliedRule[]`
- **输出契约**：`quoteId` + 每行金额 + `price_quote_rule` 全量证据 + 每商家运费
- **错误码**：`PRICE_CHANGED`
- **验收**：任意优惠组合下 `Σ allocation = amount`；同输入两次算价结果逐字节相同；互斥在门槛过滤之后生效

# 资金账务

> 回答 [questions.md](../questions.md) 第 50–62 题。落在 `clearing` 模块，schema 同名。
> 和 [database.md](database.md) 的分工：那份管表怎么建，这份管账怎么记。

## 1. 一分钟稿

> 账本只回答一句话：**余额是缓存，分录是真相；分录只追加，全库合计恒为零。**
>
> 不设借贷两列，用带正负号的金额 + 同一组内和为 0。财务看的是借贷，工程师要的是守恒——后者能用一条 SQL 验，前者要靠人看。
>
> 最重要的一条边界：**这套账本记的是"应该怎么分"，不是"钱真的在哪"。** 钱在持牌支付机构的备付金账户里，平台没有支付牌照，不碰资金池。所以平台出的是清分指令，不是转账。
>
> 商家什么时候能拿到钱：付款后进"待结算"，确认收货 + 售后窗口到期后进"可提现"，再按账期汇总成结算单，最后出打款单。
>
> 出任何差错都不许直接调余额——长短款一律进挂账，等人工处理。

## 2. 模型与不变式

### 2.1 三张表：谁的钱、哪笔业务、动了多少

| 表                        | 是什么         | 关键约束                                      |
| ------------------------- | -------------- | --------------------------------------------- |
| `clearing.ledger_account` | 谁的钱         | `(owner_type, owner_id, type, currency)` 唯一 |
| `clearing.posting_group`  | 一笔业务       | `biz_no` 唯一——这就是幂等键                   |
| `clearing.ledger_entry`   | 一个账户的变动 | 同组内金额合计为 0                            |

**五类主体**：`buyer` / `merchant` / `platform` / `channel` / `subsidy`。

**六种账户类型**：`available`（可提现）/ `pending`（待结算）/ `frozen`（冻结）/ `deposit`（保证金）/ `suspense`（挂账）/ `receivable`（应收）。

`receivable` 只给 `platform` 用：平台替商家垫付后形成的债权，正常退款不碰它。

平台级账户没有具体主体，`owner_id` 用全零 UUID 占位，不用 NULL——NULL 在唯一约束里互不相等，会让"同一币种只该有一个平台收入账户"这条约束悄悄失效。

**不建科目表。** 账户矩阵是 `5 类主体 × 6 种类型`，用枚举钉死就够。科目表是给有财务报表对接需求的系统准备的，现在加进来只会多一层没人维护的映射。

### 2.2 复式怎么表达

不设「借/贷」两列，用**带符号金额 + 组内和为 0**：

- `amount > 0` 表示该账户余额增加
- `amount < 0` 表示减少
- 同一 `group_id` 下 `sum(amount)` 必须为 0

代价是出会计报表时要把符号翻译成借贷方向。这是唯一一处必须转换的地方，比"每个写入点都记得配平"便宜得多。

### 2.3 二清：账本记的是分配，不是资金

**平台代收买家的钱、再分给商家，如果没有支付牌照，这叫"二清"**，是明确的违规业务。监管认的是"谁碰了资金池"。

所以这套系统里，钱和账是分开的：

```
买家 ──付款──→ 支付机构备付金账户 ──按平台指令分账──→ 商家绑定账户
                        ↑
                  平台只出指令、只记账
```

| 东西         | 在哪                    | 平台能不能动 |
| ------------ | ----------------------- | ------------ |
| 真实的钱     | 持牌机构的备付金账户    | **不能**     |
| 商家该得多少 | `clearing.ledger_entry` | 能（只追加） |
| 打款动作     | 持牌机构代付接口        | 只能发指令   |

**这条边界决定了两件事**：

1. 账本永远不是"银行对账单"，它是"平台认为自己应该怎么分"的内部记录。真实余额以持牌机构为准。
2. `payout` 只是"发了一条打款指令"，它的 `success` 必须由机构回执确认，不能由平台自己判定。

### 2.4 钱什么时候才算商家的

```
支付成功 → 商家 pending（待结算）
确认收货 + 售后窗口到期 → pending 转到 available（可提现）
账期结算 → settlement_batch
出款 → payout
```

**付款成功不等于商家有钱。** 这中间隔着履约和售后窗口，因为买家随时可能退。

| 阶段                | 账户                                   | 能不能提 |
| ------------------- | -------------------------------------- | -------- |
| 已付款              | `merchant.pending`                     | 不能     |
| 售后进行中          | `merchant.frozen`（从 pending 划过来） | 不能     |
| 确认收货 + 窗口到期 | `merchant.available`                   | 能       |
| 已出结算单          | 仍是 `available`，等打款               | 能       |

**账期 T+N 有必要，理由不是"平台想占款"：** 退款发生在确认收货之后，如果钱当天就打给商家，退款就得回头向商家要钱——商家没钱就变成平台垫资。T+N 是拿时间换缓冲，N 取 1 到 7 天都合理，取多久取决于退款率和商家质量。

售后窗口和账期是两个东西：窗口是"买家还能不能申请"，账期是"平台什么时候打款"。两者都要过，钱才动。

### 2.5 三个时间必须分开

| 时间         | 列            | 用途                    |
| ------------ | ------------- | ----------------------- |
| 业务发生时间 | `occurred_at` | 账期归属、报表          |
| 记账时间     | `posted_at`   | 顺序、幂等、审计追溯    |
| 可结算时间   | 派生          | 确认收货 + 售后窗口到期 |

账期按业务时间，顺序按记账时间。混用会在跨天补单和批量导入时出错——一笔昨天发生、今天入账的业务，按入账时间算就落错了月。

### 2.6 七条不变式

1. **全库分录总和恒为 0**，每个币种各算一遍。
2. **余额是缓存，分录是真相。** `account.balance` 随时可以用分录重算出来，重算不一致就是 bug。
3. **分录和分录组只追加。** 装了 `reject_mutation()` 触发器，表属主也改不了。
4. **同一 `biz_no` 只能有一组分录。** 重复提交撞唯一键，直接返回已有的 group id。
5. **差错进挂账，不许直接调余额。** "发现少三块就补上"是玩具系统在资金侧的起手式。
6. **已关闭的结算批次金额不可变。** 要改只能作废重开。
7. **售后未终态的钱不进 `available`。** 它在 `frozen` 里，除非售后被判给商家。

## 3. 表与状态机

### account / posting_group / ledger_entry

```sql
account:
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    owner_type text NOT NULL,      -- buyer | merchant | platform | channel | subsidy
    owner_id   uuid NOT NULL,      -- 平台级用全零 UUID
    type       text NOT NULL,      -- available | pending | frozen | deposit | suspense | receivable
    currency   char(3) NOT NULL,
    balance    bigint NOT NULL DEFAULT 0,   -- 缓存，可重算
    UNIQUE (owner_type, owner_id, type, currency)

posting_group:
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    biz_no      text NOT NULL UNIQUE,     -- 幂等键
    biz_type    text NOT NULL,            -- payment | refund | settle | payout | adjust | hold
    occurred_at timestamptz NOT NULL,
    posted_at   timestamptz NOT NULL DEFAULT now(),
    rule_version text,                    -- 结算类分组必须带
    memo        text

ledger_entry:
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    group_id    uuid NOT NULL,
    account_id  uuid NOT NULL,
    amount      bigint NOT NULL,          -- 有符号
    currency    char(3) NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
```

`posting_group` 和 `ledger_entry` 都挂拒绝修改的触发器。`biz_no` 稳定格式：`<业务类型>:<业务号>:<动作>:<序号>`，例如 `refund:SO2026…:item1:1`。

### clearing_statement / settlement_batch / payout

```sql
clearing_statement:      -- 每单一条，清算明细
    id, seller_order_id, merchant_id, currency,
    goods_amount, discount_amount, shipping_amount,
    commission_amount,        -- 佣金
    tech_fee_amount,          -- 技术服务费
    payable_amount,           -- 商家应收
    rule_version text NOT NULL,   -- 一年后规则改了，得能解释这笔按哪版算
    created_at,
    UNIQUE (seller_order_id)     -- 一单只有一条，重跑不能写出第二条

settlement_batch:        -- 按账期汇总
    id, merchant_id, currency, period_start, period_end,
    payable_amount, refund_amount, commission_amount, net_amount,
    status text,             -- open | closed | paying | paid | failed
    closed_at, paid_at,
    UNIQUE (merchant_id, currency, period_start, period_end)

payout:                  -- 出款指令
    id, batch_id, merchant_id, currency, amount,
    channel, channel_txn_no,
    idempotency_key text NOT NULL,  -- batch_id:channel:序号
    status text,             -- created | submitted | success | failed
    submitted_at, settled_at, fail_reason,
    UNIQUE (idempotency_key)
```

**`rule_version` 是这层最容易漏、事后又补不回来的一列。** 佣金率、分摊规则会变，变了以后旧单子必须还能解释。

### 状态机

```
settlement_batch:  open ──账期结束──→ closed ──发起打款──→ paying ──回执成功──→ paid
                                      │                        │
                                      └──作废──→ 重开          └──回执失败──→ failed
payout:            created ──提交──→ submitted ──回执──→ success / failed
```

`paying` 挂在批次上、`submitted` 挂在单笔打款上：一个批次可能拆成多笔出款（不同银行通道），任何一笔失败整批进 `failed`，已成功的部分不重打。

## 4. 关键时序

### 支付成功：只认渠道回调

```
渠道回调 → payment 验签、落支付单 → 发 PaymentSucceeded(amount, expectedAmount, matched)
  → clearing：matched=true 记正常组；matched=false 整组进 suspense
  → trade 收到后独立校验金额、推进支付状态
```

**两边都做，但各管一段。** `clearing` 按 `matched` 分流记账，`trade` 独立校验订单应付。金额不一致时 `clearing` 不记 `buyer -amount / channel +amount` 的正常组，整组直接进 `suspense`；`trade` 拒收，订单不发货。`matched` 由 `payment` 在回调时按支付单金额和订单应付比对后写入，别让两边各算一次。

> **两层 suspense 别混。** 这一段说的是**账本分录**（clearing 记账口径，本节设计，尚未落码）。
> 运维侧的挂账台账已落地：`payment.suspense_entry` 登记「钱到但推进不了」的三种情况，
> 配管理端清单与人工退款入口（见 payment 模块 README）——先有台账让人把钱退对，
> 再把分录补上。

### 回调重放、乱序、超时

| 情况     | 表现                         | 处理                                           |
| -------- | ---------------------------- | ---------------------------------------------- |
| 重放     | 同一个 `channelTxnId` 来两次 | `biz_no` 撞唯一键，返回已有 group，不重复记账  |
| 乱序     | 先到"退款成功"再到"支付成功" | 按支付单自己状态机推进，已终态的回调只记不入账 |
| 超时不到 | 用户说付了但没回调           | 主动查单接口补；查单结果和回调走同一条路       |
| 金额不符 | 回调金额 ≠ 订单应付          | **不记正常组，整组进 `suspense`，告警**        |

金额不符这条要单独说：**不能以渠道金额为准去改订单，也不能忽略回调。** 钱确实到了，但到得不对，只能挂账等人查。挂账期间这单不发货。

### 退款：反向组，不删不改

```
卖家A 的 184 块要退：
  组 4  退款
    卖家A available   -184
    代收账户(channel)  +184
```

原分录原样留在库里。**冲正不是 `amount = -amount` 改原行**，是新开一组 `biz_no = 原号 + ":reversal"`。

退款的四个组成，各自走各自的分录：

| 退什么   | 找谁 | 说明                                   |
| -------- | ---- | -------------------------------------- |
| 商品款   | 商家 | 按 `order_line_discount` 的实付分摊退  |
| 佣金     | 平台 | 按比例退回，否则商家白付了佣金         |
| 运费     | 商家 | 整单退才退；部分退不退                 |
| 平台补贴 | 平台 | 平台出的钱不向商家追，单独一条反向分录 |

**平台券、积分、商家券整块不做**（`promotion` 还没开工）。规则想清楚了再进来，不要先留半个字段。

### 售后进行中：冻结，不是扣减

```
售后单创建 → 行金额从 merchant.pending 划到 merchant.frozen
售后判给买家 → frozen → 退款组
售后判给商家 → frozen → available
售后撤销    → frozen → 钱现在的家（订单还没完成回 pending；完成了/已结算回 available）
```

**粒度是订单行，不是订单。** 一个订单三行，只退一行时冻结那一行的金额。按订单冻结会把没争议的钱一起冻住，商家的现金流无端变差。

冻结**要产生一组新的分录组**（`biz_type = hold`），分录是 `merchant.frozen +n / merchant.pending -n`。它不改商家总权益，只是把同一笔钱从"待结算"挪到"冻结"；没有 posting group 就没有分录，`ledger_entry.group_id NOT NULL` 也落不下去。

**冻着的钱有三个出口，全部要认冻结**（漏一个，商家就能把冻着的钱提走）：

1. **订单完成解冻（release）**：解冻额 = 净额 − 已退份额 − 未终态冻结之和。只扣已退不扣冻结，
   pending 会被划成负数、available 多出一笔冻着的钱——买家"未收货仅退款"遇上订单完成
   （买家确认 / 10 天自动确认 / 轨迹签收）时必踩，缺口挂死在 pending 上
2. **结算批次认领（DUE_ITEMS 的 NOT EXISTS frozen）**：有未终态冻结的明细不进批次，
   冻结解开（撤销/被拒）下一批照结
3. **撤销解冻（releaseHold）**：回款目的地按**当时的**明细状态定——从 pending 冻的但订单
   已完成，钱的家已经是 available，回 pending 就挂死（pending 只有订单完成一条出口）

### 结算到打款

```
日终：把确认收货 + 窗口到期的 pending 汇总成 clearing_statement
账期结束：按商家聚合进 settlement_batch(status=closed)，金额从此不可变
打款日：生成 payout(submitted) → 调持牌机构代付 → 回执 → success / failed
```

### 对账：三层，从便宜到贵

| 层   | 对什么                                   | 频率 |
| ---- | ---------------------------------------- | ---- |
| 内部 | 分录重算余额 vs `account.balance`        | 日终 |
| 渠道 | 渠道对账单 vs 平台流水，按渠道流水号匹配 | 每日 |
| 三方 | 订单金额 vs 清算金额 vs 打款金额         | 每日 |

差异一律进 `suspense`，形成工单。

**对账的目标不是把差异抹平，是把差异找出来并留痕。** 一个能自动抹平差异的对账系统，等于没有对账。

## 5. 失败模式与未决

### 会错在哪

| 现象                     | 根因                       | 怎么防                                   |
| ------------------------ | -------------------------- | ---------------------------------------- |
| 余额和分录对不上         | 有人绕过分录改了 `balance` | 日终重算，不一致就报警；余额只由分录驱动 |
| 同一笔支付记了两次账     | 回调重放没幂等             | `biz_no` 唯一键                          |
| 回调金额不对却照样发货   | 没有金额校验               | 不符就挂账 + 告警，订单侧拒收            |
| 退款后佣金没退，商家白付 | 只退商品款                 | 佣金单独走反向分录                       |
| 对账差异被"调平"         | 图省事直接改余额           | 只许进 `suspense`，触发器防改            |
| 已关闭的批次被改金额     | 把 `closed` 当普通状态     | 关闭即冻结，要改只能作废重开             |
| 售后没结束钱就到商家手里 | 只判了确认收货，没判售后   | 有未终态售后的行不进 `available`         |
| 跨天补单落错账期         | 用记账时间算账期           | 账期一律按 `occurred_at`                 |

### 这一版不做

| 不做              | 为什么                                                | 什么时候回来看   |
| ----------------- | ----------------------------------------------------- | ---------------- |
| 多币种换算        | `currency` 列留了，但只允许同币种记账                 | 真要做跨境时     |
| 科目表            | 账户矩阵够用，科目表是给财务系统对接用的              | 接财务软件之前   |
| 分录分片          | 判据见 database.md 第 6 节，分片键只能是 `account_id` | 单表过 2000 万行 |
| 平台券 / 积分冲销 | `promotion` 和 `member` 都还没开工                    | 它们有文档之后   |
| 自动判责赔付      | 先行赔付先做成人工，规则没稳定前自动化风险大          | 仲裁量上来以后   |

### 还没想清

- **保证金扣款的分录形状。** 保证金是 `deposit` 账户，扣它算不算平台收入？现在当成"从商家保证金转到平台"，但监管口径可能要求原路退回。
- **打款失败的追偿顺序。** 同城商家的账户信息错了，钱退回来以后是重新打还是转挂账？要等真实失败率。
- **账期的粒度。** 现在按天汇总，实际可能按周更稳。取决于退款率。
- **合并退款的分录。** 一张支付单付了三个订单组，退其中一个时渠道侧只退一次，账本要拆成三组还是并成一组，没定。

---

## 实现契约

- **表**：6 张，见 §3
- **库约束**：`account` 四元组唯一、`posting_group.biz_no` 唯一、`clearing_statement.seller_order_id` 唯一、`payout.idempotency_key` 唯一、`ledger_entry` 与 `posting_group` 挂 `reject_mutation()`
- **日终校验**：三条检查落 `clearing.reconciliation_run`，见 `clearing` 模块 README 的「对账」一节。
  差异只报告不抹平——自动调平等于没有对账
- **事件**：消费 `SellerOrderPlaced` / `OrderPaid` / `OrderCompleted` / `RefundSucceeded` / `DisputeResolved`；发 `SplitPosted` / `ReconciliationBroken`
- **错误码**：`LEDGER_UNBALANCED`、`DUPLICATE_BIZ_NO`、`SETTLEMENT_LOCKED`
- **验收**：重复 `biz_no` 不重复记账；已 `closed` 的批次改金额被拒；余额重算与缓存一致；`payout` 重复提交只出一次款

### 已实现的部分（2026-10-23）

上面是目标形态。**现在真正跑起来的是"支付 → 解冻 → 冻结 → 结算 → 打款 → 退款冲销"这一条**，
外加内部对账（日终 + 手动触发）。其余（赔付、渠道对账、三方对账）还是纸面。

| 已实现                    | 落在哪                                                                           |
| ------------------------- | -------------------------------------------------------------------------------- |
| 入账（`OrderPaid`）       | `merchant.pending +net` / `platform.available +佣金` / `channel −payable_amount` |
| 解冻（`OrderCompleted`）  | `pending −剩余净额` / `available +剩余净额`（收货前退过款就只划剩下的）          |
| 冻结（`returns` 同步调）  | `pending/available −商家净额` / `frozen +商家净额`，结算跳过这笔                 |
| 冲销（`RefundSucceeded`） | `frozen −商家净额`（没冻过就 `available`）/ `platform −佣金` / `channel +退款额` |
| 出款（T+7 日结）          | `settlement_batch` → `payout(mock)` → `available −net` / `channel +net`          |

五条落地时定下的口径，和上面的设计稿有出入，以这里为准：

1. **没有买家钱包，`channel` 当外部对手方。** 设计稿写的是 `buyer −amount / channel +amount`，
   但买家没有余额账户。现在 `channel` 为负表示平台净流入，全链闭合时它只剩佣金。
2. **冲销打 `available`，不区分 `pending` / `frozen`。** 退款可能发生在结算之后，
   打 `available` 才能把已经结走的钱扣回来；余额变负就是商家欠平台，下一批抵扣。
3. **佣金固定 500bp，按商品款算。** `commission_template` 在 `governance` 里还没建，
   所以写死在 `PostingService.COMMISSION_BP`；接模板时只改这一处。
4. **账期 `shop.clearing.hold` 默认 `PT168H`（7 天）**，测试时可设 `PT0S`。
5. **退款额是 `payable_amount` 口径，商家承担额是 `net` 口径，两者差一个佣金。**
   `settlement_item.refunded_amount` 记的是买家退了多少钱，而商家损失的是其中按 `net : payable_amount`
   拆出来的那部分。拿前者直接减净额，商家就被多扣了佣金——这个错不报错，只让每个退过款的商家少收钱。
   换算只有一处实现：`clearing.model.MerchantShare`，用「累计之差」算增量，
   分几次退都不会因为逐次截断而漂。解冻同理：收货前退过款，`pending` 里已经少了一截，
   按全额 `net` 划过去会把它划成负数。

## 范围外，但常被问

**「平台自营的资金流」** ——不做。有自营就是 1P，商品所有权在平台，账务模型完全不同（库存资产、成本结转），不是一个模块能扩出来的。

**「平台给商家放贷」** ——不做。那是 `funding` 的范围，属于资金方的债权，不进交易账本。

# clearing — 资金账务

```yaml
module: clearing
layer: 核心域
schema: clearing
status: implemented
depends_on: ["trade :: events", "payment :: events"]
emits: ["SplitPosted", "ReconciliationBroken"]
consumes:
    [
        "OrderPaid",
        "OrderCompleted",
        "RefundSucceeded",
        "SellerOrderPlaced",
        "DisputeResolved",
        "SellerSuspended",
    ]
```

核心域。schema：`clearing`。规则见 [ledger.md](../../../../../../../../../docs/domain/ledger.md)。

## 模块契约

**没有同步 api 被任何模块调用，也没有调用任何模块。** 契约全在事件上：

| 方向 | 事件                                                        | 含义                               | 落地了吗      |
| ---- | ----------------------------------------------------------- | ---------------------------------- | ------------- |
| 输入 | `OrderPaid`                                                 | 钱进来：商家待结算 + 平台佣金      | ✅            |
| 输入 | `OrderCompleted`                                            | 确认收货：待结算 → 可提现          | ✅            |
| 输入 | `RefundSucceeded`                                           | 退款冲销：商家退商品款、平台退佣金 | ✅            |
| 输入 | `SellerOrderPlaced` / `DisputeResolved` / `SellerSuspended` | 冻结、赔付、封店处置               | ❌ 未实现     |
| 输出 | `ReconciliationBroken`                                      | 对账发现差异                       | ✅ 发了没人收 |
| 输出 | `SplitPosted`                                               | 分账已落                           | ❌ 只有声明   |

| 方向 | 调用方    | 方法                                                                    | 用途              |
| ---- | --------- | ----------------------------------------------------------------------- | ----------------- |
| 输入 | `returns` | `ClearingCommand.freeze(caseId, sellerOrderId, refundAmount, currency)` | 售后一落库就冻上  |
| 输入 | `returns` | `ClearingCommand.unfreeze(caseId)`                                      | 撤销 / 拒绝时退回 |

**读侧只有 HTTP，没有模块 api。** 商家查自己的钱走 `/api/seller/settlement/*`；
别的模块要读余额，仍然应该发事件或带参数来，不要让 `clearing` 变成一个人人可查的数据库。

**金额随事件走，不回查。** `clearing → trade :: api` 会成环（`trade` 已经依赖 `clearing` 的事件方向），
所以 `OrderPaid` 里带着每个子单的 `goodsAmount` / `payableAmount`——下游拿不到金额就只能记糊涂账。

## 钱的四段路

| 阶段 | 触发              | 分录                                                                                       | 结果                     |
| ---- | ----------------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| 入账 | `OrderPaid`       | `channel −payable` / `merchant.pending +net` / `platform.available +佣金`                  | 商家看得到、提不出       |
| 解冻 | `OrderCompleted`  | `pending −剩余净额` / `available +剩余净额`（收货前退过款就只划剩下的）                    | 可提现                   |
| 冻结 | `returns` 同步调  | `pending/available −商家净额` / `frozen +商家净额`                                         | 结算跳过这笔             |
| 冲销 | `RefundSucceeded` | `frozen −商家净额`（没冻过就 `available`）/ `platform.available −佣金` / `channel +退款额` | 余额可为负（商家欠平台） |
| 出款 | 日结 T+7          | `merchant.available −net` / `channel +net`                                                 | 钱离开平台               |

**符号约定**：正数 = 该主体余额增加。没有买家钱包，所以用 `channel` 当代收账户，
**它为负表示平台净流入**。全链闭合时 `channel` 只剩佣金那部分。

**冲销打 `available` 而不是 `pending`**：退款可能发生在结算之后，打 `available` 才能把已经结走的钱扣回来。
余额变负是正常状态，下一批结算自然抵扣——禁止负余额等于逼系统去改历史分录。

## 商家看到的三个数

`/api/seller/settlement/{accounts,items,batches}`，走 `FINANCE_READ` 权限 + 商家归属。

| 端点       | 回答                         | 注意                                                                             |
| ---------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `accounts` | 我现在有多少钱               | 按 `available` / `pending` / `frozen` 分开，**不求和**——合起来会让人以为全都能提 |
| `items`    | 每个子单卡在哪一步、能结多少 | `settleableAmount` 由 `MerchantShare` 换算，不是 `net − 买家退款`                |
| `batches`  | 什么时候打了多少、到账没有   | LEFT JOIN `payout`：批次已生成但还没出款时，商家该看到"钱在路上"                 |

**退款额与商家承担额是两个数。** `refundedAmount` 是买家退了多少（`payable` 口径），
`merchantRefunded` 是其中商家承担的部分（`net` 口径）。直接相减会让商家被多扣掉退款里的佣金。

## 对账：只报告，不抹平

日终跑一次（`shop.clearing.reconcile.cron`，默认 02:30），也可 `POST /api/admin/clearing/reconciliation/run` 手动触发。
结果落 `clearing.reconciliation_run`，发现差异时发 `ReconciliationBroken`。

三条检查，都是纯 SQL 能回答的：

| 检查                  | 问什么                                      | 对不上说明                 |
| --------------------- | ------------------------------------------- | -------------------------- |
| `group_unbalanced`    | 每个 `posting_group` 的 `sum(amount) = 0`？ | 有人绕过 `Ledger` 写了分录 |
| `currency_unbalanced` | 每个币种全库合计 = 0？                      | 同上，但能指出差在哪个币种 |
| `balance_mismatch`    | `account.balance` 等于该账户分录之和？      | 缓存被绕过写了；真相没坏   |

**为什么用 `REPEATABLE READ`**：三条检查要看见同一个瞬间的账本。默认 `READ COMMITTED` 下每条语句各拿一次快照，
一笔正在记的账可能被第一条看见、被第三条看不见，于是报出一个根本不存在的差异。

**为什么不自动修**：前两条成立时账本已经坏了，往 `suspense` 记一笔"调平"会把坏账变成一个看起来正常的数字；
第三条真相没坏、重算就能修，但**谁在什么时候改了缓存**这个信息一旦被覆盖就永远丢了。所以三条一律只报告。
一个能自动抹平差异的对账系统，等于没有对账。

**样本会截断**（每类最多 20 条），真实数量单独记在 `count` 里。一万个账户对不上时，
把一万条塞进一个 jsonb 只会让这条记录本身查不动。

**增量水位**：每次只扫"上一次成功对账之后动过的账"（水位回拨 1 小时做窗口重叠）。
账本只追加、余额只随分录变，水位之前查过且之后没动过的对象不可能自己坏掉；
每晚全量等于把成本交给账本长度线性涨。没有成功记录时水位落到 EPOCH，等价于全量——
第一条底线是全查出来的。`currency_unbalanced` 的合计仍按币种全量算，只是只挑"有新分录组"的币种查。

**不在范围内**：渠道对账要对账单文件、三方对账要清算与打款回执，两份数据源都没有。
写出来的"对账"只能是假装对过，比不做更坏。另外"记了业务没记钱"（空的分录组）也不在这里——
空集求和是 0，按上面第一条它算合格，那是另一条规则。

## 拥有什么

`account` `posting_group` `ledger_entry` `settlement_item` `settlement_batch` `payout` `freeze_item`
`reconciliation_run`

**账本是真相，后三张是进度。** `account.balance` 只是分录的缓存，可随时重算；
`settlement_item` / `settlement_batch` / `payout` 记的是"结到哪一步了"，不参与算余额。

## 目录

```
clearing/
├── api/         ClearingCommand：给 returns 的 freeze / unfreeze
├── events/      ReconciliationBroken
├── model/       FindingKind（三类差异）、MerchantShare（退款 → 商家承担，唯一实现）
├── controller/  AdminReconciliationController（看最近几次 / 立刻跑一次）、
│                SellerSettlementController（商家的余额 / 明细 / 批次）
├── service/     Ledger（唯一记账入口）、PostingService（四种分录形状）、
│                LedgerEvents（三个事件）、SettlementService + SettlementJob（T+7 日结，
│                每商家一个事务，dueItems 用 FOR UPDATE SKIP LOCKED 认领防多实例重复打款）、
│                ReconciliationService + ReconciliationJob（日终对账）
└── mapper/      LedgerMapper、AccountMapper（按需建账户）、SettlementMapper、
                 FreezeMapper、ReconciliationMapper、SettlementQueryMapper（读侧）
```

## 佣金

**固定 500bp（5%），按商品款算，不含运费。** 写死在 `PostingService.COMMISSION_BP` 一处。

费率模板本该归 `trust`（`commission_template` 表），现在还没建，所以先写死。
接模板时只改 `commissionOf` 一处，四个分录形状不用动。

## 闭环断点

- **打款是 mock**：`channel_txn_id = MOCK-PAYOUT-*`，记账照记、钱不出门。真接渠道要等异步回执，
  回执成功之前不能记账
- **读侧只有最近 N 条**：`limit` 上限 100，没有游标翻页，看不到更早的明细
- **`ReconciliationBroken` 发了没人收**：现在唯一的出口是 `GET /api/admin/clearing/reconciliation`，
  真正的告警/工单要等 observability 那一层
- **只有内部对账**：渠道层与三方层要外部数据源，一条都没做
- **声明了 6 个消费事件，只实现 3 个**：`SellerOrderPlaced`、`DisputeResolved`、`SellerSuspended` 还没接

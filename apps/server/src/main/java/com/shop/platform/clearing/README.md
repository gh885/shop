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

| 方向 | 事件                                                        | 含义                               | 落地了吗   |
| ---- | ----------------------------------------------------------- | ---------------------------------- | ---------- |
| 输入 | `OrderPaid`                                                 | 钱进来：商家待结算 + 平台佣金      | ✅         |
| 输入 | `OrderCompleted`                                            | 确认收货：待结算 → 可提现          | ✅         |
| 输入 | `RefundSucceeded`                                           | 退款冲销：商家退商品款、平台退佣金 | ✅         |
| 输入 | `SellerOrderPlaced` / `DisputeResolved` / `SellerSuspended` | 冻结、赔付、封店处置               | ❌ 未实现  |
| 输出 | `SplitPosted` / `ReconciliationBroken`                      | 分账已落、对账不平                 | 发了没人收 |

| 方向 | 调用方    | 方法                                                                    | 用途              |
| ---- | --------- | ----------------------------------------------------------------------- | ----------------- |
| 输入 | `returns` | `ClearingCommand.freeze(caseId, sellerOrderId, refundAmount, currency)` | 售后一落库就冻上  |
| 输入 | `returns` | `ClearingCommand.unfreeze(caseId)`                                      | 撤销 / 拒绝时退回 |

**金额随事件走，不回查。** `clearing → trade :: api` 会成环（`trade` 已经依赖 `clearing` 的事件方向），
所以 `OrderPaid` 里带着每个子单的 `goodsAmount` / `payableAmount`——下游拿不到金额就只能记糊涂账。

## 钱的四段路

| 阶段 | 触发              | 分录                                                                                       | 结果                     |
| ---- | ----------------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| 入账 | `OrderPaid`       | `channel −payable` / `merchant.pending +net` / `platform.available +佣金`                  | 商家看得到、提不出       |
| 解冻 | `OrderCompleted`  | `merchant.pending −net` / `merchant.available +net`                                        | 可提现                   |
| 冻结 | `returns` 同步调  | `pending/available −商家净额` / `frozen +商家净额`                                         | 结算跳过这笔             |
| 冲销 | `RefundSucceeded` | `frozen −商家净额`（没冻过就 `available`）/ `platform.available −佣金` / `channel +退款额` | 余额可为负（商家欠平台） |
| 出款 | 日结 T+7          | `merchant.available −net` / `channel +net`                                                 | 钱离开平台               |

**符号约定**：正数 = 该主体余额增加。没有买家钱包，所以用 `channel` 当代收账户，
**它为负表示平台净流入**。全链闭合时 `channel` 只剩佣金那部分。

**冲销打 `available` 而不是 `pending`**：退款可能发生在结算之后，打 `available` 才能把已经结走的钱扣回来。
余额变负是正常状态，下一批结算自然抵扣——禁止负余额等于逼系统去改历史分录。

## 拥有什么

`account` `posting_group` `ledger_entry` `settlement_item` `settlement_batch` `payout` `freeze_item`

**账本是真相，后三张是进度。** `account.balance` 只是分录的缓存，可随时重算；
`settlement_item` / `settlement_batch` / `payout` 记的是"结到哪一步了"，不参与算余额。

## 目录

```
clearing/
├── service/     Ledger（唯一记账入口）、PostingService（四种分录形状）、
│                LedgerEvents（三个事件）、SettlementService + SettlementJob（T+7 日结）
└── mapper/      LedgerStore、AccountStore（按需建账户）、SettlementStore
```

## 佣金

**固定 500bp（5%），按商品款算，不含运费。** 写死在 `PostingService.COMMISSION_BP` 一处。

费率模板本该归 `trust`（`commission_template` 表），现在还没建，所以先写死。
接模板时只改 `commissionOf` 一处，四个分录形状不用动。

## 闭环断点

- **打款是 mock**：`channel_txn_id = MOCK-PAYOUT-*`，记账照记、钱不出门。真接渠道要等异步回执，
  回执成功之前不能记账
- **没有读侧 api**：商家查余额、查待结算只能读表
- **没有对账**：`SplitPosted` / `ReconciliationBroken` 发了没人收，余额与分录的重算比对没做
- **声明了 6 个消费事件，只实现 3 个**：`SellerOrderPlaced`、`DisputeResolved`、`SellerSuspended` 还没接

# clearing — 资金账务

```yaml
module: clearing
layer: 核心域
schema: clearing
status: implemented
depends_on: ["trust :: api"]
emits: ["SplitPosted", "ReconciliationBroken"]
consumes: ["SellerOrderPlaced", "OrderPaid", "RefundSucceeded"]
```

核心域。schema：`clearing`。规则见 [ledger.md](../../../../../../../../../docs/domain/ledger.md)。

## 三张表

| 表                       | 是什么         | 关键约束                       |
| ------------------------ | -------------- | ------------------------------ |
| `clearing.account`       | 谁的钱         | `(owner, type, currency)` 唯一 |
| `clearing.posting_group` | 一笔业务       | `biz_no` 唯一 = 幂等键         |
| `clearing.ledger_entry`  | 一个账户的变动 | 组内金额合计必须为 0           |

`balance` 是缓存不是真相源：真相是所有分账的累计，日终用它重算一遍再跟这里比。

## 目录

```
clearing/
├── service/     Ledger：配平校验、幂等分支、按行更新余额
└── mapper/      LedgerStore：唯一的 SQL
```

`Ledger.post(bizType, bizNo, currency, lines)` 是**唯一**写分录的入口。

## 三条铁律

**全库分录总和恒为 0。** `select currency, sum(amount) from ledger_entry group by currency` 必须全零。
不成立说明有人绕过分录改了余额，或者分录写了一半就提交了。测试里一直在验这一条。

**冲正，不修改。** 纠错靠新开一组反向分录。`ledger_entry` 和 `posting_group` 上有
`common.reject_mutation()` 触发器，**应用账号是表属主也改不掉**。

**差错先挂账，不改数。** 长款短款进 `suspense` 账户，形成工单等人工处理。
「发现少三块就补上」是玩具系统在资金侧的起手式。

## 复式怎么表达

不设借贷两列，用**带符号金额 + 组内和为 0**：`amount > 0` 是余额增加，`< 0` 是减少。

财务看到的是借贷，工程师要的是守恒。两者等价，但后者能一条 SQL 校验。

## 闭环状态

**这个环断得最厉害。**

- 分录层：闭环（配平、幂等、冲正、余额、只追加，六个测试覆盖）
- **往上游断**：没有 `payment` 模块，买家付的钱进不来。支付回调、渠道对账单都不存在
- **往下游断**：没有清算单、结算单、打款单。钱记在卖家 `available` 账户里，出不去
- **没有对账任务**：内部重算、渠道对账、三方核对，一个都没有
- **挂账是空账户**：`suspense` 类型建了，没有任何代码往里写
- **没有会计期间**：`biz_date` 列在，但没有日切机制决定「业务日期」是谁。跨日冲正会落错期间

也就是说：**现在能记一本不会错的账，但这本账只有一个口（测试），钱进不来也出不去。**

补齐的顺序是 `payment`（进来）→ `clearing_statement`（算清）→ `settlement_batch`（汇总）→ `payout`（出去）
→ 对账 → 挂账工单。其中 `rule_version` 必须在清算单一开始就带上——规则改了以后，旧单子得能解释按哪版算的。

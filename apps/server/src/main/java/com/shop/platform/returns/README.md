# returns — 售后

> 核心域 · schema `returns` · 进行中

```yaml
module: returns
layer: 核心域
schema: returns
status: in-progress
depends_on:
    ["trade :: api", "payment :: api", "payment :: events", "clearing :: api", "inventory :: api"]
emits: []
consumes: ["RefundSucceeded"]
```

## 职责

仅退款、退货退款、换货、逆向物流、超时自动处置。

## 模块契约

### 输入

| 来源               | 拿什么                                                                                         | 用在哪        | 拿不到会怎样                              |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------- |
| `trade :: api`     | `findRefundable(sellerOrderId, lineNo)` → `RefundableLine`：数量、已退数量、**实付**、已退金额 | 提交时算钱    | 行不存在 / 不属于这个买家 → 404，整单不算 |
| `trade :: api`     | `recordRefund(sellerOrderId, lines)`：回写件数与金额计数器                                     | 退款到账后    | 超上限影响 0 行 → 409，事务回滚           |
| `payment :: api`   | `refund(orderGroupId, sellerOrderId, amount, currency, reason)` → 是否受理                     | 确认退款时    | 渠道没受理 → 留在 `refunding`，不假装成功 |
| 事件               | `RefundSucceeded`（按 `bizRef` = 售后单 id 归位）                                              | 异步退款完成  | 收不到就停在 `refunding`，人工介入        |
| `clearing :: api`  | `hold(caseId, sellerOrderId, refundAmount, currency)` / `releaseHold(caseId)`                  | 提交 / 撤销时 | 冻不上，结算可能把钱打给商家              |
| `inventory :: api` | `restock(RestockRequest)`：退货入库，实物加、可售加                                            | 商家签收退货  | 货回来了但账上不认，可售永远少一批        |

### 输出

**没有同步 api 被别的模块调用。** 买家端、商家端走 HTTP；别的模块要看售后状态，等后续加只读 api。

### 边界

- **钱不经过这里**：只决定"该退多少"，渠道退款是 `payment` 的事
- **不直接改订单**：计数器走 `TradeCommand.recordRefund`，不碰 `trade` 的表
- **入库挂在"商家签收退货"，不挂在"退款成功"**：入库的事实是货回到仓里，退款只是钱的事。
  挂在退款上，超时兜底那条路（货还没寄到就自动退款）会给一批不存在的货记账。仅退款不入库
- **平台不代收退货运费**：判责只记结论，快递费双方线下解决
- **三种类型一套状态机**：区别只是"要不要寄回货"，不写三套

### 商家侧的判权与范围

动钱与不动钱拆两档（与权限码的拆分同因）：

| 动作                      | 权限点                        | 为什么               |
| ------------------------- | ----------------------------- | -------------------- |
| 列表 / 详情 / 拒绝 / 签收 | `ORDER_READ` / `ORDER_REFUND` | 不动钱，可授予子账号 |
| 同意 / 确认退款           | `ORDER_REFUND_APPROVE`        | 动钱出口，主账号专属 |

店铺范围（`operator.shopIds()`）是第二层：`rma_case.shop_id` 冗余自子单（下单后不可变），
列表写进 SQL、点查比对，越出授权范围与「不是你的单」同一口径折 404。
商家归属对了不等于范围对了——只绑 `merchant_id` 是这一层最常见的漏法。

## 拥有什么

`rma_case` `case_item` `return_shipment` `case_evidence` `case_log`

表都建在 `returns` schema 里，跨 schema 不 JOIN、不建外键。`case_log` 挂 `common.reject_mutation()`，只追加。

## 目录

```
returns/
├── controller/  BuyerAfterSaleController（提交/撤销/寄回）、SellerAfterSaleController（同意/拒绝/收货/退款）
├── dto/         RmaApplyRequest（不含金额）
├── api/         RmaCommand、RmaQuery、CaseView
├── service/     RmaService（状态机）、CaseDeadlineJob（超时推进）、RefundSucceededHandler
├── model/       Rma（枚举 + 推责任）、RefundAmount（退款金额唯一实现）
└── mapper/      CaseMapper
```

## 超时机制

每个非终态都带 `deadline_at / deadline_actor / deadline_action` 三列，`CaseDeadlineJob` 只执行不判断：

| 状态            | 该谁动 | 期限 | 到期做什么 |
| --------------- | ------ | ---- | ---------- |
| `applied`       | 商家   | 48h  | 自动同意   |
| `approved`      | 买家   | 7 天 | 自动关闭   |
| `shipping_back` | 商家   | 7 天 | 自动退款   |
| `received`      | 商家   | 48h  | 自动退款   |
| `reshipping`    | 系统   | 7 天 | 自动完成   |

`shipping_back` 用 7 天而不是文档里的 48 小时：系统不知道货什么时候到（快递没有回传），
48 小时从"商家收货"起算的话，永远等不到那个起点。7 天是给在途留的兜底。

## 闭环断点

- **逆向物流只记两个事实**：`return_shipment` 在买家填单号（`in_transit`）和商家签收（`received`）时写入，
  在途轨迹不跟踪——承运商推送只对接正向包裹，退货单号没有 ingestion
- **换货重发没有库存联动**：补发是商家线下发货、填个运单号，`inventory` 不参与（rma.md §5「这一版不做」）
- **判责不能人工改**：`responsibility` 由 `reasonCode` 推出来就定了，没有"平台改判 + 留痕"的入口
- **没有举证接口**：`case_evidence` 表建了，上传通道没有
- **没有平台介入**：`disputed` 状态在，`dispute` 模块还没开工
- **没有售后专用错误码**：`CASE_NOT_FOUND` / `REFUND_EXCEEDS_PAID` / `INVALID_CASE_STATE` 还只是文档里的名字，
  现在用的是通用的 404 / 409

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。

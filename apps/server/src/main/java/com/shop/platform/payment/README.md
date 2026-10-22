# payment — 支付

> 支撑域 · schema `payment` · 进行中

```yaml
module: payment
layer: 支撑域
schema: payment
status: in-progress
depends_on: []
emits: ["PaymentSucceeded", "PaymentFailed", "RefundSucceeded", "ChannelSplitSettled"]
consumes: ["ReturnApproved", "RefundRequested"]
```

## 不认识 trade

**这个模块不依赖任何业务模块。** 应付金额由 `trade` 算好，通过
`PaymentCommand.create(orderGroupId, buyerId, amount, currency)` 传进来——金额是参数不是查询。

原来 `payment` 直接调 `trade.api.TradeQuery.findPayable` 读金额，而 `trade` 又消费
`payment.events.PaymentSucceeded`，两个模块互相 import，是个真环。
`ModularityTest` 的 `verify()` 报出来后改成单向 `trade → payment :: api`。

代价是"发起支付"的编排住在 `trade.service.PaymentStarter`。这是有意的：**谁持有数据，谁负责编排**。
买家入口也因此从 `POST /api/payments` 挪到了 `POST /api/orders/{id}/pay`。
payment 只剩两个入口：查单 `POST /api/payments/{id}/confirm`、渠道回调 `POST /api/payments/notify/{channel}`。

## 职责

支付单、渠道聚合、回调、退款、渠道分账单。

## 拥有什么

`payment_order` `refund_order`

`channel_bill`（渠道分账单）还没做。表都建在 `payment` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**不做分账计算，只认「钱到账」这一事实。** 分给谁、分多少是 `clearing` 的事。

## 目录

```
payment/
├── api/         PaymentCommand（发起支付 / 查单）、PaymentView
├── service/     PaymentService（状态机 + 回调）、PaymentExpiryJob（超时关单）
├── internal/    PaymentChannel（渠道口）、MockChannel、AlipayChannel、AlipayRequestSigner、装配
├── mapper/      PaymentOrderStore
├── model/       PaymentStatus
└── events/      PaymentSucceeded、RefundSucceeded
```

## 不引 SDK 是怎么做到的

支付宝那套协议本质是「HTTP POST + RSA2 签名」，JDK 自带的 `java.security.Signature` 就够：

- **验签**：`AlipayChannel.verify` —— 非空参数按 key 字典序拼 `k=v&k=v`，去掉 `sign` / `sign_type`，SHA256withRSA 验
- **签名**：`AlipayRequestSigner.sign` —— 同一份拼串逻辑（`AlipayChannel.canonical`），两边共用，不会差一个空格
- **金额换算**：`formatAmount` / `parseAmount` —— 分↔元，字符串解析，**绝不走 double**

省掉 SDK 换来：不加依赖、签名逻辑摊开可查、测试只需一对本地 RSA 密钥。

## 渠道装配

`PaymentChannelConfig` 是唯一的渠道选择点，`shop.payment.channel` 决定：

| 值             | 行为                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| `mock`（默认） | 不发真请求，`/confirm` 立刻成功。本地跑通「下单 → 支付 → 发货」用        |
| `alipay`       | 必须配齐 `app-id` / `public-key` / `gateway-url`，**缺一个启动直接失败** |

**配不齐就启动失败是刻意的**：不让「以为接了支付宝其实没接」这种状态存在。

## 库约束（已实测生效）

- `uq_payment_out_trade_no` / `uq_payment_channel_txn`：重放的回调撞这里，不重复记账
- `ck_payment_status`：`pending / success / failed / closed / refunded`
- `uq_refund_biz (payment_id, seller_order_id, reason)`：同一子单同一原因只能退一次

## 已经落在代码里的三件事

1. **只认渠道回调。** 买家点「我已支付」不算数；`confirm` 走的是主动查单，和回调**同一条解析路**
2. **金额不符不推进订单。** `matched=false` 时 trade 拒收、记 `amount_mismatch` 事件，等人工查
3. **回调幂等靠状态前置条件。** `status = 'pending'`，重放影响 0 行就跳过；外面还有 `EventInbox` 按 eventId 去重

## 闭环断点

- **退款没做**：`refund_order` 表建了，但 `RefundRequested` 没有消费者、`RefundSucceeded` 没有发出点
- **`channel_bill`（渠道分账单）没做**：对账链路是断的
- **沙箱没实测**：`AlipayChannel` 的签名/验签逻辑写了，但**没有对着真实沙箱跑过**。要跑通需要公网可达的 `notify-url`
- **`createPayment` 没签名**：真实下单要用应用私钥签，现在只返回未签名参数表（`AlipayRequestSigner` 已就绪，接线即可）
- **没有超时退款**：支付单超时只是关掉，如果钱后来到了，走的是「金额不符」分支而不是自动退款

## 层与依赖

层：支撑域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。

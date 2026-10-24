# logistics — 物流

> 支撑域 · schema `logistics` · 进行中

```yaml
module: logistics
layer: 支撑域
schema: logistics
status: in-progress
depends_on: ["fulfillment :: api"]
emits: []
consumes: []
```

## 职责

承运商轨迹回传，把上千种原始轨迹码翻译成八个标准码（`fulfillment.api.StandardTraceCode`）。

## 链路

```
承运商/聚合平台 POST /api/logistics/carriers/{carrier}/traces
  （X-Signature: HMAC-SHA256(密钥, 原始请求体 UTF-8 字节) 的 hex）
  → 验签（密钥没配 fail closed，全部拒绝）
  → 按 (承运商, 运单号) 定位包裹（fulfillment.findByTrackingNo）
  → 查 carrier_code_map 翻码；查无映射记 unknown，绝不猜
  → 落 trace_event（唯一键 (package, raw_code, occurred_at)，重放只生效一次）
  → fulfillment.recordTrace（状态单调推进；delivered 视同签收，delivered_source='trace'）
```

**先落原始再推进**：翻译或推进炸了，原始轨迹已经在 `trace_event` 里，重推或人工处理有据可查；
反过来是"状态动了但没有任何轨迹证据"。

## 拥有什么

`trace_event`（每条原始轨迹一行，同时存翻译后的标准码）、`carrier_code_map`（原始码 → 标准码码表）。

表都建在 `logistics` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

纯技术适配，**不含履约状态机**——状态在 `fulfillment` 和 `trade`。

**认不出的码记 `unknown`，不猜。** 猜错会把"退签"当"签收"，直接触发结算。码表建出来就是空的：
映射是数据，接真渠道时录入，不凭记忆预填。

**推送口免登录，安全全靠签名。** 这条口子能推进包裹到"已签收"并触发订单完成与结算解冻，
没有签名它就是一个任何人都能按的打钱按钮。密钥 `SHOP_LOGISTICS_PUSH_SECRET`
（`apps/server/.env` 或部署环境变量），没配时整体拒绝。

电子面单不做，MVP 由商家自己打单填运单号。

## 闭环断点

- **码表为空、没有真实推送方**：链路通、测试过，但还没有任何承运商在推。接真渠道时
  录 `carrier_code_map`、和对方约定推送密钥与字段映射
- **码表没有维护入口**：现在只能 SQL 录入。要不要管理端页面，等真渠道落地再定
- **没有主动查单**：推送丢了只能等渠道重投；"用户说到了但我们没收到推送"目前没有出路，
  可以后续加（`fulfillment.recordTrace` 的入口现成）

## 层与依赖

层：支撑域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。

依赖单向 `logistics → fulfillment :: api`，不反向。

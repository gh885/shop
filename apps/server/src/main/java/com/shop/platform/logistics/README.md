# logistics — 物流

> 无域（技术适配）· schema `logistics` · 进行中

```yaml
module: logistics
layer: 无域
schema: logistics
status: in-progress
depends_on: ["fulfillment :: api"]
emits: []
consumes: []
```

## 职责

承运商轨迹回传，把上千种原始轨迹码翻译成八个标准码（`fulfillment.api.StandardTraceCode`），
并把轨迹原样存下来给人查。

## 模块契约

| 方向 | 对象                 | 内容                                                                                                                                                                       |
| ---- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 输入 | `fulfillment :: api` | `findByTrackingNo` / `findByPackageNo` / `findBySellerOrderForBuyer` / `findBySellerOrder`：把运单号、包裹号或子单换成包裹视图。**查不到就是 404**，本模块不自己拼归属 SQL |
| 输入 | `fulfillment :: api` | `recordTrace(packageId, code, occurredAt, signedBy)`：回写状态机。返回 false = 只记录未推进，那是正常分支不是错误                                                          |
| 输出 | HTTP（承运商）       | `POST /api/logistics/carriers/{carrier}/traces`，免登录，HMAC 验签                                                                                                         |
| 输出 | HTTP（三端）         | 买家/卖家/管理端各一个只读时间线入口，见下。**不发事件**（`emits: []`）                                                                                                    |

## 链路

```
承运商/聚合平台 POST /api/logistics/carriers/{carrier}/traces
  （X-Signature: HMAC-SHA256(密钥, 原始请求体 + LF + X-Timestamp 毫秒) 的 hex；时间戳过窗 ±5 分钟即拒，防重放）
  → 验签（按承运商取密钥，没配 fail closed，全部拒绝）
  → 按 (承运商, 运单号) 定位包裹（fulfillment.findByTrackingNo，承运商码归一化后比）
  → 查 carrier_code_map 翻码；查无映射记 unknown，绝不猜（并 +1 指标）
  → 落 trace_event（唯一键 (package, raw_code, occurred_at)，重放只生效一次）
  → fulfillment.recordTrace（状态单调推进；delivered 视同签收，delivered_source='trace'，签收人落 signed_by）
```

**先落原始再推进**：翻译或推进炸了，原始轨迹已经在 `trace_event` 里，重推或人工处理有据可查；
反过来是"状态动了但没有任何轨迹证据"。

**人工补录是同一个管道的第二进口**（`POST /api/admin/logistics/traces`，`LOGISTICS_MANAGE` +
平台员工）：录入的就是标准码，人就是翻译，`raw_code` 记标准码本身、note 记依据（"电话核实已签收"）。
没接真渠道时，它是本地把整条履约流程跑起来的口子；接了之后它是推送丢失时的人工兜底。
和推送口同等危险（能推到"已签收"触发结算），身份就是签名，不需要承运商那把 HMAC 密钥。

## 读侧

轨迹只在 `package_id` 上，而"这个包裹属于谁"只有 fulfillment 说得清——所以三个入口的归属
**全部先走 `fulfillment :: api` 换成包裹，再按 id 取轨迹**。本模块不重复实现归属判断。

| 入口                                            | 谁用      | 凭什么放行                                          |
| ----------------------------------------------- | --------- | --------------------------------------------------- |
| `GET /api/buyer/logistics/seller-orders/{id}`   | 买家      | 「包裹 → 子单 → 订单组 → 买家」链路，别人的子单 404 |
| `GET /api/buyer/logistics/packages/{no}`        | 买家      | `package_no` 是随机能力令牌，知道单号即有权查       |
| `GET /api/seller/logistics/seller-orders/{id}`  | 卖家      | `ORDER_READ` + `merchant_id` / `shopIds` 写进 SQL   |
| `GET /api/admin/logistics/packages/by-tracking` | 运营/客服 | `LOGISTICS_MANAGE` + 平台员工：拿买家报的单号核对   |
| `GET /api/admin/logistics/unmapped`             | 运营      | 同上。**码表该补哪几条，这里说了算**                |
| `GET/PUT/DELETE /api/admin/logistics/code-map`  | 运营      | 同上。码表的唯一维护入口                            |

## 拥有什么

`trace_event`（每条原始轨迹一行，含翻译后的标准码、地点）、`carrier_code_map`（原始码 → 标准码码表）。

表都建在 `logistics` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

纯技术适配，**不含履约状态机**——状态在 `fulfillment` 和 `trade`。

**认不出的码记 `unknown`，不猜，但必须可观测。** 猜错会把"退签"当"签收"，直接触发结算。
码表建出来就是空的：映射是数据，接真渠道时录入，不凭记忆预填。出现 `unknown` 时打
`shop.logistics.trace.unmapped` 指标——`log.info` 是没人会去看的东西，而"该补哪条映射"
只有这一个信号能回答。

**推送口免登录，安全全靠签名。** 这条口子能推进包裹到"已签收"并触发订单完成与结算解冻，
没有签名它就是一个任何人都能按的打钱按钮。密钥按承运商配
（`shop.logistics.carriers.<码>`），兜底一把 `SHOP_LOGISTICS_PUSH_SECRET`，都没配就整体拒绝。
**分钥是必须的**：一把全局钥匙泄漏要全渠道轮换，且事后指认不了是谁推的。

**承运商码进库前一律归一化成小写**（`fulfillment.api.Carriers.normalize`）。推送方用哪一档
大小写不受我们控制，而定位包裹是精确匹配——不归一化的话商家录 `SF`、渠道推 `sf` 就永远查不到。

电子面单不做，MVP 由商家自己打单填运单号。

## 闭环断点

- **码表为空、没有真实推送方**：链路通、测试过，但还没有任何承运商在推。本地跑流程用
  管理端补录口（`POST /api/admin/logistics/traces`），它就是那个"mock"；
  接真渠道时录 `carrier_code_map`、和对方约定推送密钥
- **推送报文是自定的四+二个字段**（trackingNo / code / occurredAt 必填，description / location /
  signedBy 可选）。真实渠道的字段名与嵌套结构各不相同，接第一家时要按对方报文做一次映射层，
  现在的 `TraceBody` 只是为了本地能跑通
- **没有主动查单**：推送丢了靠渠道重投或人工补录；"用户说到了但我们没收到推送"的
  自动化出路（主动查承运商）后续加，`fulfillment.recordTrace` 的入口现成
- **逆向物流不在这条管道里**：退货回寄的运单在 `returns.rma_case` 上，推过来会 404。
  要接得先让 `returns` 写 `return_shipment`，再给 `trace_event` 加主体判别——那是跨模块改造
- **管理端没有界面**：五个读口与码表维护口都是 HTTP，`apps/admin` 里还没有 logistics 域

## 层与依赖

层：无域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。

依赖单向 `logistics → fulfillment :: api`，不反向。

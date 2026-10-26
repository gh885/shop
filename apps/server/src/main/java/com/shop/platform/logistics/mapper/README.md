# logistics/mapper — 表结构与字段字典

> 这个目录只放 SQL。验签、人工补录入口在 `service/` 和 `controller/`，八个标准码的定义在
> `fulfillment.api.StandardTraceCode`，表为什么这么设计（轨迹域词汇、幂等契约）在
> [fulfillment.md](../../../../../../../../../../docs/domain/fulfillment.md)。

schema `logistics` 共 2 张表。**轨迹是流水，只增不改**；状态机不在这里——
履约状态在 `fulfillment`，这个模块是纯技术适配：把上千种承运商原始码翻译成八个标准码。

几条全局约定，读下面任何一张表都要先记住：

- 不建外键。`package_id` 指向 `fulfillment.package`，由代码保证，跨 schema 更不 JOIN。
- 标准码列存**枚举名的小写**（`'delivered'`、`'unknown'`），八个合法值由 CHECK 钉住。
  翻译结果用 `StandardTraceCode` 承载，不散字符串。
- 时间列一律 `timestamptz`。
- **两张表都没有 `updated_at`。** 轨迹只追加，码表是静态配置，都不存在"改了要留痕"的行。
- **写入只有一条 INSERT，且 `ON CONFLICT DO NOTHING`。** 幂等闸门在唯一索引上，不在代码判断里。

## 表一览

| 表                 | 一句话                                              | 谁在写                     |
| ------------------ | --------------------------------------------------- | -------------------------- |
| `trace_event`      | 每条原始轨迹一行，同时存翻译后的标准码              | `TraceEventMapper`         |
| `carrier_code_map` | 承运商原始码 → 平台标准码的码表，**建出来就是空的** | `TraceEventMapper`（只读） |

---

## logistics.trace_event

**承运商轨迹流水 + 翻译结果。** 原始码和翻译后的标准码都存——将来码表改了，
历史轨迹翻译成什么仍然可查。

| 字段            | 类型        | 空 / 默认              | 说明                                                                          |
| --------------- | ----------- | ---------------------- | ----------------------------------------------------------------------------- |
| `id`            | uuid        | PK，默认 `uuidv7()`    | 轨迹 id                                                                       |
| `package_id`    | uuid        | NOT NULL               | 哪个包裹（`fulfillment.package`）                                             |
| `carrier_code`  | text        | NOT NULL               | 承运商标准码，冗余存一份：按运单号反查轨迹不用回头 JOIN package               |
| `tracking_no`   | text        | NOT NULL               | 运单号，同上冗余                                                              |
| `raw_code`      | text        | NOT NULL               | 承运商原始码。**人工补录时记标准码本身**——人就是翻译，note 记依据             |
| `standard_code` | text        | NOT NULL               | 翻译结果，八选一（`ck_trace_standard`）。`unknown` = 码表里查不到，**绝不猜** |
| `description`   | text        | 可空                   | 承运商给的原始描述                                                            |
| `occurred_at`   | timestamptz | NOT NULL               | 轨迹发生时刻（承运商报的，不是入库时刻）                                      |
| `created_at`    | timestamptz | NOT NULL，默认 `now()` | 入库时刻                                                                      |

约束：`ck_trace_standard`（`collected` / `in_transit` / `out_for_delivery` / `delivered` /
`rejected` / `returned` / `exception` / `unknown` 八选一）、
**`uq_trace_natural (package_id, raw_code, occurred_at)`**——同一条轨迹推两遍只生效一次，
fulfillment `recordTrace` 的幂等契约靠这把唯一键兑现：冲突的那次 `insert` 返回 false，
连后续的状态推进都不会被调。

索引：`idx_trace_event_package (package_id, occurred_at DESC)` 按包裹看时间线。

**幂等返回值是契约**（`TraceEventMapper.insert` 返回 boolean）：false = 三元组来过了，
是重放，调用方应当跳过后续推进。影响行数意义上的"插入成功"和"业务上是新轨迹"是两件事。

## logistics.carrier_code_map

**承运商原始码 → 平台标准码的码表。** 静态配置，只有读入口（`translate`），没有维护入口——
现在只能 SQL 录入，要不要管理端页面等真渠道落地再定。

| 字段            | 类型 | 空 / 默认 | 说明                                          |
| --------------- | ---- | --------- | --------------------------------------------- |
| `carrier_code`  | text | PK 之一   | 哪个承运商                                    |
| `raw_code`      | text | PK 之一   | 对方的原始码                                  |
| `standard_code` | text | NOT NULL  | 翻译成哪个标准码（`ck_map_standard`，八选一） |
| `note`          | text | 可空      | 录码依据，给后来的人看                        |

主键：`(carrier_code, raw_code)`。没有别的索引——只按这个二元组点查。

**建出来就是空的，是刻意的：**

- 映射是数据不是代码——接真渠道时和对方逐码确认后录入，**不凭记忆预填**
- 查不到映射返回 empty，调用方记 `unknown`，**绝不在这里猜**：猜错会把"退签"当"签收"，
  直接触发结算，那是资损
- `translate` 是唯一入口（`findStandardCode` 的点查 + `StandardTraceCode.from` 反解），
  调用方拿到的永远是枚举，不是裸字符串

---

## 这两张表在链路里的位置

```
推送口（免登录，HMAC 验签）──┐
                             ├─→ 按 (carrier_code, tracking_no) 定位包裹
管理端补录口（LOGISTICS_MANAGE）┘     （fulfillment.findByTrackingNoInternal）
  → translate 翻码；查无映射记 unknown，绝不猜
  → INSERT trace_event（uq_trace_natural 兜重放）
  → fulfillment.recordTrace（状态单调推进；delivered 视同签收，delivered_source='trace'）
```

**先落原始再推进**：翻译或推进炸了，原始轨迹已经在 `trace_event` 里，重推或人工处理有据可查；
反过来是"状态动了但没有任何轨迹证据"。所以 insert 永远在 recordTrace 之前，
这个顺序是链路契约，不是实现细节。

**补录口和推送口共用同一个 mapper、同一条管道**，区别只在翻译：推送口的 `raw_code` 是
承运商原始码、靠码表翻；补录口的 `raw_code` 直接记标准码本身（人就是翻译），
`note` 记依据。表里看不出区别——区别在入口的身份（HMAC 签名 vs 平台员工令牌）。

## 每个 mapper 碰哪些表 / 列

| 类                 | 操作   | 表                 | 说明                                                                            |
| ------------------ | ------ | ------------------ | ------------------------------------------------------------------------------- |
| `TraceEventMapper` | INSERT | `trace_event`      | `ON CONFLICT (package_id, raw_code, occurred_at) DO NOTHING`，返回 false = 重放 |
| `TraceEventMapper` | SELECT | `trace_event`      | `countByPackage`（校验轨迹存在，喂给按包裹查时间线的链路）                      |
| `TraceEventMapper` | SELECT | `carrier_code_map` | `findStandardCode` 点查，经 `translate` 出枚举；**表只有这一个消费者**          |

## 读这些表时的两个坑

- **`uq_trace_natural` 三元组里没有 `carrier_code`。** 同一包裹换承运商重挂运单号（极少见）
  出现的重复轨迹不会被它拦——它是轨迹幂等键，不是运单归属键；运单归属由
  `uq_package_tracking` 在 fulfillment 那边管。
- **`standard_code = 'unknown'` 不是异常是常态。** 码表为空期间所有推送都会记 `unknown`。
  看轨迹数据时别把 unknown 当故障报——故障是"unknown 且应该有映射"，那要拿 `raw_code`
  对着码表查。

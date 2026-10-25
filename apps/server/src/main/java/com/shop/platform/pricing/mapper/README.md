# pricing/mapper — 表结构与字段字典

> 这个目录只放 SQL。五层流水线在 `service/`，分摊算法在 `model/Allocation`，表为什么这么设计在
> [pricing.md](../../../../../../../../../../docs/domain/pricing.md)。

schema `pricing` 共 4 张表，全是**一次算价的结果**。两类规则都不在这里：

- 优惠规则归 `promotion`，pricing 拿 `AppliedRule` 自己算
- 运费模板归 `seller`（它是**店铺配置**，`shop_id` 指向 seller 的 `shop`），pricing 拿 `FreightRule` 自己算

> 运费模板一度住在 `pricing`，理由是"满 99 包邮要看折后金额"。那是**计算**的依赖，不是**数据**的归属——
> 算钱确实只能在 pricing 做，但模板本身是商家在店铺里配的东西，所以搬走了（`V20261023163000`）。

几条全局约定，读下面任何一张表都要先记住：

- 不建外键。跨 schema 不 JOIN，指向关系由代码保证。
- 金额一律 `bigint`，单位**分**。没有浮点，没有裸 int64 参与计算。
- 状态、枚举列存**枚举名的小写**（`'issued'`、`'order_group'`）。`RowMappers` 靠这条约定反解，
  不守约定的值会在映射时抛异常，不会静默错值。
- 时间列一律 `timestamptz`。
- **四张表都没有 `updated_at`。** 报价单是"写一次就不再改"的证据，唯一会变的只有 `status`
  （`issued → used` 那一次 CAS）。这是刻意的，不是漏了。

## 表一览

| 表                     | 一句话                           | 谁在写             |
| ---------------------- | -------------------------------- | ------------------ |
| `price_quote`          | 一次算价的总额与证据头           | `PriceQuoteMapper` |
| `price_quote_line`     | 每行金额 + 商品快照              | `PriceQuoteMapper` |
| `price_quote_rule`     | 每条被评估过的规则（含没命中的） | `PriceQuoteMapper` |
| `price_quote_shipping` | 每个商家一笔运费                 | `PriceQuoteMapper` |

---

## pricing.price_quote

**一次算价的完整结果，也是证据头。** 一张报价单只能被用一次。

| 字段               | 类型        | 空 / 默认               | 说明                                                             |
| ------------------ | ----------- | ----------------------- | ---------------------------------------------------------------- |
| `id`               | uuid        | PK，默认 `uuidv7()`     | 报价单 id，落单时必须带回来                                      |
| `buyer_id`         | uuid        | NOT NULL                | 谁算的价                                                         |
| `status`           | text        | NOT NULL，默认 `issued` | `issued` / `used` / `expired`                                    |
| `fingerprint`      | text        | NOT NULL                | 规范化输入的 SHA-256，落单时比对                                 |
| `shipping_address` | jsonb       | NOT NULL                | 算价时的地址。**只存结果不存输入，"运费为什么是 12 块"就查不清** |
| `entitlements`     | jsonb       | NOT NULL，默认 `'[]'`   | 券 / 会员等级等资格快照，引擎不区分来源                          |
| `currency`         | char(3)     | NOT NULL，默认 `'CNY'`  | 一单只能一种币种                                                 |
| `goods_amount`     | bigint      | NOT NULL                | Σ 行 `subtotal`                                                  |
| `discount_amount`  | bigint      | NOT NULL                | Σ 行 `discount_amount`                                           |
| `shipping_amount`  | bigint      | NOT NULL                | Σ 每商家运费                                                     |
| `payable_amount`   | bigint      | NOT NULL                | `goods - discount + shipping`                                    |
| `rule_ids`         | uuid[]      | NOT NULL，默认 `'{}'`   | 真减了钱的规则，按执行顺序                                       |
| `expires_at`       | timestamptz | NOT NULL                | 30 分钟，与订单超时一致                                          |
| `created_at`       | timestamptz | NOT NULL，默认 `now()`  | 算价时刻                                                         |

约束：`ck_quote_sum`（`goods - discount + shipping = payable_amount`）、`ck_quote_status`、
`ck_quote_nonneg`（四个金额都 ≥ 0）。索引：`idx_price_quote_buyer (buyer_id, created_at)`。

**`fingerprint` 只算买家能改的东西**：SKU、数量、行号、地址、资格。`listingId` / `merchantId` 是校验位，
由 catalog 决定，算进去会让"算价时没传、下单时传了"变成一次莫名其妙的 `PRICE_CHANGED`。

> **待收敛**：`pricing.md` §4 写的是"指纹含规则版本"，代码里不含。两种语义都自洽——
> 含版本 = 规则一变就要求用户重新确认；不含 = 报价单是承诺，规则变了也照旧价成交。
> 这条还没定，改之前先看文档。

**状态机**：

```
issued ──落单──→ used
   │
   └──超时──→ expired（30 分钟）
```

`issued → used` 是一次 CAS：`UPDATE ... WHERE id = ? AND status = 'issued' AND expires_at > now()`，
影响 0 行就拒单。它必须和插单在同一个事务里，否则插单失败就白烧一张报价。

## pricing.price_quote_line

**每行算完的结果 + 下单时的商品快照。** 快照存这里，是因为 `trade` 不许回头查 catalog——
那既是竞态，也让订单金额和商品状态脱钩。

| 字段              | 类型    | 空 / 默认           | 说明                                            |
| ----------------- | ------- | ------------------- | ----------------------------------------------- |
| `quote_id`        | uuid    | PK 之一             | 属于哪张报价单                                  |
| `line_no`         | integer | PK 之一             | **由调用方给**，不重编号。它是分摊的并列键      |
| `listing_id`      | uuid    | NOT NULL            | 买家实际看到的那个挂售                          |
| `sku_id`          | uuid    | NOT NULL            | 规格                                            |
| `merchant_id`     | uuid    | NOT NULL            | 商家                                            |
| `shop_id`         | uuid    | NOT NULL            | 店铺。运费模板按店铺算，落单时子单也需要它      |
| `quantity`        | integer | NOT NULL            | 数量                                            |
| `unit_amount`     | bigint  | NOT NULL            | 单价，分                                        |
| `weight_g`        | integer | 可空                | SKU 重量快照，按重量计费的证据。null = 商家没填 |
| `subtotal`        | bigint  | NOT NULL            | `unit_amount × quantity`                        |
| `discount_amount` | bigint  | NOT NULL            | 本行承担的全部优惠                              |
| `payable_amount`  | bigint  | NOT NULL            | `subtotal - discount_amount`，**不含运费**      |
| `spu_id`          | uuid    | NOT NULL            | 商品主数据                                      |
| `category_id`     | uuid    | NOT NULL            | 类目，优惠按类目筛的时候要用                    |
| `brand_id`        | uuid    | 可空                | 品牌                                            |
| `title`           | text    | NOT NULL            | 标题快照。商品改名后订单页还要能显示原名        |
| `image_url`       | text    | 可空                | 主图快照                                        |
| `spec_values`     | jsonb   | NOT NULL，默认 `{}` | 规格值快照                                      |
| `identity_key`    | text    | 可空                | 规格身份键，售后和比价要能认出是哪个规格        |

约束：`pk_quote_line (quote_id, line_no)`、`ck_line_qty (> 0)`、
`ck_line_sub (subtotal = unit_amount × quantity)`、
`ck_line_disc (0 ≤ discount ≤ subtotal)`、
`ck_line_payable (payable_amount = subtotal - discount AND payable_amount ≥ 0)`。

最后一条是**硬护栏**：任何算法漏洞都不允许把行刷成负金额。它同时也是"分摊算错了"最先炸的地方。

PK 已经覆盖 `quote_id` 前缀查询，所以没有额外的单列索引。

## pricing.price_quote_rule

**核心证据表，不是"命中列表"。** 每一条被评估过的规则都记一行，命中的和没命中的都记——
只记命中的，投诉"为什么没给我打折"时永远查不清。

| 字段               | 类型   | 空 / 默认 | 说明                                      |
| ------------------ | ------ | --------- | ----------------------------------------- |
| `quote_id`         | uuid   | PK 之一   | 属于哪张报价单                            |
| `rule_id`          | uuid   | PK 之一   | 哪条规则                                  |
| `rule_version`     | text   | NOT NULL  | 规则版本，重算时能对上是哪一版            |
| `type`             | text   | NOT NULL  | 规则类型，只用于展示                      |
| `scope`            | text   | NOT NULL  | `line` / `seller_order` / `order_group`   |
| `bearer`           | text   | NOT NULL  | `platform` / `merchant`，结算按它分科目   |
| `outcome`          | text   | NOT NULL  | `applied` / `skipped` / `truncated`       |
| `base_amount`      | bigint | NOT NULL  | 这条规则的计费基数                        |
| `threshold`        | bigint | 可空      | 门槛，没门槛为 null                       |
| `requested_amount` | bigint | 可空      | 规则算出想减多少                          |
| `amount`           | bigint | NOT NULL  | 实际减了多少（`skipped` 为 0）            |
| `allocation`       | jsonb  | 可空      | `{"1": 300, "2": 200}`，`skipped` 为 null |

约束：`pk_quote_rule (quote_id, rule_id)`、`ck_rule_outcome`、`ck_rule_scope`、
`ck_rule_bearer`、`ck_rule_amount (amount ≥ 0)`。

三个字段必须一起看：

- `outcome = skipped` + `base_amount` + `threshold` → 回答"为什么没命中"（基数不够门槛）
- `requested_amount ≠ amount` → 被基数截断了，`outcome = truncated`
- `allocation` 的**值之和必须精确等于 `amount`**，一分不差

**`allocation` 为什么是 jsonb 而不是独立表**：它是整体证据，从不单独查询，拆表只是多一次 join。

> **已知缺口**：表里没有 `rate_bp` / `fixed_amount` / 作用对象。金额能对上，但解释不出
> "这是打的八折"还是"减的固定 20"，也回答不了"这条规则为什么作用到这几行"。
> `pricing.md` 里把 `Σ allocation = amount` 列为必须核对的不变式，但**核对任务还没写**——
> jsonb 里写不出约束，只能事后跑。

## pricing.price_quote_shipping

**每个商家一笔运费，一行。** 不摊到行——摊到行会让"退一件要不要退运费"变成无解的问题。

| 字段              | 类型    | 空 / 默认              | 说明                                                                   |
| ----------------- | ------- | ---------------------- | ---------------------------------------------------------------------- |
| `quote_id`        | uuid    | PK 之一                | 属于哪张报价单                                                         |
| `merchant_id`     | uuid    | PK 之一                | 哪个商家                                                               |
| `template_id`     | uuid    | NOT NULL               | 用了哪个模板（证据）。模板在 `seller.shipping_template`，跨模块只存 id |
| `charge_by`       | text    | NOT NULL               | `weight` / `piece`，计费口径的证据                                     |
| `weight_g`        | bigint  | 可空                   | 按重量计费时的总重                                                     |
| `shipping_amount` | bigint  | NOT NULL               | 运费，分                                                               |
| `free_applied`    | boolean | NOT NULL，默认 `false` | 是否命中了包邮门槛                                                     |

约束：`pk_quote_shipping (quote_id, merchant_id)`、`ck_quote_shipping`、`ck_quote_charge_by`。

`free_applied` 单独存一个布尔，而不是从 `shipping_amount = 0` 推——0 元也可能是"模板首件价就是 0"，
这两种情况在解释"为什么免运费"时说法不一样。

> **待收敛**：主键用的是 `merchant_id`，但模板挂在 `shop_id` 上，算价也是按店铺分组算的。
> 一个商家开两家店时，两张运费单会撞主键。收敛方向是统一到 `shop_id`（模板本来就是店铺级的），
> 但现在 `price_quote_line` 两个都有，改的时候要一起看。

---

## 一条报价单的写入顺序

四步在**同一个事务**里（`PriceQuoteService.quote` 上的 `@Transactional`）：

```
1. INSERT price_quote                    ← 头，金额必须自己先对平
2. N × INSERT price_quote_line           ← 每行金额 + 商品快照
3. M × INSERT price_quote_rule           ← 每条被评估的规则，含 skipped
4. K × INSERT price_quote_shipping       ← 每商家一笔
```

顺序不能换：头先写，明细才有 `quote_id` 可挂。任何一步失败整个事务回滚，
不会留下"有头没明细"的报价单。

## 读这些表时的两个坑

- **别用 `price_quote_rule.amount` 反推行优惠。** 行上的 `discount_amount` 是各条规则分摊之和，
  要看某一行在某条规则下分了多少，读 `allocation` 里那个 `line_no` 的 key。
- **`price_quote_line.payable_amount` 不含运费。** 整单 `payable_amount` 含。同名不同义，
  写 SQL 对账时最容易在这里差一个运费。

## 还没做的

- **没有过期清理**：`expires_at` 有，但没有扫描任务，`issued` 单会一直堆着
- **没有核对任务**：`Σ allocation = amount`、`Σ line + Σ shipping = payable_amount` 都还只是文档里的不变式
- **运费模板的读写都在 `seller`**：pricing 这边只读 `FreightRule`，模板怎么配不归这里管

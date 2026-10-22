# pricing — 算价

> 核心域 · schema `pricing` · 进行中

```yaml
module: pricing
layer: 核心域
schema: pricing
status: in-progress
depends_on: ["catalog :: api", "promotion :: api"]
emits: []
consumes: []
```

## 职责

取 `promotion` 的生效规则，按五层流水线算出成交价：基础价、优惠、分摊、运费、证据。
**规则数据不在这里**——活动定义归 `promotion`，这里只拿已展开成值对象的 `AppliedRule`。

## 拥有什么

`shipping_template` `price_quote` `price_quote_line` `price_quote_rule` `price_quote_shipping`

表都建在 `pricing` schema 里，跨 schema 不 JOIN、不建外键。

完整五层模型、分摊算法、承担方规则见
[pricing.md](../../../../../../../../../docs/domain/pricing.md)。

## 目录

```
pricing/
├── controller/  QuoteController：结算页试算
├── dto/         QuoteRequest（HTTP 入参，不含价格也不含商家）
├── api/         PricingQuery（落单校验）、PricingRequest（输入 / 输出形状）
├── service/     PriceQuoteService（试算 + CAS）、QuoteCalculator（五层流水线）
├── model/       Allocation：最大余数法，全平台唯一实现
└── mapper/      PriceQuoteStore、ShippingTemplateStore
```

## HTTP 入口

| 方法   | 路径          | 说明                        |
| ------ | ------------- | --------------------------- |
| `POST` | `/api/quotes` | 算价，返回 `quoteId` 和总额 |

**请求体里没有价格，也没有商家。** 两者都由 catalog 的 offer 决定，前端填不出来也不该填：

- 传价格等于允许有人编一个价格去下单
- 传商家等于允许把别人的货算进自己的单

`offerId` 是可选校验位：给了就必须与 catalog 一致，用来挡住"用户看到的商品已经被换商家挂售"。
它**不进 fingerprint**——它由 catalog 决定，买家改不了，算进去会让无关紧要的差别变成一次 `PRICE_CHANGED`。

## 已经落在代码里的四件事

1. **最大余数法只有一处实现**（`Allocation`）。四条性质全部来自算法本身：和恒等于 `amount`、每项非负、
   与输入顺序无关、同输入同输出。实测 500 轮随机输入，之和一分不差；打乱输入顺序结果不变。
   **「尾差给最后一行」那种写法是错的**——它让最后一行系统性偏大，退货时一看就露。

2. **报价单是证据，不是结果**。地址、资格、命中的规则、每层中间结果、分摊矩阵全量落库。
   只存结果不存输入，投诉"运费为什么是 12 块"就还原不出来。

3. **落单校验 + CAS 同事务**。`UPDATE ... WHERE id = ? AND status = 'issued' AND expires_at > now()`，
   影响 0 行就拒单。实测同一张报价第二次使用必被拒；数量变了返回 `PRICE_CHANGED` 且**不烧掉报价**。

4. **运费在分摊之后**，门槛看本店铺的折后金额。实测满 200 元正好命中包邮、未满照收。

## 库约束（已实测生效）

- `ck_quote_sum`：`goods - discount + shipping = payable`，写一个不平的报价单当场被拒
- `ck_line_payable`：`payable = subtotal - discount AND payable >= 0`，算错行金额当场被拒
- `uq_shipping_template_active`（partial）：一个店同时只能有一个 `active` 模板，插第二个被拒

## 闭环断点

- **`promotion` 是占位实现**：`NoPromotionRules` 返回空列表，所以现在算价只会算出原价 + 运费。
  写真实规则时删掉它；两个 `@Component` 同时存在会让 Spring 启动就报歧义，而不是悄悄用错那个
- **多币种没做**：混进第二种币种直接拒，不做汇率
- **没有核对任务**：`Σ allocation = amount` 这条跨不出 jsonb，靠落单后跑核对；现在没有那个任务
- **没有运费模板管理接口**：模板只能靠 SQL 造，商家改不了运费

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。

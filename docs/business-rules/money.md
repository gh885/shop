# 金额与币种

> 代码入口：packages/common（Money/formatMoney）、apps/server common Money、MoneyTypeRulesTest、DB CHECK。规则以代码为准沉淀，改代码请同步本文件。

## 形状与单位

- **[MONEY-01]** 一笔钱在全链路（DB→Java→OpenAPI→TS）只有一个形状 `Money { amount, currency }`；TS 侧形状的单一真相源是生成契约 `@shop/api`（`packages/common` 只 re-export 不手写镜像），Java 侧是 `common/Money` record。不裸传 int64。
- **[MONEY-02]** 金额单位是「分」（整数），避免浮点误差；「元」只活在输入框与展示文本里，元↔分换算只经 `yuanToFen`/`yuanToMoney`（`Math.round(value*100)`）与 `fenToYuan`/`moneyToYuan`，不各处手写 `Number(v)*100`。
- **[MONEY-03]** 金额非负是硬不变式：Java `Money` 构造即校验 `amount >= 0`（`@Min(0)`），`minus` 结果不得为负（负值抛 400），DB 各金额列配 `CHECK (x >= 0)`。

## 币种约束（一期仅 CNY）

- **[MONEY-04]** 一期定价币种只有 CNY，三处同口径钉死：DB 每张金额表 `(amount, currency)` 列对 + `CHECK (currency = 'CNY')`（V58 覆盖 products/skus/shipping_templates/shipping_rules/orders/order_items/payments/tickets/coupon_templates/user_coupons/coupon_usages 共 11 表）；后端入参护栏 `Money.requirePlatformCurrency()`（币种错给 400「填错了」而不是撞 CHECK 变 500）；前端常量 `PLATFORM_CURRENCY = "CNY"`。
- **[MONEY-05]** 币种按行存（每表自己的 currency 列），不随父行继承——派生视图要在自己这一行闭合，跨表继承币种得 JOIN。

## 编译期门禁

- **[MONEY-06]** 编译期门禁 `MoneyTypeRulesTest`（ArchUnit，随 mvn test 跑）禁两件事：① 契约层包（dto / api / controller / service / events / common）里以 Price/Amount/Fee/Refund/Discount 结尾（忽略大小写）的字段类型必须是 `Money`，不许 `Long`/`BigDecimal`；② 名为 `currency` 的字段只允许出现在 mapper 实体、`infra.db`（裸 SQL 基建/造数器）与 `Money` 自身里，契约上再挂孤立币种字段即红。mapper 实体给 `xxxAsMoney()` 派生方法收口，可空列走 `Money.ofFenOrNull`。
- **[MONEY-07]** 响应序列化统一由 `ResponseSerializationTest` 钉死 Money → `{amount,currency}`（防有人加 custom serializer 悄悄改契约）。

## 运算规则

- **[MONEY-08]** 金额运算不脱离 Money 且仅同币种成立：`plus`/`minus`/`times`/`atLeast`（Java）与 `plusMoney`/`minusMoney`/`timesMoney`/`sumMoney`（TS）跨币种一律抛错（Java 抛 400 业务异常，TS 抛 Error），不静默算；`times` 的倍数必须是非负整数。
- **[MONEY-09]** 零金额不凭空预设币种：`Money.zero(currency)` / `zeroMoney(currency)` 的币种从手上这批钱里拿；TS `sumMoney` 非空集合时起点零跟随第一笔钱的币种。
- **[MONEY-10]** Money 是值对象，判「同一笔钱」用 `sameMoney`（amount+currency 全等），不用 `===`（引用比较会把重新解析出的相等值误判成已改动）。

## 展示口径

- **[MONEY-11]** 金额展示唯一出口是 `formatMoney`（→ `"¥299.00"`）与共享 `Price` 组件（`splitMoney` 分段排版：符号+元大字+角分小字）；符号由币种查表（CNY/JPY→¥、USD→$、EUR→€、HKD→HK$、TWD→NT$），未知币种退化为「代码+空格」不猜符号；缺席金额（null/undefined）显示占位符 `—` 而不是 `¥0.00`。
- **[MONEY-12]** 展示千分位分组固定收在 `groupYuan`（en-US 风格 3 位一分组），不吃运行机器区域设置；输入框回填（`moneyToYuan`）不带符号不分组（分组后不可解析）。

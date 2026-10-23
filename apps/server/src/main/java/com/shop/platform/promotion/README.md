# promotion — 营销活动

> 核心域 · schema `promotion` · 最小实现

```yaml
module: promotion
layer: 核心域
schema: promotion
status: in-progress
depends_on: ["catalog :: api"]
emits: []
consumes: []
```

> **只有规则表，没有活动与券。** `promotion_rule` 一张表 + 一条演示规则（满 200 减 20），
> 算价已经能真的减钱、分摊、留证据。活动聚合、券生命周期、预算一条都没做。
> 标 `in-progress` 而不是 `done`：这层只够跑通链路，撑不住真实运营。

## 职责

券、满减、秒杀、拼团、预售的活动定义与额度。
**规则数据归这里，算价不归这里**——`pricing` 通过 `api` 取生效规则，自己算。

## 模块契约

| 方向 | 对象             | 内容                                                                                                              |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| 输入 | —                | 不依赖任何业务模块（`depends_on: ["catalog :: api"]` 目前没用上），也不消费事件                                   |
| 输出 | `pricing :: api` | `effectiveRules(categoryIds, merchantId)` → `List<AppliedRule>`：门槛、比例或定额、基数口径、范围、承担方、互斥组 |

**只出规则，不算钱。** 一条规则都没命中就返回空列表——那是正常结果，不是错误。
**不发事件**：券占用和核销将来也走同事务同步调用，广播只会制造「占用成功但订单已取消」的竞态。

## 拥有什么

已建：`promotion_rule`。未建：`campaign` `coupon_stock` `coupon_instance`（module-map 里的目标形态）。

`promotion_rule` 一行就是一条可执行的规则。计算语义只由三列决定：

| 列                       | 作用                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `rate_bp`/`fixed_amount` | 二选一，按比例减还是按定额减（`num_nonnulls = 1` 是库约束） |
| `base_mode`              | `original` 看原价、`after_previous` 看前序优惠后的余额      |
| `scope`                  | `line` / `seller_order` / `order_group`，决定摊到哪些行     |

`threshold` 是门槛，`priority` 数值小者先执行，`mutex_group` 同组只取一条，
`category_ids` 为 null 表示全类目，`version` 是证据链要的版本号。

## 加一条新规则

插一行，不改 Java：

```sql
INSERT INTO promotion.promotion_rule
    (name, type, scope, bearer, threshold, fixed_amount, base_mode, priority, status, version, starts_at)
VALUES ('满 500 减 80', 'ORDER_THRESHOLD_OFF', 'order_group', 'platform',
        50000, 8000, 'original', 90, 'active', 1, now());
```

三条约定：

- **`type` 只用于证据展示**，算多少由 `rate_bp` / `fixed_amount` 决定。加新玩法不必先加枚举
- **改了金额参数必须 `version + 1`**：报价单靠它还原"当时是哪一版"，不 bump 就等于篡改历史
- **`bearer` 不能空**：结算按承担方分科目，没有承担方的优惠不许上线

## 边界

**不发事件。** 券占用和核销走同事务同步调用；广播只会制造「占用成功但订单已取消」的竞态。

## 闭环断点

- **没有活动（campaign）**：规则平铺，没有"一场大促包含 N 条规则"的聚合，也没有活动级起止
- **没有券**：资格来源只有"规则命中"，`PricingRequest.entitlements` 一直是空数组
- **没有预算与两两互斥**：`mutex_group` 是单组字符串，表达不了"平台券 ⊥ 平台满减、平台券 ∥ 店铺满减"
- **没有 `merchant_ids`**：现在全是全平台规则，`effectiveRules` 的 `merchantId` 参数没被用上
- **没有管理接口**：规则只能靠 SQL 插，运营改不了

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。

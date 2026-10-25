# governance — 治理

> 核心域 · schema `governance` · 骨架已落

```yaml
module: governance
layer: 核心域
schema: governance
status: in-progress
depends_on: []
emits: ["MerchantApproved", "SellerSuspended", "CategoryGrantRevoked", "CredentialExpired"]
consumes: ["RiskDecision", "GuaranteeLow"]
```

## 职责

商家分层、类目授权、资质有效期、违规扣分、冻结、**费率模板**。

## 模块契约

| 方向 | 对象                | 内容                                                                                                                      |
| ---- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 输入 | —                   | 不依赖任何业务模块。`RiskDecision` / `GuaranteeLow` 已声明消费，但消费方还没接上                                          |
| 输入 | `governance :: api` | `GovernanceCommand.report(...)`：检测模块上报违规线索（fulfillment 的发货超时检测在用），幂等键 `(kind, seller_order_id)` |
| 输出 | `catalog :: api`    | `canSell(merchantId, categoryId, brandId, qualificationCodes)` → `SellDecision`：允许，或带稳定 reasonCode                |
| 输出 | 事件                | `MerchantApproved` / `SellerSuspended` / `CategoryGrantRevoked` / `CredentialExpired`                                     |

**判定只读、不开事务、不产生副作用。** 拒绝时只给 reasonCode，不给中文句子——文案属于展示层。

**`qualificationCodes` 必须由调用方传。** 资质要求是 catalog 的配置，governance 反向去读就成环；
这也意味着**调用方传漏了，governance 不会替你补**。

## 拥有什么

`seller_profile` `category_grant` `brand_grant` `credential` `violation` `enforcement_action` `appeal` `commission_template`

当前落 5 张（`seller_profile` / `category_grant` / `brand_grant` / `credential` / `violation_clue`——
最后一张是**线索**，处置后的 `violation` 记录是后续迁移），其余用于违规处置与申诉，后续迁移补。

表都建在 `governance` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**能不能卖这个类目只有一个出口。** 费率模板放这里而不是 clearing：佣金率是商业条款，账务只执行不定义。

## 授权只挂叶子

**三条 grant 查询都用精确匹配，而发布时传的就是 L3 叶子。** 所以「授予 L1 数码配件」
不会被当成"覆盖所有子孙"——它根本匹配不上任何叶子，`canSell` 一直返回
`CATEGORY_NOT_GRANTED`，而且没有任何提示。

这比 catalog 那边「字段存了没人读」更难发现：字段没读只是少一道校验，
授权被静默作废是「看起来授权了、其实没授权」。

所以库里有触发器（`governance.assert_leaf_category`）挡住往非叶子授权，
`category_grant` / `brand_grant` / `credential` 三张表都挂上了。
`credential.category_id` 可空（null = 全平台通用资质），非空时同样只能挂叶子。

**为什么不改成沿 path 向上查找祖先**：授权是商业条款，运营心里想的就是
「这个类目能不能卖」，不是「这个分组能不能卖」。沿链查找还会让
「L1 授权自动覆盖所有 L3 子孙」变成一个隐含语义，出事时说不清是授了 L1
还是授了某个具体 L3。和 `category_config` 用同一条规矩，只有一种解释。

## 资质是按类型匹配的

`category_config.qualification_codes` 存「这个类目要 3C」，`credential` 存
「商家实际持有什么」。**判定是逐项比对，不是"有没有任意一条资质"。**

原来只看后者，于是商家拿一张食品经营许可就能卖手机——类目配的资质要求
从没被读过。现在用 `EXCEPT` 求差集，缺哪个报哪个，
reasonCode 是 `CREDENTIAL_MISSING`（和"有但过期"的 `CREDENTIAL_EXPIRED` 分开，
前者的动作是去办一张，后者是续期，前端提示完全不同）。

**两边的值域必须对得上**：`credential.type` 有 CHECK 约束，
`qualification_codes` 存的值要落在同一套代码里，否则永远匹配不到。

## 闭环断点

已落最小资格判定：`seller_profile` / `category_grant` / `brand_grant` / `credential` + `GovernanceQuery.canSell`。
已落违规线索接收：`violation_clue`（三态 open / acknowledged / dismissed，幂等键 `(kind, seller_order_id)`）+
`GovernanceCommand.report` + 管理端清单 `GET /api/admin/governance/clues`（`GOVERNANCE_REVIEW`，只读）。
未做：入驻审核、违规**处置**（扣分/限流/处罚，线索攒着等人看）、申诉、清退、保证金联动。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。

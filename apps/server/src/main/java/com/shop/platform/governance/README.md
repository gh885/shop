# governance — 治理

> 核心域 · schema `governance` · 骨架已落

```yaml
module: governance
layer: 核心域
schema: governance
status: in-progress
depends_on: ["seller :: api", "seller :: events", "audit :: api"]
emits: ["SellerSuspended", "SellerResumed"]
consumes: ["MerchantRegistered", "MerchantResubmitted", "RiskDecision", "GuaranteeLow"]
```

## 职责

入驻审核、商家分层、类目授权、资质有效期、违规扣分、冻结、**费率模板**。

## 模块契约

| 方向 | 对象                 | 内容                                                                                                                                           |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 输入 | `seller :: events`   | `MerchantRegistered` 落 `seller_profile(applied)` 进审核队列；`MerchantResubmitted` 把被拒档案翻回 `applied`（inbox 去重 + outbox 重投）       |
| 输入 | `governance :: api`  | `GovernanceCommand.report(...)`：检测模块上报违规线索（fulfillment 的发货超时检测在用），幂等键 `(kind, seller_order_id)`                      |
| 输出 | `seller :: api`      | `MerchantQuery.namesByIds`（审核队列拼主体名）、`OnboardingCommand.approve/reject`（审核结论**同事务**回写入驻申请单——反向影响走命令不走监听） |
| 输出 | `catalog :: api`     | `canSell(merchantId, categoryId, brandId, qualificationCodes)` → `SellDecision`：允许，或带稳定 reasonCode                                     |
| 输出 | 事件                 | `SellerSuspended` / `SellerResumed`：商家经营暂停/恢复；catalog 消费前者级联下架                                                               |
| 输出 | `ForbiddenWordQuery` | `firstHit(text)`：公开文本违禁词检查，catalog 在提交/非草稿编辑时调用                                                                          |

**判定只读、不开事务、不产生副作用。** 拒绝时只给 reasonCode，不给中文句子——文案属于展示层。

**`qualificationCodes` 必须由调用方传。** 资质要求是 catalog 的配置，governance 反向去读就成环；
这也意味着**调用方传漏了，governance 不会替你补**。

## 拥有什么

`seller_profile` `category_grant` `brand_grant` `credential` `violation` `enforcement_action` `appeal` `forbidden_word` `commission_template`

当前落 6 张（`seller_profile` / `category_grant` / `brand_grant` / `credential` / `violation_clue` /
`forbidden_word`——线索表之后的处置记录、申诉、费率模板是后续迁移）。

表都建在 `governance` schema 里，跨 schema 不 JOIN、不建外键。

## 管理入口

| 动作         | 端点                                                      | 权限                |
| ------------ | --------------------------------------------------------- | ------------------- |
| 入驻审核队列 | `GET /api/admin/governance/sellers?status=`               | `SHOP_REVIEW`       |
| 入驻审核通过 | `POST /api/admin/governance/sellers/{merchantId}/approve` | `SHOP_REVIEW`       |
| 入驻审核驳回 | `POST /api/admin/governance/sellers/{merchantId}/reject`  | `SHOP_REVIEW`       |
| 暂停商家经营 | `POST /api/admin/governance/sellers/{merchantId}/suspend` | `GOVERNANCE_REVIEW` |
| 恢复商家经营 | `POST /api/admin/governance/sellers/{merchantId}/resume`  | `GOVERNANCE_REVIEW` |
| 违禁词列表   | `GET /api/admin/governance/forbidden-words`               | `GOVERNANCE_REVIEW` |
| 新增违禁词   | `POST /api/admin/governance/forbidden-words`              | `GOVERNANCE_REVIEW` |
| 违禁词启停   | `PUT /api/admin/governance/forbidden-words/{id}/status`   | `GOVERNANCE_REVIEW` |

**入驻审核用 `SHOP_REVIEW`，处置用 `GOVERNANCE_REVIEW`**——第一次进门要不要放行、和已经在
里面的商家要不要暂停，是两种爆炸半径。审核通过即生效（`applied → active`，同事务落 `joined_at`
并经 `OnboardingCommand` 把 seller 侧申请单翻成 `approved`），不留中间态；驳回理由必填，
经 `OnboardingCommand` 落进申请单，卖家端 `POST /api/seller/onboarding/resubmit` 重提。
通过只放行 profile 这一道门，类目/品牌授权与资质另判。

暂停只改 `governance.seller_profile.status`（CAS `active → suspended`），然后发
`SellerSuspended`；catalog 消费它下架在线商品。恢复不自动重新上架——恢复营业不等于平台背书
历史商品仍满足上架门槛。违禁词用 NFKC + trim + lowercase 归一后做子串匹配。

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

# review — 评价

```yaml
module: review
layer: 无域
schema: review
status: implemented
depends_on:
    ["trade :: api", "trade :: events", "governance :: api", "account :: api", "audit :: api"]
emits: []
consumes: ["OrderCompleted"]
```

## 职责

一行一评、一次性追评、商家一次回复、平台隐藏/恢复；商品详情的公开评价区与单 SPU 聚合。
窗口 15 天（`shop.review.window`），过期自然关闭，**不做默认好评**（京东口径——没有真实
使用体验的分只会稀释评分的可信度）。

## 拥有什么

`review.review`（评价聚合行：pending → published → hidden）。

跨 schema 不 JOIN、不建外键；商品标题/图/规格是下单快照，展示不回查 trade / catalog。

## 模块契约

| 方向 | 对象                | 内容                                                                                        | 拿不到会怎样                                                 |
| ---- | ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 输入 | `trade :: events`   | `OrderCompleted`：按行预生成待评（窗口从 `completedAt` 起算）                               | 事件丢了 = 这单永远无待评行；由 `EventRetryJob` 补发兜底     |
| 输入 | `trade :: api`      | `findShippable`/`findPayable`（预生成的买家与行快照）、`findRefundable`（提交前判全额退款） | 查空 = 全额退款行，提交被 `REVIEW_LINE_REFUNDED` 拦          |
| 输入 | `governance :: api` | `ForbiddenWordQuery.firstHit`：评价/追评/回复三处公开文本的同步闸                           | 命中抛 `FORBIDDEN_WORD_HIT`（field=content，前端标红正文框） |
| 输入 | `account :: api`    | `AccountQuery.find`：提交时快照买家昵称                                                     | 查不到存空串，展示层兜「买家」——不挡评价                     |
| 输入 | `audit :: api`      | 商家回复与平台处置记 `AuditEntry`（同事务）                                                 | 未登记动作会抛异常挡住本次写（清单驱动）                     |
| 输出 | —                   | 不发事件、不被其他模块依赖；聚合分将来只走 `review :: api` 回给 catalog 当排序输入          | 尚未建 api/——没有消费者不建假窗口                            |

## 边界

- **买家提交与追评不记审计**：评价行本身带 buyer_id 与时间，就是这笔写操作的留痕（与地址/订单口径一致）；商家回复、平台隐藏/恢复记审计（动的是公开面）
- **不做**：默认好评、点赞/有用、举报、问大家（`qa` 表属本模块但未建）、先发后审的异步内容审核、评后全额退款追溯隐藏（等 trade 的退款事件）、店铺维度 DSR 聚合（无店铺页）
- 公开面只出 published；hidden 对买家公开面不存在、对商家可见不可回复
- 评价表是公开展示物，不进 `DataScopeTest` 范围表清单；买家私有读（待评价/我的评价/计数）的 SQL 恒带 `buyer_id`

## 闭环状态

已闭环：`OrderCompleted` 的 review 侧有人消费（trade README 闭环断点撤条）。
待评价列表、首页计数、商详评价区、卖家回复、平台治理全部走本模块的表，不回查别家。

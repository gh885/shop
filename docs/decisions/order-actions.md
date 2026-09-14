# Order 按钮动作：一份动作集，两种角色

> 目的：记下「订单可执行动作」从**前后端各推一份**收敛成**后端一份**的取舍，
> 免得下次有人又在组件里写一张「状态 → 按钮」表。
> 代码位置以 `apps/` 为根；`web/` = 买家端，`seller/` = 卖家工作台，`server/` = 后端。
>
> **状态：已实现**（2026-09）—— 后端 `OrderAvailableAction` 枚举 + 列表/详情契约下发，买家端消费。

---

## 1. 问题：同一件事两处真相，且已经漂移

后端从状态机算了一份动作集（`OrderStatus.ACTION_BY_TARGET` + `buyerActions()` / `sellerActions()`），
出参叫 `availableActions`；前端**没消费它**，而是在 `order/constants.ts` 里另写一张
「状态 → 按钮」表（`ORDER_CARD_ACTIONS` / `ORDER_DETAIL_ACTIONS`）。代价：

| 状态       | 后端 `availableActions`                 | 前端表格                | 结果                         |
| ---------- | --------------------------------------- | ----------------------- | ---------------------------- |
| 待付款     | `PAY` `CANCEL`                          | pay、cancel             | 一致                         |
| **待发货** | **`CANCEL`**（`PAID → CANCELLED` 合法） | 只有 remind（提醒发货） | **买家没有取消入口**         |
| 已发货     | `RECEIVE`                               | logistics、confirm      | 前端多一个 logistics（合理） |
| 终态       | 空                                      | rebuy                   | 前端附加（合理）             |

两处都不带注释，谁对谁错看不出来。而 `availableActions` 是**死数据**：投影进了领域对象，
没有任何组件读过它。

## 2. 决策：动作集由后端算，前端只定「怎么画」

后端把动作名提成枚举 `OrderAvailableAction`（`server/.../order/model/OrderAvailableAction.java`）：

- `@Schema(enumAsRef = true)` → SDK 生成 `OrderAvailableAction`（const + 联合类型）；
- 枚举常量自带 `target()`（落点状态），所以「可执行」= 目标态是当前态的出边 ∩ 角色允许的目标。
  这张表与转移表（`OrderStatus.TRANSITIONS`）的接头就是 `target()`，不再有第三份映射；
- 输出顺序按枚举声明序：集合的迭代顺序会让同一份数据两次请求给出不同 JSON，契约快照受不了；
- 列表与详情两个买家契约都下发（列表页也要画按钮，只在详情给会让两页行为不一致）。

前端据此重排：

| 层          | 职责                                                                          | 文件                     |
| ----------- | ----------------------------------------------------------------------------- | ------------------------ |
| wire → 领域 | `PAY/CANCEL/RECEIVE` → `pay/cancel/confirm`；`SHIP`（卖家侧）显式丢弃         | `web/order/order.ts`     |
| 规则        | `deriveOrderActions(order, surface)`：后端动作 + 本页附加动作                 | `web/order/model.ts`     |
| 常量        | 文案 `ORDER_ACTION_META`、展示顺序 `ORDER_ACTION_ORDER`、附加动作表、主操作表 | `web/order/constants.ts` |

三处设计决策刻意留在前端（后端不该知道）：**文案**（「去付款」怎么念）、
**顺序**（左→右：交易主流程 → 辅助入口；后端给的是集合无序）、**主操作**（一屏一个橙）。
`ship` 仍在领域联合里占位，但买家视角永远不会出现——映射表写成全量 `Record`，
后端加动作时先在这里编译期报错，不会静默少一个按钮。

## 3. 前端动作不并入后端

`remind` / `rebuy` / `add_cart` / `logistics` 是纯 UI 词汇（占位提醒、导航、跳加购），
后端永远不会产生；`availableActions` 也不该为了它们被撑大。
所以领域动作 = 后端动作 ∪ 前端动作，前者可穷举、后者写在 `ORDER_UI_ACTIONS` 里：

- 待发货：后端 `CANCEL` + 前端 `remind` → `[取消订单, 提醒发货]`（**这不只是补齐，是产品口径**：
  待发货的买家可以自助取消，`OrderStatus` 的 `PAID → CANCELLED` 是合法转移且回补库存）；
- 已发货：后端 `RECEIVE` + 前端 `logistics`；
- 终态：后端为空，卡片给 `rebuy`，详情页额外给 `add_cart` 并把 `rebuy` 升为主操作。

## 4. 卖家端与售后端

- 卖家工作台（`/trade/order`）的发货按钮仍按 `status === "PAID"` 判断：卖家列表契约
  （`SellerOrderListItemResponse`）没有下发动作集，条件与后端 `SHIP` 等价，暂未收敛；
- 售后单（买家侧 `buyerAfterSaleActions` / 卖家侧 `refundRowActions`）仍是前端按 `status` 读：
  `TicketResponse` 没有动作字段，且 `cancel/return/track` 里两项是前端弹窗与跳转（UI 词汇）。
  要让售后也走同一套，得先让后端在 `TicketResponse` 上暴露 `TicketAction` 的买家半边。
  见 `aftersale.md` §1「前端不复刻售后状态机」——那里守的是**合法性**不复制，
  状态→动作这层目前仍是前端读出的。

## 5. 测试钉在哪

- `server`：`OrderStatusTest` / `OrderTest` 锁动作集与角色过滤；
- `web`：`order.test.ts` 的 `toOrderActions`（含 SHIP 丢弃）与 `deriveOrderActions`
  （待发货两按钮、已发货顺序与主操作、终态两页差异、待付款主操作）；
- `ORDER_ACTION_ORDER` 覆盖 `ORDER_ACTION_META` 全部键（漏登记 = 按钮静默消失）。

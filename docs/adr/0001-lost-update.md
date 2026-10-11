# 并发控制：怎么防止丢失更新

- **状态**：已落地
- **记录日期**：2026-10-11
- **出现在哪**：订单状态流转、券锁定、库存冻结 / 扣实 / 释放、商品下架、店铺停业、账号注销、后台调库存

## 背景

丢失更新是「读一行 → 算 → 写回」被两个事务同时做：都读到旧值，各算各的，后写的覆盖前写的，前一个的改动**无声消失**。买家付款撞上超时关单，两边都读到「待付款」；两个请求同时冻结同一 SKU 的库存，都读到「余 10」。

它的特征是**两边碰的是同一行**。这个窗口只有并发来了才看得见，串行测试永远绿。

## 方案比较

| 族                                         | 方案                                                                                                                 | 适用                     | 代价                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| **一、让数据库一条语句做完**（窗口不存在） | 1. 原子写：`SET x = x ± n`                                                                                           | 新值是旧值的算术         | 只能表达 SQL 写得出的运算                                             |
|                                            | 2. 条件更新（CAS）：`WHERE status = 期望值`，看影响行数                                                              | 状态流转：从 X 到 Y      | 守卫手写，漏写等于没闸门                                              |
|                                            | 1 + 2 合体，再加 `RETURNING OLD/NEW` 拿前后两帧                                                                      | 既要改又要记流水         | PG18 方言                                                             |
| **二、悲观：先占住再读-改-写**             | 3. `SELECT … FOR UPDATE` 行锁                                                                                        | 任意读-改-写             | 锁持有到事务结束，热点行排队；锁多行易死锁                            |
|                                            | 4. 按键咨询锁 `pg_advisory_xact_lock(hash(id))`                                                                      | 想锁但不想碰行锁         | 多一层约定，键要全局唯一                                              |
|                                            | 5. 应用层 / 分布式锁（Redis SETNX、Redisson、ZooKeeper）                                                             | 多进程、跨库             | 多一套基建；锁有 TTL 过期与崩溃残留问题                               |
| **三、乐观：改完再验**                     | 6. 版本号 `@Version`，`WHERE version = ?`，0 行重试                                                                  | 新值由旧值算、SQL 写不下 | 要重试逻辑；必须先 select 再 update；冲突多时重试风暴                 |
|                                            | 7. 隔离级别：`REPEATABLE READ` 发现「我要改的行在我拍快照后被人改过」直接报 serialization failure；`SERIALIZABLE` 同 | 想让数据库替你查         | 需要重试基建；热路径上 serialization failure 变 500；按事务开要记得开 |
| **四、架构上消灭竞争**                     | 8. 按键串行化：同一行的所有写路由到一个执行者（分区队列 / actor / 单线程）                                           | 超热点行                 | 要队列或路由基建（这是消息队列的一个用途）                            |
|                                            | 9. append-only / 事件溯源：不改行只追加，状态由事件推导                                                              | 审计重于读性能           | 读要折叠事件，查询变复杂                                              |
|                                            | 10. 设计成幂等 / 可交换，让丢失更新无害                                                                              | 操作天然可重放           | 不是所有操作都能                                                      |
|                                            | 11. 无冲突数据结构（CRDT）合并两边                                                                                   | 计数器、集合             | 状态机不可合并                                                        |

## 选了哪个，为什么

**状态流转与账本量走族一，6 一处；普通字段编辑仍走 `updateById` 整行回写（service 层 33 处），凡有第二个写者的列标 `updateStrategy = NEVER`。**

判据分两问。**先问这一列有没有第二个写者**：有（状态列被治理动作改、投影列被别的模块累加），这一列要么标 NEVER 不随整行回写、要么只经条件更新改；没有，整行回写可以接受——同一主体的编辑 last-writer-wins 是 CRUD 常态，且 JSONB 列的 typeHandler 只在实体路径上生效。**再问新值能不能在 SQL 里由旧值或期望值直接表达**，这决定走族一还是 6。

- 能 → 族一。状态流转写 `WHERE status = X`（`lockOne` / `markDelivered` / `markDeletionRequested` / `takedownPublished` / `suspend` / `applyReviewVerdict` / `decideIfPending`），算术写 `SET x = x ± n`，要前后帧加 `RETURNING OLD/NEW`（库存的 `freezeOne` / `captureOne` / `releaseOne` 三条是 1 + 2 合体）。它成立的数据库依据是：READ COMMITTED 下 `UPDATE` 等到行锁后会**按最新已提交版本重算 WHERE**，第二个事务等完发现条件不满足，匹配 0 行。所以一条语句真的没有窗口。
- 不能 → 6。全仓只有「后台把 SKU 总库存 set 成绝对值」一处，它天然是读-改-写。
- 整行回写：service 层 33 处 `updateById`，绝大多数是同一主体编辑自己的字段。真正的坑是其中有第二写者的列：`Product.soldCount`（订单完成时 `addSoldCount` 自增）与 `Product.status`（停业级联 `takedownPublished` 与上下架的条件更新）都标了 NEVER——后者是本记录第一次审视时才补上的，此前卖家编辑商品恰好撞上平台下架会把商品静默「救活」。同一轮把 `ShopMemberMapper.activatePending` / `CouponTemplateMapper.stopIfActive` 两处状态流转从整行回写收回条件更新。第二次审视（写 0003 / 0004 时）又抓到 `ShopMember.status`：店主调权限的整行回写撞上对方确认邀请，同款修法；于是把这条约定升级成门禁 `SecondWriterColumnGateTest`，它顺带点名了 `Payment.status`、两本地址簿的默认标记与 `CartItem.quantity`（见代价 6）。
- 不选族二：单行场景族一够用，行锁只会把热点排成队。不选 5：仓库的原则是「要锁优先 PG 咨询锁，不自建锁表背 TTL」，而咨询锁又只给写偏斜用。
- 不选 7、8：都要一套重试或路由基建，为零处需求建基建不值。全仓事务隔离级别零处修改，默认 READ COMMITTED。
- 9、10 不是替代而是补充：账本流水表是 append-only，状态表不是；`markDelivered` 这类重放无害的顺手用 10。

## 代价

1. 守卫手写在 mapper 里，方法名即流转。漏写没闸门，编译器不查。
2. 「`selectById` 再 `updateById`」整行回写**没有被禁**，只禁用于状态流转与账本量，判据靠 review。`updateById` 跳过 null 字段、自动填 `updated_at`，条件更新要自己 `.set(updatedAt, now)`。
3. 真并发只有真线程验得到：`StockConcurrencyIT` 起 16 个线程抢同一行。慢，要真库。
4. 多实例部署时定时扫描重复查询，正确性不受影响（落点全是族一，同一笔只有一个实例抢得到）。
5. 多行条件更新要按键排序防死锁：`StockCommand` 单店内按 skuId、`CheckoutResolver` 店间按 shopId，(shopId, skuId) 升序即全局锁序。
6. 「第二写者列标 NEVER」由 `SecondWriterColumnGateTest` 钉住：扫每个 `updateById` 调用点的实体，凡在同一条 wrapper 语句里既做 WHERE 守卫又被 SET 的列（转移列）、或本实体 Mapper 的 SQL 里 `x = x ± n` 的列（累加列），必须标 NEVER；`@Version` 实体豁免，基类时间列豁免。它只钉这两种形状——同一主体的普通编辑撞车（SKU 的 `updateByProductAndId` 与 `updateById`）仍是 last-writer-wins，不归它管；裸 SQL 只解析本实体 Mapper 文件。第一次跑出来补标的是 `Payment.status`、`Address.isDefault`、`MerchantAddress.defaultShip / defaultReturn`、`CartItem.quantity`，后三者顺带把「置默认 / 改数量」从整行回写改成了具名条件更新。

## 什么时候重新评估

- 需要内存态状态机（读实体、Java 里流转、整行写回）：先把 6 从一处推成基建。
- 某个热点行的条件更新自己排起队（大促 SKU）：看 8 的按键串行化，或库存分桶。
- 出现第二个「后台 set 绝对值」形状：确认 6 的用法一致，别出现第二种乐观锁写法。
- 门禁漏网一次（某列被条件更新写过、却不是「同语句守卫 + SET」或「x = x ± n」这两种形状）：扩判定形状，不加豁免表。

## 相关

- [0002-write-skew.md](0002-write-skew.md)（它的族二第 7 条能把写偏斜折成丢失更新，交回本条）
- [apps/server/AGENTS.md](../../apps/server/AGENTS.md)「mapper 层职责」一节
- [docs/business-rules/coupon.md](../business-rules/coupon.md) CPN-35（锁券）

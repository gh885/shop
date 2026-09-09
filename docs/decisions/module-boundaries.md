# 后端模块边界：目标形态与改造路线

> 目的：记下"如果从零设计，后端模块该怎么切"，以及从现状走过去的顺序。
> 现状依赖图见 [docs/architecture.md §2](../architecture.md)；执法条款在 [apps/server/AGENTS.md](../../apps/server/AGENTS.md)，本文不重复。
> 写于 2026-09-09，对应代码 `bf03328`。

---

## 0. 结论

骨架不用动：按领域切模块、模块即 schema、api 与 events 双通道、Modulith 加 ArchUnit 强制。这些是对的。

要改的是一批**不是领域推出来、而是被绕出来的边界**：绕循环依赖、绕 ArchUnit 规则、按角色而非领域切。目标是把 13 个业务模块收成 10 个，把 3 条交互方向反转成单向。

判断一条边界是否健康，用三个信号：

| 信号                      | 含义               | 现状中的例子                                            |
| ------------------------- | ------------------ | ------------------------------------------------------- |
| 规则出现例外              | 依赖方向选错       | 结算事件归消费方 cart 所有，退款事件归生产方 order 所有 |
| 一个状态机横跨两个 schema | 模块切在了流程中间 | 店铺审核：admin 建单、shop 改状态，靠两个事件互相同步   |
| 编译期无环、运行期有环    | 接口倒置藏了依赖   | product 注入 order 实现的销量查询                       |

---

## 1. 目标形态

### 1.1 模块清单

| 模块        | 拥有什么                                                      | 对应现状                      |
| ----------- | ------------------------------------------------------------- | ----------------------------- |
| `account`   | users 与 staff 两种主体的凭证、会话、设备、资料；买家收货地址 | auth + admin 的 staff + user  |
| `shop`      | 店铺、成员与授权、入驻审核队列、商家发货/退货地址             | shop + admin 的审核 + address |
| `product`   | 类目、属性模板、商品、SKU、销量投影列                         | product                       |
| `inventory` | 库存主体与流水                                                | 不变                          |
| `cart`      | 购物车，监听下单事件自清                                      | cart 去掉 api 包与结算事件    |
| `favorite`  | 收藏夹                                                        | 不变                          |
| `order`     | 结算预览、拆单下单、履约状态机、超时                          | order 去掉售后                |
| `aftersale` | 售后单：申请、协商、退货、退款口径                            | 从 order 拆出                 |
| `payment`   | 支付与退款流水、网关适配                                      | 不变                          |
| `cms`       | 运营内容                                                      | 不变                          |

角色只出现在 controller 层：同一模块下按 `/api`（匿名）、买家裸前缀、`/seller`、`/admin` 分入口。**不再有按角色命名的模块**。

### 1.2 依赖图

```
account   （叶子）
shop      → account::api
product   → inventory::api
inventory （叶子）
cart      → product::api, inventory::api, shop::api, order::events
favorite  → product::api
order     → product::api, inventory::api, shop::api, account::api   ← 完成时经 product::api 累加销量
aftersale → order::api, order::events
payment   → order::api, aftersale::events
cms       （叶子）
```

两条规则，外加一条工具约束：

- **事件一律归生产方所有**。不再有"放消费方避免成环"的例外。出现成环冲动时，改的是方向，不是事件归属。
- **api 命令只在需要同事务原子的地方用**：下单冻结库存、支付推进订单并扣实。其余跨模块影响走事件，AFTER_COMMIT 加 outbox。
- **Modulith 的环检测在模块级，命名接口不拆环**。A 已依赖 B::api，B 再监听 A::events 也是环（监听器引用事件类型即依赖）。此时反向影响只能顺着已有方向走 api 命令，不能靠事件回流——销量就是这种情况：order → product::api 已存在，所以由 order 完成时调 `ProductCommand.addSold`，而不是 product 监听订单完成事件。

### 1.3 三条反转的交互

**结算：order 不认识 cart。** 下单入参就是 SKU 行，order 本来就要按 product 与 inventory 重算价格和库存，不需要回查购物车。cart 监听 `OrderPlaced`，按 userId 加 skuId 删自己的行。删除：`cart::api`、`CartReadQuery`、`CartCheckedOutEvent`。

**销量：product 自己持有。** `products.sold_count` 列，order 完成事务里经 `product::api` 的 `ProductCommand.addSold` 累加，方向仍是 order → product（product 反向监听订单事件会成模块级环，见上）。删除：`ProductSoldQuery` 接口、`ProductSoldReadQuery` 实现、卖家列表页的跨 schema 聚合。

**审核：shop 一个模块闭环。** 审核记录表迁到 shop schema，`/admin/shops/reviews` 端点放在 shop 模块，`SHOP_REVIEW` 权限守着。删除：`ShopCreatedEvent`、`ShopReviewDecidedEvent`、两个监听器、admin 与 shop 的双向登记。

### 1.4 共享层归位

按 AGENTS.md 已有的两轴（谁读它、换技术是否重写）重新摆放：

| 现位置                                                                  | 目标位置                                      | 理由                                                                                            |
| ----------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `common.ShopMemberContext`                                              | `shop.infra`，角色改用 `MemberRole` 枚举      | 只有 shop 模块内的过滤器和判权器读写                                                            |
| `auth.infra.JwtAuthFilter`、`admin.infra.StaffAuthFilter`               | `infra.security`                              | 只依赖 infra 与 common，与模块内部无关                                                          |
| `infra.captcha`、`infra.util.RateLimiter`、`infra.util.UserAgentParser` | `account.infra`                               | 单一消费方                                                                                      |
| `infra.db.DevOrderDataSeeder`                                           | Flyway dev-only location，与 V44 商品种子同路 | 现位置是为绕 JdbcTemplate 规则                                                                  |
| `XxxModuleConfig` 十个开关类                                            | 删除                                          | `@ConditionalOnProperty` 只作用于空配置类，模块 bean 仍被扫描；开关无效且 auth 的关掉会启动失败 |

### 1.5 命名

模块名必须能直接做 schema 名。现有三处破例（order/orders、user/user_profile、address/merchant_address）在目标形态里自然消失：user 与 address 并入 account 与 shop；order 的 schema 改名代价大，接受 `orders` 作为唯一登记在案的映射。

### 1.6 售后独立的数据模型

现状是 orders 表上三列（after_sale_status、after_sale_type、refund_amount），意味着一单只能有一个售后、不能按行项售后、无协商记录。目标：

```
aftersale.tickets        售后单：order_id, order_item_id(可空=整单), type, status, refund_amount, reason
aftersale.ticket_events  时间线：ticket_id, actor, action, note, created_at
```

order 只保留 `refund_amount` 汇总口径，由 aftersale 经 `order::api` 写回。

---

## 2. 诚实的边界

README 说"可随时拆分为微服务"。实际上模块之间大量是**同事务同步调用**：下单事务里冻结库存，支付事务里推进订单再扣实库存，订单事务里同步监听落退款单并调网关。这些边界在编译期干净，在事务上是一体的。

这是合理的单体取舍，强一致优先，目标形态也保留这一点。但要说清楚：

- 它不是"随时可拆"，拆任何一个都要先把同事务命令改成 saga 或最终一致。
- 接真实支付网关时，退款监听器在订单事务里同步调外部 HTTP 是第一个爆点，届时改为 AFTER_COMMIT 加 outbox，基建已经有了。

---

## 3. 改造路线

原则：每步独立可提交、可回退，先做减法，后做搬家。

| 步  | 动作                                                                                                                                            | 风险                                              | 触发条件                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------- |
| 1   | 删十个 `XxxModuleConfig` 与对应 yml 键；`PasswordEncoder` bean 移到 `AuthService` 同包的普通配置类                                              | 无                                                | 立即                         |
| 2   | `ShopMemberContext` 搬进 `shop.infra` 改枚举；删 address 两个无人消费的事件；两个鉴权过滤器搬进 `infra.security`                                | 无，均为模块内移动                                | 立即                         |
| 3   | 销量改 product 投影列：加 `sold_count` 列并回填；`product::api` 增 `ProductCommand.addSold`，order 完成时同事务调用；删 `ProductSoldQuery` 链路 | 低。需一次回填迁移                                | 立即                         |
| 4   | 售后独立建表建模块：新 `aftersale` schema 与 tickets 表，状态机从 `OrderTransitionService` 迁出，退款事件改由 aftersale 发布                    | 中。数据迁移 orders 三列到 tickets                | 售后功能展开之前，越早越便宜 |
| 5   | 结算反转：`CreateOrderRequest` 改为 SKU 行；cart 监听 `OrderPlaced` 自清；删 `cart::api` 与 `CartCheckedOutEvent`                               | 中。改前端下单入参                                | 与步 4 无关，可并行          |
| 6   | address 并入 shop：表迁到 shop schema，`MerchantAddressReadQuery` 移入 `shop::api`                                                              | 低                                                | 步 2 之后                    |
| 7   | admin 解体：审核并入 shop，staff 账号与登录并入 auth 并改名 `account`，user 的地址并入 account                                                  | 高。最大一次搬家，涉及三个 schema 与前端 admin 端 | 前六步稳定后                 |

每步完成后 `ModularityTests` 与 `NamingRulesTest` 必须仍然绿，`allowedDependencies` 登记同步删减。步 7 完成后更新 [docs/architecture.md §2](../architecture.md) 的依赖图与本文 §1.1 的"对应现状"列。

---

## 4. 不做的事

- **不合并 cart 与 favorite**。两者演化方向不同（交易前置 vs 营销留存），小不是合并的理由。
- **不拆 category 出 product**。属性值改名要同事务刷新 SKU 快照，拆开就得多一条事件链，当前规模不值。
- **不把买家地址与商家地址合成一个 address 模块**。所有者不同、快照消费方不同，各归其主更清楚。
- **不引入 saga 或消息队列**。同事务命令在单体里是优势，等真要拆服务再付这个成本。

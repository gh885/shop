# Logistics 模块设计笔记

> 目的：把物流从"订单表里两个裸字符串列"升格为独立模块的设计决策记下来——为什么这么切、边界往哪走、每一期做什么。
> 叙述方式：先说断点，再说决策，最后写代码地图。代码位置以 `apps/server/src/main/java/com/shop/platform/` 为根，下称 `platform/`。
>
> **状态：一期、二期后端均已实现**（V50/V51 迁移 + logistics 模块 + 两个买家/卖家/管理端点 + 权限码 + 测试）。
> 前端整体未做（买家「查看物流」抽屉、卖家发货下拉切新端点）。模块图已同步 `docs/architecture.md`。

---

## 0. 出发点：环断在哪

订单主状态机的骨架（`order/model/OrderStatus`）是完整的，缺的是 SHIPPED 到 COMPLETED 之间那 7 天：

| 环节 | 现状                                                                          | 缺口                                   |
| ---- | ----------------------------------------------------------------------------- | -------------------------------------- |
| 下单 | `OrderPlacementService` → `PENDING_PAYMENT` + `pay_expire_at`                 | 完整                                   |
| 支付 | `OrderCommand.markPaid` → `PAID` + `ship_expire_at`                           | 完整                                   |
| 发货 | `OrderTransitionService.ship` 直接写 `logistics_company` / `tracking_no` 两列 | 物流公司是自由文本，无字典、无可校验性 |
| 承运 | 无                                                                            | **无包裹实体、无轨迹、无签收信号**     |
| 收货 | 买家手点，或 `RECEIVE` 超时任务（从 `shipped_at` 起算 7 天）                  | 真实签收事实不参与，超时窗口不看物流   |
| 售后 | `aftersale.tickets.return_tracking_no` 又一坨字符串                           | 正逆向两套物流，无法统一轨迹           |

`apps/web/src/order/OrderCard.tsx` 里「查看物流」落到 `notify.info("即将上线")`——这个空壳就是断点的位置标记。

两条环分开做：

```
主环：下单 → 支付 → 发货 → 承运轨迹 → 签收 → 确认收货 → 已完成 → 售后窗口开
逆向环：售后申请 → 卖家同意退货 → 买家回寄 → 卖家收货 → 退款 → 库存回补
```

逆向环的状态机已经在（`TicketAction.RETURN_GOODS` / `RECEIVE_RETURN`），缺的只是回寄没有轨迹。两条环最终共用同一套包裹 + 轨迹模型。

---

## 1. 四条核心决策

### 决策一：logistics 是 order 的下游，order 不认识 logistics

这是全篇唯一可能踩到 Modulith 环的地方，先定死：

- logistics 要推进订单状态 → 需要 `order::api`
- order 详情要展示物流摘要 → 若走 `logistics::api`，就成环，测试期直接报错

**定案：复用 aftersale 已有的「投影写回」模式。**

```
logistics → order::api / order::events    单向
order     → logistics                     不存在
```

订单表那两个物流列**不再是数据源，是 logistics 写的投影**，和 `OrderCommand.syncAfterSale` 完全同构。因此订单详情契约（`OrderDetailResponse.logisticsCompany/trackingNo`）不变，前端零破坏。

> 这是 `apps/server/AGENTS.md` 里那条判据的应用：**投影列归展示方，由对方经 api 命令同事务写回；不反向读、不跨 schema 聚合。**

### 决策二：轨迹 append-only，状态是投影

`logistics.tracking_nodes` 只增不改；`shipments.status` 由节点**推导**，不允许单独 UPDATE 成"已签收"而被后来的"运输中"覆盖。

理由：快递推送乱序、重推、迟到补推是**必然**，不是意外。去重与单调性保护必须在数据层有约束，不能靠调用方守规矩。

### 决策三：去重靠业务唯一键，不靠推送方 id

`dedupe_key = shipment_id + node_code + occurred_at + location`，唯一索引拦截。推送方重推时会换 message id，靠它去重必然漏。

### 决策四：一期不改订单表、不动订单状态机

一期的目标是**把管道形状定下来**：以后接真快递只是把「人工录节点」换成「webhook 自动落」，表结构与接口形状不再变。所以一期：

- **不加 `orders` 列**（`delivered_at` 投影放二期）
- **不改 `OrderStatus`**（签收不驱动主状态机，二期才把收货倒计时改成从签收起算）
- order 侧改动只有两处：新增 `OrderShippedEvent` + 在 `ship()` 成功分支发布
- logistics 侧**出度为对 order 零**（只消费 `order :: events`，不读 `order :: api`）：事件已携带全部入参，买家查询的归属校验用包裹自己的 `user_id`。零出度 = 结构上不可能成环

> 二期的入口归一推翻了这条事件：发货方变成 logistics 自己，再发事件给自己听没有意义。
> 依赖随之翻面为 `logistics → order :: api`（`markShipped` / `markDelivered` 命令 + 发货视图只读），
> **仍是单向**。这正是"事件只是过渡"的例子：方向由"谁是发起方"决定，而不是由"哪种通道便宜"决定。

---

## 2. 领域模型

schema `logistics`，三期共**三张表**（`V50` 建前两张，`V51` 加字典与包裹的面单列）：

| 表                         | 关键列                                                                                                                       | 约束 / 索引                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `logistics.shipments`      | `order_id` / `user_id` / `shop_id` / `direction` / `carrier_name` / `tracking_no` / `status` / `shipped_at` / `delivered_at` | `UNIQUE(tracking_no)`；`UNIQUE(order_id) WHERE direction='FORWARD'`；`INDEX(shop_id, status)` |
| `logistics.tracking_nodes` | `shipment_id` / `occurred_at` / `node_code` / `description` / `location` / `dedupe_key`                                      | `UNIQUE(dedupe_key)`；`INDEX(shipment_id, occurred_at, id)`                                   |

要点：

- **字典是二期随入口归一才建的**：一期发货是卖家手填的物流公司、字典没有消费者，预建一张没人读的表是纯负债
- 承运商两列并存：`carrier_code` 指身份（对接物流商接口用），`carrier_name` 是发货时刻的展示快照（承运商改名不改写历史单据）。老端点只有名字，落库时回查字典归一，匹配不上则 code 留空
- **面单寄件人（`ship_from_*`）在二期从 `orders` 搬来**：它是面单 = 包裹的属性，一期错放在订单上（V41 引入）。这些列从未出现在任何 HTTP 出参里，故搬家对契约不可见
- **一单可多包裹**：二期去掉了「一单一正向包裹」的唯一索引。订单状态由首个包裹推进，后续包裹只追加记录并刷新订单上的物流摘要投影——不引入部分发货状态机（那是另一个量级的语义变更）
- `direction`（`FORWARD` / `RETURN`）一期就建且**有真实消费者**（买家查轨迹按 FORWARD 过滤），逆向环接入时不用改表
- `delivered_at` 是签收事实，与 `shipped_at` 一起定义「运输时长」，二期的时间窗口从这里起算
- **运单号唯一键取 `UNIQUE(tracking_no)` 而非 `UNIQUE(carrier_code, tracking_no)`**：一期 `carrier_code` 为空，而 PG 的唯一索引把 NULL 视为彼此不同——复合键会把「重复录单」这个闸门直接废掉。运单号本身带承运商前缀，全局唯一是站得住的建模（一个号只可能属于一张单）
- 一期不做号码池 / 面单打印 / 计费对账（见 §5）

### 状态词表（`logistics/model`）

| 枚举                | 取值                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ShipmentStatus`    | `PENDING_PICKUP` / `PICKED_UP` / `IN_TRANSIT` / `DELIVERING` / `DELIVERED` / `RETURNED` / `EXCEPTION`      |
| `TrackingNodeCode`  | `PICKED_UP` / `ARRIVED_HUB` / `DEPARTED_HUB` / `OUT_FOR_DELIVERY` / `DELIVERED` / `EXCEPTION` / `RETURNED` |
| `ShipmentDirection` | `FORWARD` / `RETURN`                                                                                       |

**归一化只在 logistics 边界层做**：节点码 → 状态 的映射表是唯一真相（`TrackingNodeCode.status()`，多个节点码可映射到同一状态——轨迹要细、状态要粗），快递公司的原始状态码（顺丰 200 / 中通 5 / 圆通 SIGNED）翻译后即丢弃，领域层只见标准词表。三期接真实承运商时只换翻译层。

**单调性**：每态一个 `rank()`（`PENDING_PICKUP` 10 → `RETURNED` 60），推进靠 `sourcesOf(target)` 反推合法前态做条件更新（`WHERE status IN (...)`），与 `OrderStatus.sourcesOf` 同一套路。两条反直觉但必要的规则：

- `EXCEPTION` 的 `rank` 为 0，**且既是任意前向目标的合法前态，也接受任意非终态进入**——异常是过程态不是分支，否则包裹一次异常就永远卡死
- 两个终态（`DELIVERED` / `RETURNED`）`rank` 最大，没有更大的目标可达，故天然不可回退

这条规则最初就写错过一次（`EXCEPTION` 只接受 `EXCEPTION` 进入，包裹卡死），由 `logistics/LogisticsIT.异常节点_可被后续前向节点离开_不会永久卡死` 钉住。

---

## 3. 接口与事件

### 跨模块接口（二期定型）

发货入口归 logistics 后，通道从「事件」换成「api 命令」，因为发起方换人了：

| 成员                                                                     | 方向              | 用途                                                        |
| ------------------------------------------------------------------------ | ----------------- | ----------------------------------------------------------- |
| `OrderReadQuery.shipmentViewById(orderId)` → `OrderShipmentView`         | logistics → order | 发货前置：归属 + `shippable()` 谓词（状态魔法值不出 order） |
| `OrderCommand.markShipped(orderId, shopId, carrierName, trackingNo, at)` | logistics → order | 首次发货 PAID→SHIPPED 并落审计流水；追加包裹只刷新摘要投影  |
| `OrderCommand.markDelivered(orderId, deliveredAt)`                       | logistics → order | 签收事实落 `delivered_at`，并把收货窗口从签收起算           |

三条都是**同事务同步调用**：包裹落不下则订单不推进，订单推不进则包裹回滚——绝不出现「有包裹但订单还是待发货」。这正是 `apps/server/AGENTS.md` 说的「api 命令只用于同事务原子」。

两个实现细节值得记：

- `markShipped` 走 `RETURNING OLD.status` 拿前态：PAID→SHIPPED 才落审计流水，SHIPPED→SHIPPED（追加包裹）不是状态转移
- `shipped_at` / `receive_expire_at` 用 `COALESCE` **只回填一次**：订单的发货时刻与收货窗口属于首次发货，追加包裹不得把它们往后推

### HTTP 契约

| 端点                                                  | 归属                  | 说明                                                 |
| ----------------------------------------------------- | --------------------- | ---------------------------------------------------- |
| `GET /orders/{id}/tracking`                           | logistics（买家）     | 订单级轨迹：`{orderId, shipments:[…]}`；无包裹 404   |
| `POST /seller/shipments`                              | logistics（卖家）     | 发货（主路径）：`carrierCode` + 运单号               |
| `PUT /seller/orders/{id}/ship`                        | logistics（卖家）     | **过渡兼容**老前端（自由文本物流公司）；前端切换后删 |
| `GET /seller/carriers`                                | logistics（卖家）     | 发货下拉：启用的承运商                               |
| `POST /admin/logistics/shipments/{id}/tracking-nodes` | logistics（平台运营） | 补录节点（真实轨迹也会缺：漏扫、推送丢失、纠错）     |

- `/orders/` 前缀的 Vite proxy 已存在，**前端不用改 proxy**；`/admin`、`/seller` 前缀也都有
- 轨迹出参是**订单级包裹列表**（一单多包裹是二期常态），订单摘要口径 = 首/最新包裹——契约在二期改过一次，因为当时前端还没消费它，改的成本为零
- 老发货路径放在 logistics 模块（不在 order）：路径前缀按角色分端（`/seller`），模块按领域切，两者不冲突
- 买方路径挂在订单资源下（买家心智模型是「哪个订单的物流」），由本模块承接——与 aftersale 的 `/orders/{id}/after-sales` 同一手法，order 不做转发
- 出参一律 `<名词>Response`，不给前端包裹主键与 `userId`/`shopId`/去重键等治理字段；展示文案（状态中文名、节点图标）留给前端投影，后端只给标准词表
- admin 录入新增权限码 `LOGISTICS_MANAGE`（岗位 OPS），已改三处：`docs/conventions/permission-codes.md` + `common/Permissions.java` + `account/service/StaffRole`

---

## 4. 分期

### 一期｜把"查看物流"做成真的（后端已完成，前端待做）

**人话**：现在发货只留下一串没人用的字符串，买家点"查看物流"弹"即将上线"。一期建两张表把包裹和轨迹存下来，买家点开能看到单号和一串节点。还没接快递公司，节点先手动录，把链路跑通。

**范围（已完成）**：`V50` 迁移 + logistics 模块骨架 + `OrderShippedEvent` 接线 + 买家查询端点 + admin 录节点端点 + 权限码 + 后端测试。不改订单表、不改 `OrderStatus`。
**范围（未做）**：web 端轨迹抽屉（买家出口），SDK 重新生成。

**验收**：下单 → 支付 → 卖家发货 → 买家看到运单号与 ≥2 个轨迹节点 → 录一个签收节点后状态显示"已签收" → 确认收货 → 已完成 → 售后窗口开。重复录同一节点，数据库行数不变。

**意义**：不是给买家看的，是**把管道的形状定下来**。

### 二期｜发货入口归一 + 签收参与倒计时（后端已完成，前端待做）

**人话**：发货弹窗里"物流公司"是手打输入框，"顺丰"和"SF"是两家公司，以后没法统计也没法对接。改成下拉选快递公司；发货动作从订单模块搬到物流模块做；一个订单可以发多个包裹；签收后收货倒计时从签收时间起算，而不是从发货时间起算。

**范围（已完成）**：`V51` 迁移（字典 + 面单列搬家 + 一单多包裹 + `orders.delivered_at`）；发货入口 `POST /seller/shipments`（`carrierCode` 强校验）与 `GET /seller/carriers`；`OrderCommand.markShipped / markDelivered`；`OrderTransitionService.ship` 与 `OrderShippedEvent` 删除；老端点保留为过渡兼容层。
**范围（未做）**：卖家发货弹窗改下拉 + 调用新端点（前端任务）。

**验收（已钉在测试里）**：同一运单号第二次录报 409；快递公司停用/不存在报 400；一单两包裹且订单的发货时刻只回填一次；签收后 `receive_expire_at` 从签收时刻起算，迟到节点不再重算。

**遗留**：老端点 `PUT /seller/orders/{id}/ship` 是过渡层，删除条件 = 卖家端切到 `POST /seller/shipments`。

### 三期｜接真实承运商

**人话**：轨迹靠人敲不算真系统。接一家快递聚合服务，轨迹自动来；处理快递公司推送的三个必踩坑——重复推、乱序推、各家字段不一样。

**范围**：`CarrierGateway` 接口 + 一家实现 + `POST /logistics/webhooks/{carrierCode}`（验签 → 幂等 → 落库）+ 轮询兜底 Job + 重试 + 停滞预警。
webhook 的落点就是现成的 `TrackingService.recordNode`（去重与单调推进已经在那儿，且被真库 IT 钉死），三期只补验签与协议翻译。

**验收**：真实单号全程无人工干预；重推落库 0 行；乱序推送不出现状态倒退。

### 四期｜逆向统一 + 异常治理

**人话**：退货回寄现在又是另一处字符串，和正向物流两套东西——统一到同一个包裹与轨迹模型，用同一个组件展示。再加个定时任务，包裹卡在中转站太久就冒出来，让客服知道该催谁。

**范围**：`aftersale` 的 `return_tracking_no` 迁到 `shipments(direction=RETURN)` 并复用轨迹组件；物流异常单（揽收超时 / 中转停滞 / 派送超时）。

**验收**：退货流程里能看到回寄轨迹；造一个停滞包裹，异常列表能冒出来。

---

## 5. 明确不做

| 不做                             | 原因                                                                     |
| -------------------------------- | ------------------------------------------------------------------------ |
| 号码池 / 取号 / 面单打印         | 没接真实承运商之前是纯负债；真的对接时它属于承运商适配层，不属于领域模型 |
| 运费计费、账单对账               | 与 `orders.shipping_fee`（V1 恒 0）同批做，不属物流轨迹闭环              |
| 五级地址库 / 预分拣              | 省市区编码够用                                                           |
| 把 logistics 做成 order 的上游   | 必然成环                                                                 |
| 给 `orders` 加"物流状态"列当真相 | 真相只能一份，在 `logistics.shipments.status`                            |

---

## 6. 落地清单（后端已实现）

### 后端

```
db/migration/V50__logistics_module.sql          schema + shipments + tracking_nodes（两张表，无字典）
platform/logistics/
├── package-info.java                           @ApplicationModule(allowedDependencies = {"order :: events"})
├── model/ShipmentStatus.java                   rank + sourcesOf（单调推进的合法前态集）
├── model/ShipmentDirection.java                FORWARD / RETURN
├── model/TrackingNodeCode.java                 节点码 → 状态 的唯一映射
├── mapper/Shipment.java / ShipmentMapper.java  selectForwardByOrder / advanceStatus
├── mapper/TrackingNode.java / TrackingNodeMapper.java   dedupeKey() / insertIgnoreDuplicate(ON CONFLICT) / selectByShipment
├── dto/TrackingNodeRequest.java                nodeCode / occurredAt / description / location
├── service/OrderShippedListener.java           监听 OrderShippedEvent 落包裹（同事务）
├── service/ShipmentTracking.java               出参形状（包裹 + 节点列表）
├── service/ShipmentService.java                买家查询 + 归属闸门
├── service/TrackingService.java                录节点：定位 → 归一化 → 去重 → 单调推进
├── controller/TrackingController.java          GET /orders/{id}/tracking          @Tag("logistics")
├── controller/AdminLogisticsController.java    POST /admin/logistics/shipments/{id}/tracking-nodes  @Tag("admin-logistics")
└── controller/response/ShipmentTrackingResponse.java / TrackingNodeResponse.java
platform/order/events/OrderShippedEvent.java     新增
platform/order/service/OrderTransitionService.java   ship() 成功分支加一行 publishEvent；import 事件
platform/common/Permissions.java                 + LOGISTICS_MANAGE
platform/account/service/StaffRole.java          OPS 岗位 + LOGISTICS_MANAGE
```

两个值得记住的实现细节：

- **去重靠 `ON CONFLICT (dedupe_key) DO NOTHING`，不是「插入 + 抓 DuplicateKeyException」**：PG 事务内唯一冲突会让整个事务进入 aborted 状态，异常吞不掉，只能不让冲突发生。代价是自定义 `@Insert` 不走 `MyBatisPlusMetaObjectHandler`，id 要调用方显式生成
- **`AdvanceStatus` 的「影响行数」就是并发闸门**：抢不到（终态已到 / 该节点比当前状态旧）就是乱序或迟到，静默无副作用返回，与订单状态机同一套路，不加锁

命名要点（`apps/server/AGENTS.md` 三层契约 + `NamingRulesTest` 已过）：

- mapper 包裸名词（`Shipment` / `TrackingNode`），**不叫 `TrackingEvent`**——避免与领域事件 `events` 包混淆
- HTTP 入参 → `dto/TrackingNodeRequest`；出参 → `controller/response/` 内 `<名词>Response`
- operationId 取 Java 方法名，全局唯一且语义化：`getOrderTracking` / `recordTrackingNode`
- service 方法用 `// 1. // 2.` 编号写流程脉络

### 二期增量

```
db/migration/V51__logistics_dispatch_and_carriers.sql   carriers + shipments 加列 + 一单多包裹 + orders.delivered_at + 交出面单列
platform/logistics/
├── mapper/Carrier.java / CarrierMapper.java            字典（selectEnabled / selectByCode / selectByName）
├── mapper/Shipment.java                                + carrierCode / shipFrom_*(7) / deliveredAt
├── mapper/ShipmentMapper.java                          selectForwardByOrder 改列表（一单多包裹）/ selectByOrder
├── dto/CreateShipmentRequest.java                      新端点入参（carrierCode）
├── dto/ShipOrderRequest.java                           老端点入参（迁自 order，标 deprecated）
├── service/DispatchShipmentCommand.java                发货入参聚合（两个入口共用）
├── service/OrderTracking.java                          订单级出参形状（包裹列表）
├── service/ShipmentService.java                        发货四道门 + 承运商归一 + 买家查询
├── service/TrackingService.java                        + 签收回写 order
├── controller/SellerLogisticsController.java           POST /seller/shipments、GET /seller/carriers、PUT /seller/orders/{id}/ship（兼容）
├── controller/response/{CarrierResponse,OrderTrackingResponse}.java
└── controller/TrackingController.java                  出参改订单级包裹列表
platform/order/
├── api/OrderShipmentView.java + OrderReadQuery.shipmentViewById   发货前置视图
├── api/OrderCommand.markShipped / markDelivered                    两条同事务命令
├── mapper/OrderMapper.markShippedReturningPrevious / markDelivered 条件更新（RETURNING OLD）
├── mapper/Order.java                                    + deliveredAt，- shipper*(7)
├── model/OrderTimeouts.RECEIVE                          注释改为「签收起算，发货兜底」
├── controller/SellerOrderController.java                - 发货端点
└── （删除）dto/ShipOrderRequest、events/OrderShippedEvent、service/OrderTransitionService.ship
```

### 测试资产

| 层   | 文件                                       | 覆盖                                                                                         |
| ---- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| IT   | `logistics/LogisticsIT`（3 例，真库）      | 发货落包裹 → 轨迹递进推状态 → 重推不增行 → 乱序不改终态 → 异常可恢复 → 未发货/越权同话术 404 |
| 接口 | `logistics/TrackingControllerTest`（7 例） | 401 守卫、404 透传、路由与参数绑定、403 判权、400 非法节点码、422 缺字段                     |
| 基座 | `testsupport/WebControllerTestSupport`     | 补 `@MockitoBean ShipmentService` / `TrackingService`（共享缓存的上下文）                    |

IT 走真实链路（下单 → 支付 → 发货）而不是直接发事件：要验的正是「发货这个动作真的会落出包裹」，这是同事务监听的全部意义。

### 未完成（下批）

整体前端未做（用户明确本期只做后端）：

- 买家端「查看物流」抽屉（消费 `GET /orders/{id}/tracking`，现在是多包裹列表）+ MSW handler + 投影单测
- 卖家端发货弹窗改成承运商下拉 + 调 `POST /seller/shipments`，然后删老端点
- 三期：真实承运商接入（`CarrierGateway` + webhook 验签）；四期：逆向统一 + 物流异常治理
- 现阶段轨迹仍靠 `POST /admin/logistics/shipments/{id}/tracking-nodes` 人工录（真实来源在三期）

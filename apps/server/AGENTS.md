# Shop 后端规范（apps/server）

> 本文是后端工作的完整规范，随本目录自动加载；根 AGENTS.md 不再重复维护这些条款。

## 关键架构规则

1. **模块隔离**：模块之间不 import 对方的 service/repo。模块间通信 = **api 包接口**（`@NamedInterface("api")`，查询与命令，同步同事务调用）+ **events 包事件**（`@NamedInterface("events")`，纯通知）。消费方在 `@ApplicationModule(allowedDependencies = …)` 显式登记
2. **Schema 隔离**：每个模块拥有自己的 PG schema（`product.products`）；跨 schema 只读按 ID 查询一律收进 owning 模块的 api 包（JdbcTemplate 只允许 infra.db 与各模块 api 包引用，ArchUnit 强制）
3. **不许跨 schema JOIN**
4. **`common/` 与 `infra/` 属于共享纯包**，不属于任何业务模块，无`@ApplicationModule`，经 `@Modulithic(sharedModules = {"common","infra"})` 显式登记为共享模块，任何模块可引用
5. **@Modulithic 强制校验模块边界**，测试期跨模块 import 直接报错

## 模块组织

```
src/main/java/com/shop/platform/
├── ShopServerApplication.java    ← @Modulithic(sharedModules = {"common","infra"})
├── common/                       ← 共享纯包：框架无关契约（异常体系、校验、UserIdHolder）
├── infra/                        ← 共享纯包：跨模块技术适配（JWT、Filter、MyBatis 配置）
├── account/                      ← 模块 = 顶层包 = PG schema
│   ├── package-info.java         ← @ApplicationModule（消费他模块时在 allowedDependencies 显式登记）
│   ├── controller/               ← REST 入口
│   ├── dto/                      ← HTTP 入参（XxxRequest / XxxQuery）
│   ├── service/                  ← 业务逻辑
│   ├── mapper/                   ← Entity + Mapper
│   ├── api/                      ← 可选：对外命名接口 @NamedInterface("api")，跨模块同步查询（XxxReadQuery）与命令（XxxCommand）
│   └── events/                   ← 可选：对外事件 @NamedInterface("events")，纯通知
├── product/
├── order/
└── …
```

- 模块内部结构：controller → service → mapper，三层到底
- 命名规范见下文「命名规范（三层契约）」，由 ArchUnit 强制校验
- BO/Model 可选，不预创建空目录
- api/ 只在有跨模块同步调用需求时创建；events/ 只在需要跨模块纯通知事件时创建
- 包名：`com.shop.platform` 主包，`com.shop.platform.<module>` 逐模块（`infra` / `account` / …）

## 模块边界规范

机制（api/events 两通道、schema 隔离、Modulith 登记）见上节「关键架构规则」；本节是**怎么切、往哪个方向依赖**的判据。

- **按领域切，不按角色切。** 角色只出现在 controller 层的入口前缀（`/api` 匿名、买家裸前缀、`/seller`、`/admin`），不再有 admin / user 这类按角色命名的模块
- **模块 = 顶层包 = schema。** 唯一登记在案的例外：order 模块用 `orders` schema
- **事件归生产方。** 事件类只放生产方 `events/` 包，不允许"放消费方避免成环"；有成环冲动时改的是依赖方向，不是事件归属
- **api 命令只用于同事务原子。** 下单冻结库存、支付推进订单并扣实、售后写回订单投影列；其余跨模块影响走事件
- **Modulith 的环检测在模块级，命名接口不拆环。** A 已依赖 B::api，B 再监听 A::events 也是环。反向影响顺着已有方向走 api 命令：销量由 order 完成时调 `ProductCommand.addSold`，而不是 product 监听订单事件
- **投影列归展示方。** 要展示别的模块的聚合（销量、最近售后状态）时本模块持有投影列，由对方经 api 命令同事务写回；不反向读、不跨 schema 聚合

三个坏味道信号：规则出现例外（依赖方向选错）；一个状态机横跨两个 schema（模块切在流程中间）；编译期无环、运行期有环（接口倒置藏了依赖）。

诚实边界：模块之间大量是**同事务同步调用**（下单冻库存、支付推单、退款监听），编译期干净、事务上一体。这是强一致优先的单体取舍，**不是"随时可拆微服务"**——拆任何一个都要先把同事务命令改成 saga 或最终一致。接真实支付网关时退款监听器改 AFTER_COMMIT + outbox，`kernel.event_publication` 登记表与重投任务已备。

不做的事：不合并 cart 与 favorite（演化方向不同）；不拆 category 出 product（属性改名要同事务刷 SKU 快照）；不合并买家地址与商家地址（所有者与快照消费方不同）；不引入 saga / MQ；`infra.db.DevOrderDataSeeder` 保留为 dev-only Java runner 不改 Flyway 种子（它每次启动按当前时间重建、依赖现库真实用户，版本化迁移做不到）。

## 编码风格 — Java

### service 层方法注释（编号脉络）

**业务方法内部用 `// 1.` `// 2.` `// 3.` 编号注释写出流程脉络** —— 只读注释骨架就能看懂编排（校验 → 变更 → 对账…）。既是自文档，也是验收介质。范本见 `AuthService.loginBySms` / `SkuService.updateSpecs`。

规则：

- 每步是「业务条款」，不是代码复述：`// 4. 对账：组合没变的保留，新增的补 SKU`；不要写 `// 4. 调用 updateById`
- 只在有真实阶段的方法里用；琐碎方法（2~3 行无阶段）别硬编号，会变成噪音
- 某一步超过 ~10 行 → 抽成私有方法，注释升级成方法名（编号是重构温度计）
- 落实在 service 层；controller/mapper 是样板代码，不强制

## 实体行为约定（半充血）

**不变式与状态规则归实体，编排与持久化归 service。**

- 实体可以有：状态谓词（`Product.isPublished()`）、派生视图（`Order.payAmountAsMoney()`）、状态机与动作推导（`Order.buyerActions()`，源自私有 TRANSITIONS 表）、值运算（`Money.plus()`）——这些是「数据自己说得出口的话」
- service 保留：事务边界、跨模块事件、条件更新（`WHERE status = ?` + 影响行数判断是并发闸门，不因实体有状态方法而改读-改-写；要内存态流转先补 `@Version` 乐观锁基建）
- 不给实体加无调用者的方法：谓词/视图先有消费点再上实体（YAGNI）
- **主键与时间列继承共享基类**：`infra.db.BaseEntity`（id + createdAt）/ `AuditedEntity`（多 updatedAt）。继承哪一种看表有没有 `updated_at` 列，不看业务可变性——append-only 账本（流水/轨迹/状态日志）不记 updatedAt。子类用 `@SuperBuilder` + `@EqualsAndHashCode(callSuper = true)`（字段在父类，二者少一就会丢字段或丢等价性），别再自己声明 id/createdAt/updatedAt

## 共享层语义（common / infra）

判据：**换技术会不会重写？** 会 → 技术适配；不会 → 框架无关契约。

- **`common/`（共享纯包）**：框架无关的共享契约，业务代码说得出口的语言 —— `BusinessException` / `Validate` / `UserIdHolder`。零框架依赖，换语言/技术栈依然成立。
- **根 `infra/`（共享纯包）**：跨模块共享的技术适配 —— `JwtProvider`（jjwt）、`RefreshTokenStore`（Redis）、各类 Filter / Config / TypeHandler / `GlobalExceptionHandler`。换库就重写。
- **`<module>.infra/`（模块内部）**：单模块内的技术管道 —— `shop.infra.ShopMembershipFilter`、`account.infra.StaffPermissionResolver`。Modulith 规定子包类型即模块内部，天然不被跨模块访问。

摆放两轴：**谁读它**（跨模块 → 根共享层；仅模块内 → `<module>.infra`）；**换技术重写吗**（重写 → infra；不重写 → common）。镜像示例：`UserIdHolder`（跨模块，common）vs `ShopMemberContext`（仅 shop，shop.infra）。

## 金额（Money）

**判据：一笔钱在链路上只有一个形状 —— `common/Money`（`amount` 分 + `currency`）。** 裸 `long`/`BigDecimal` 出现在契约里，那一刻币种就丢了（前端只能替平台猜一个）。所以「哪儿该是 Money」不需要判断：**不在 mapper 包、又是金额的，就是 Money。**

- **落库存列对**：金额列（`price` / `pay_amount` / `first_fee`…）配一个本表自己的 `currency` 列，`CHECK (currency = 'CNY')` 把「一期只有 CNY」钉成 DB 不变式（V58）。币种按行存而不是随父行：派生视图要在自己这一行闭合，跨表继承币种得 JOIN 才说得出口
- **闸门分三层，各挡一类事故**：DB `CHECK`（脏数据写不进）＋ `Money.requirePlatformCurrency()`（入参币种错时给 400 而不是撞 CHECK 变 500）＋ 金额非负 / 区间不自相矛盾的 `CHECK`（`min_price <= max_price`）
- **实体只负责换算**：mapper 实体留 `price` + `currency` 两列（MyBatis 按列映射），对外给派生视图 `priceAsMoney()` / `originalPriceAsMoney()`（可空列走 `Money.ofFenOrNull`）；`currency` 字段不得出现在 mapper 实体与 Money 之外任何地方
- **运算不脱离 Money**：`plus` / `minus` / `times` / `atLeast` 只在同币种间成立，跨币种抛 400 而不是静默算；零金额用 `Money.zero(手上这笔钱的币种)`，不凭空造 CNY
- 由 `MoneyTypeRulesTest`（ArchUnit）强制：契约层（dto / api / controller / service / events / common）的金额命名字段类型必须是 Money；`currency` 字段只允许出现在 mapper 实体与 Money（含 `infra.db` 造数器）里

## 命名规范（三层契约）

后缀只标方向，不标层次；出参能复用就复用，变形才新建。

- **数据库对象（mapper 包）**：裸名词无后缀（`User` / `Product` / `Sku`）；Mapper 接口以 `Mapper` 结尾
- **HTTP 入参（模块 `dto/` 包）**：`<动作>Request`，查询类入参用 `<名词>Query`；`Request` / `Query` 后缀只允许出现在 dto 包。create/update 共用同一 body 时允许 `<名词>Request`（如 BannerRequest / AddressRequest），字段完全相同才共用，别为了凑后缀复制两份
- **业务入参聚合（service 包内部类）**：`<动作>Command`，仅当入参字段多到无法拆包传基本类型时使用
- **跨模块 api 包（模块 `api/`，`@NamedInterface("api")`）**：对外暴露的同步接口。只读查询用 `<名词>ReadQuery`（如 ProductReadQuery，返回 XxxView 投影 record，状态魔法值私有在 owning 模块、对外给 `onSale()`/`published()` 这类谓词）；命令用 `<动作>Command`（如 StockCommand，同事务同步调用语义，失败抛异常回滚调用方事务）。跨 schema 裸 SQL 只允许出现在这里与 infra.db
- **Service 出参（service 包顶层类）**：能直接返回实体/已有类型就不新建；必须变形时按形状命名（`CategoryNode` / `StaffInfo` / `ProductDetail`），不贴统一 Response 标签，名字要说出"装的是什么"而非"某操作的结果"。形状名是开放集合、无方向性，ArchUnit 不强制其位置，按本节约定放 service 包顶层类
- **HTTP 出参（controller 包内部类；跨 controller 共用时可为包内顶层类，如 cms 的三个 Response）**：**要么定义 `<名词>Response` record，要么直出 service 形状类（`service/` 包顶层的 `XxxView / XxxItem / XxxNode / XxxInfo / XxxCount / XxxResult`）**；**一律禁止直接返回 mapper 实体** —— 实体的每一列都是潜在契约，存储演进会悄悄破坏前端（先例：Address 曾把 deletedAt 软删标记序列化出去）。直出 service 形状类时该 record 就是 wire 契约：字段只减不增，变更等于改接口，靠 openapi 契约 + 前端 SDK 编译期兜底；内嵌 mapper 实体时同样不得越过 HTTP 边界（如 ProductDetail 内嵌 Product/Sku 实体，仍走 ProductDetailResponse）。由 NamingRulesTest 强制：HTTP handler 返回类型必须是 `XxxResponse` 或 service 包形状类（各自的 `List`/`PageResult` 包装同理）/ void，共享层值对象（infra 的 TokenPair，auth/admin 登录共用）豁免
- **子组件**：Request 内部的嵌套小组件按语义命名（如 `SkuUpdateItem`），不受方向后缀约束
- **跨模块共享**：多个模块都要用的形状类（如 `TokenPair`）放共享层（`common/` 或 `infra/`），按共享层语义两轴判断归属
- **springdoc/OpenAPI（`@Tag` + 方法名 = operationId）**：每个 Controller 加 `@Tag(name = "…", description = "…")`，tag 名决定 SDK 类名（`cart` → `CartApi`）与文档分组；不写 `@Operation(operationId)`——springdoc 默认取 Java 方法名当 operationId，直接决定 SDK 方法名，所以 **Controller 公共方法名必须语义化且全局唯一**（如 `addCartItem` / `listMyOrders` / `getPublicProductDetail`，杜绝 `add`/`list`/`update` 这类跨 Controller 撞名的泛名）。
    - tag 命名：域名词，跨端冲突时带角色前缀（`products` / `seller-products` / `admin-reviews` / `cms-public`）；同域只读/只写分端时各自成 tag（`shops` vs `public-shops`）
    - 方法名 = 动词 + 资源 + 必要限定（`listMyOrders` / `getShopOrderDetail`），同域多角色（买家/卖家/管理员）靠前缀区分保证全局唯一的 operationId

由 `src/test/java/com/shop/platform/NamingRulesTest.java`（ArchUnit）强制校验方向后缀的归属（Request → dto，Query → dto/api，Command → service/api，Response → controller，mapper 裸名词；JdbcTemplate 只允许 infra.db 与 api 包）；形状命名的位置为文字约定。

## 测试资产规范（integration tests）

集成测试直连**专用测试库 shop_test**（WSL2 PostgreSQL，与 dev 库隔离，见 `application-test.yml`），**不用 `@Transactional` 回滚**——AFTER_COMMIT 监听、Modulith outbox 登记这类提交期行为只有真提交才验得到。数据一律**自建自清**，机制收敛在 `src/test/java/com/shop/platform/testsupport/`：

- 测试统一**平铺在模块包根**（account/XxxTest），不按 controller/service 再分层；仅当测试要触达被测类 package-private 成员时才下钻到其精确包
- **方法名 = 失败时的诊断书**：一律中文，下划线分段「动作/场景_条件_预期」（如 类目被商品引用_禁用拒绝_移除后放行、密码登录_全空字段_422、超时关单_回补库存_转已取消）；说公开行为不说实现细节；@Nested 组内可省略重复主语；值对象的单一场景允许一句话连读（非法手机号被拒绝）
- **类名分类**：`*Test` = 快环（单元 / MockMvc 接口层），surefire 在 `mvn test` 跑、不碰数据库；集成测试一律 `XxxIT`（如 OrderFlowIT / ProductIT），failsafe 在 `mvn verify` 跑真库。CI 门禁用 `mvn verify` 才覆盖集成测试
- 集成测试继承 `IntegrationTestSupport`：获得 `jdbc` 字段与每用例一个 `db: TestDb`，`@AfterEach` 自动 `purge()`
- 种子数据走 `db.seedOnSaleSku(shopId, priceFen, stock)` / `db.seedAddress(userId)`，清理自动登记
- service 调用产生的数据（无法预知主键）：建出后立即 `db.onDelete(sql, args…)` 登记，按自有 ID/userId/shopId 圈定；下单等发领域事件的路径要连 `kernel.event_publication` 一起登记（serialized_event LIKE %id%）
- **登记顺序 = 插入顺序（父表在前）**，purge 按登记逆序执行 → 先子后父；删除幂等，重复登记无害
- 清理 SQL 禁止 TRUNCATE / 无 WHERE 的 DELETE；测试库（shop_test）允许整库 wipe，dev 库人机共用严禁触碰

**接口测试（web 层契约）**统一继承 `WebControllerTestSupport`：全量上下文剔除数据源、service 全部 @MockitoBean 集中在基类（所有子类共享一个缓存容器），请求走真实过滤器链。每条测试只留 **HTTP 边界独有的失败面**（见下方规则）；出参形状不再逐条断，归 `ResponseSerializationTest` 与 OpenAPI→SDK 兜底。seller 路径用 `stubSellerMembership()` 放行成员过滤器（MP lambda 缓存需预热，基类已处理）。

### 接口测试的分组与断言（仅测 HTTP 独有）

**分组 = 接口路径，方法名 = HTTP 语义场景**，让测试文件一眼就是 API spec：

```java
class CartControllerTest extends WebControllerTestSupport {
    @Nested class 新增条目 {                // POST /cart/items
        void 合法body_201() { ... }
        void 缺quantity_422() { ... }         // 校验字段
    }
    @Nested class 列表 {                    // GET /cart/items
        void 未登录_401() { ... }              // 守卫
    }
    @Nested class 改条目数量 {                 // PUT /cart/items/{id}
        void 返回200_绑定id() { ... }          // verify() 路由+参数绑定
    }
}
```

- **一组 `@Nested` = 一条路由**，类注释标路径（`// POST /cart/items`）；方法名按 AGENTS 通用约定中文即可，`@Nested` 内省略重复主语

**只留这 4 类 HTTP 边界独有断言**（换到 service / IT / SDK 就测不到）：

1. **非 200 status**：守卫（401/403）、校验（422）、错误码（400/404/409/429）、创建/软删（201/204）
2. **absence**：软删标记、内部治理字段故意不吐（`deletedAt`/`ownerId`/`skuCode`/`userId`/`minPrice` 的 `doesNotExist()`）
3. **Cookie / 响应头契约**：`httpOnly`/`secure`/`path`/`maxAge=0`
4. **`verify()` 路由 + 参数绑定**：`X-Shop-Id`→shopId、路径变量 `{id}`、reason/密码等入参透传

**哪些不测（删掉）**：

- **形状/枚举/Money 序列化的 `jsonPath().value(...)` 回声** —— 字段名由 OpenAPI→SDK 编译期钉死，序列化形状归 `ResponseSerializationTest`；业务拼装/状态机归 service 单测 + IT
- **纯 `isOk()` + 形状的读 happy path** —— 除非该 200 带 HTTP 独有语义（匿名可达、成员过滤器放行），此时用 `verify()` 保住路由与参数绑定
- **业务规则复述**（可加购判定、防刷上限、分组算钱…）—— 已由 service 单测/IT 验证

**两条硬约束**：

- **方法名不能以数字开头**（Java 标识符，`204软删` 非法 → `软删_204`）
- **删断言 ≠ 删 stub**：controller 需要非 null 返回值，删了 stub 会 500（先例：改值名）

**响应序列化契约**：`ResponseSerializationTest`（`tools.jackson` 3 的 `JsonMapper.builder().build()`）统一钉死 Money → `{amount,currency}`、枚举 → name、嵌套 record 扁平化——防有人给枚举加 `@JsonValue`/给 Money 加 custom serializer 悄悄改掉线上契约。

由 code review 维持：新集成测试不继承基类 / 手写 @AfterEach 删数 / 建数不登记，都是回归。

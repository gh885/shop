# Shop 后端规范（apps/server）

> 随本目录自动加载，只放**每次写代码都要守的结论 + 去哪查**。解释、论证、细则都在 `docs/`（见下表），按需读、不进默认上下文。根 AGENTS.md 不重复维护这些。

## 关键架构规则

1. **模块隔离**：模块间不 import 对方 service/repo。跨模块通信 = **api 包接口**（`@NamedInterface("api")`，同步同事务的查询与命令）+ **events 包事件**（`@NamedInterface("events")`，纯通知）。消费方在 `@ApplicationModule(allowedDependencies = …)` 显式登记
2. **Schema 隔离**：每模块拥有自己的 PG schema（`product.products`）。跨 schema 只读一律收进 owning 模块 api 包，只有两类：**按 ID 点查**（`XxxReadQuery`）与**有序扫描**（`XxxRecallQuery`——谓词/排序键跑在 owning 模块的表上）。`JdbcTemplate` 只允许 `infra.db` 与各模块 api 包引用（`NamingRulesTest` 强制）
3. **不许跨 schema JOIN**
4. **`common/` 与 `infra/` 是共享纯包**，无 `@ApplicationModule`，经 `@Modulithic(sharedModules = {"common","infra"})` 登记，任何模块可引用
5. **`@Modulithic` 强制校验模块边界**，测试期跨模块 import 直接报错

## 模块组织

```
src/main/java/com/shop/platform/
├── common/ · infra/              ← 共享纯包（契约 / 技术适配）
├── account/ · product/ · order/  ← 模块 = 顶层包 = PG schema
│   ├── package-info.java         ← @ApplicationModule
│   ├── controller/               ← REST 入口
│   ├── dto/                      ← HTTP 入参（XxxRequest / XxxQuery）
│   ├── service/                  ← 业务逻辑（出参形状类也在此）
│   ├── mapper/                   ← Entity + Mapper
│   ├── api/                      ← 可选：跨模块同步查询（XxxReadQuery）与命令（XxxCommand）
│   └── events/                   ← 可选：跨模块纯通知事件
```

- 模块内 controller → service → mapper 三层到底；包名 `com.shop.platform.<module>`
- api/ 只在有跨模块同步调用需求时创建；events/ 只在需要跨模块纯通知事件时创建；不预创建空目录

## 模块边界（怎么切、往哪个方向依赖）

- **按领域切，不按角色切。** 角色只出现在 controller 入口前缀（`/api`、`/seller`、`/admin`）
- **模块 = 顶层包 = schema。** 例外：order 用 `orders` schema；模块可暂时无表，一旦有表必须独占 schema
- **事件归生产方。** 有成环冲动时改依赖方向，不改事件归属
- **api 命令只用于同事务原子**（冻库存、推单扣实、写回投影列）；其余跨模块影响走事件
- **Modulith 环检测在模块级，命名接口不拆环。** 反向影响顺已有方向走 api 命令（销量由 order 完成时调 `ProductCommand.addSold`，不让 product 监听订单事件）
- **投影列归展示方。** 展示别模块聚合时本模块持投影列，由对方经 api 命令同事务写回；不反向读、不跨 schema 聚合
- 坏味道：规则出现例外（方向选错）；状态机横跨两 schema（切在流程中间）；编译期无环运行期有环（接口倒置藏了依赖）
- 这是强一致优先的单体，大量同事务同步调用，**不是随时可拆微服务**；接真实支付网关时退款监听器改 AFTER_COMMIT + outbox（`kernel.event_publication` 已备）

## 后端细则在哪（动对应代码前先读）

| 你要动的东西                                    | 必读                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mapper 语句 / 条件更新 / 并发原子写             | [backend-mapper.md](../../docs/conventions/backend-mapper.md)；论证见 [adr/0001](../../docs/adr/0001-lost-update.md) · [adr/0002](../../docs/adr/0002-write-skew.md)                                                                                                          |
| DTO 校验 / `@Size`/`@Pattern` / 错误码 / 判权码 | [backend-validation.md](../../docs/conventions/backend-validation.md)；前端约束见 [field-constraints.md](../../docs/conventions/field-constraints.md)，码表见 [error-codes.md](../../docs/error-codes.md) · [permission-codes.md](../../docs/conventions/permission-codes.md) |
| 业务事件埋点                                    | [business-event-logging.md](../../docs/conventions/business-event-logging.md)                                                                                                                                                                                                 |
| 读缓存                                          | [backend-cache.md](../../docs/conventions/backend-cache.md)                                                                                                                                                                                                                   |
| 测试（单测 / IT / 接口测试）                    | [backend-testing.md](../../docs/conventions/backend-testing.md)；数据面 `pnpm db:up` 见 [tooling.md](../../docs/conventions/tooling.md)                                                                                                                                       |
| 架构总览 / 依赖图 / 金额与 ID 策略              | [architecture.md](../../docs/architecture.md)                                                                                                                                                                                                                                 |
| 业务规则（订单/券/物流/支付/账号…）             | [docs/business-rules/](../../docs/business-rules/)（改代码里的规则同步改条目）                                                                                                                                                                                                |

## 硬规则（一句一条；细则与门禁见上表）

- **service 注释**：业务方法内部用 `// 1.` `// 2.` 编号写出流程脉络，每步是业务条款不是代码复述；琐碎方法（2~3 行无阶段）别硬编号。范本 `AuthService.loginBySms`/`SkuService.updateSpecs`
- **实体半充血**：不变式与状态规则归实体（谓词 `Product.isPublished()`、状态机 `Order.buyerActions()`、值运算 `Money.plus()`），编排与持久化归 service；不给实体加无调用者的方法
- **实体基类**：主键/时间列继承 `BaseEntity`（id+createdAt）或 `AuditedEntity`（多 updatedAt），看表有没有 `updated_at`；子类 `@SuperBuilder` + `@EqualsAndHashCode(callSuper = true)`，别自己声明 id/时间列
- **原子更新收在 mapper**：条件更新守卫写死在方法名里、不由参数传入；一切「读到再写回」的量必须一条语句完成（禁 `selectById`→`updateById`）；有第二个写者的列标 `@TableField(updateStrategy = NEVER)`。门禁 `NamingRulesTest`/`AuditTransactionGateTest`/`ProductStaleWritebackIT`
- **越权口径**：「这条不归你」与「没有这条」同为 404，只走 `common.Validate.requireOwned/presentOwned`；403 只属于上下文与角色、且只有一个出口 `BusinessException.forbidden(...)`，无例外清单。门禁 `OwnershipDoorTest`
- **入站词表**：一个形状一个名字，DTO 注解只引用 owner 常量、数字字面量只住在 owner 里；改词表 = 改契约，跑 `pnpm sdk:gen`。门禁 `ValidationVocabularyTest`/`FieldRuleVocabularyTest`/`ErrorCodeVocabularyTest`
- **业务事件**：埋点只经 `BizEvent.of(name).put(...).emit()`，一条事实只打一行，多路径汇到一个方法时打在各自入口，目录表由 `BusinessEventCatalogTest` 核对（不进 OpenAPI、不需 `sdk:gen`，但同批改）
- **定时扫描**：扫一批到期行 → 逐笔推进的作业，逐笔循环一律经 `common.Sweep.each(...)` 做失败隔离（一行失败只丢那一笔，不冻整条线）；例外只有 `TrackingPollJob`/`ShipmentIssueService`。门禁 `SweepTest`
- **读缓存**：判据三条同时成立才上（读极频 / 改极少 / 改动须下一请求生效）；名单在 `CacheNames`、值类型由 owning 模块声明 `CacheSpec`；写侧必须接失效，TTL 只兜漏；判权/库存/订单状态不进缓存
- **Money**：一笔钱链路上只有一个形状 `common/Money`（`amount` 分 + `currency`）；不在 mapper 包、又是金额的，就是 Money；落库 `(amount 列, currency 列)` + `CHECK`。门禁 `MoneyTypeRulesTest`
- **Controller 编排**：方法体里除了「取上下文 → 调一个 service 方法 → 交出结果」不许有第二步（一个 handler 出现第二个业务调用即违规）。取上下文、参数映射、按状态 `switch` 出不同 use-case、事件发布不算；由 code review 维持
- **命名（三层契约，`NamingRulesTest` 强制方向后缀）**：mapper 裸名词 + `Mapper`；dto 包 `<动作>Request`/`<名词>Query`；service 内部/`api` 命令 `<动作>Command`；api 只读 `<名词>ReadQuery`；HTTP 出参**要么直出既有形状类（`XxxView`/`XxxItem`/… 或 infra 值对象）要么变形才 `<名词>Response`，禁恒等镜像、禁直接返回 mapper 实体**；`@Tag` 名决定 SDK 类名，Controller 方法名语义化且全局唯一（即 operationId）
- **测试**：IT 连 `shop_test` 真库、不 `@Transactional` 回滚、数据自建自清（继承 `IntegrationTestSupport`）；接口测试继承 `WebControllerTestSupport`、只留 HTTP 边界独有的失败面；`*Test` 归 `mvn test`、`XxxIT` 归 `mvn verify`（CI 用后者）。详见 [backend-testing.md](../../docs/conventions/backend-testing.md)

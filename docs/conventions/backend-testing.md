# 后端测试资产规范

> 后端细则。速查结论见 `apps/server/AGENTS.md`「硬规则」。数据面（PG·Redis·隧道）与 `pnpm db:up` 见 [tooling.md](tooling.md)。

## 集成测试（integration tests）

集成测试直连**专用测试库 shop_test**（与 dev 库隔离；本地 WSL 还是云上随 `SHOP_DATASTORE` 走，见 `application-test.yml`），**不用 `@Transactional` 回滚**——AFTER_COMMIT 监听、Modulith outbox 登记这类提交期行为只有真提交才验得到。数据一律**自建自清**，机制收敛在 `src/test/java/com/shop/platform/testsupport/`：

- 测试统一**平铺在模块包根**（`account/XxxTest`），不按 controller/service 分层；仅当触达被测类 package-private 成员时才下钻到其精确包。**例外**：跨切的契约防漂移守卫不属任何模块，集中在 `contract/` 包，见下「静态防漂移守卫（contract 组）」
- **方法名 = 失败时的诊断书**：一律中文，下划线分段「动作/场景_条件_预期」（`类目被商品引用_禁用拒绝_移除后放行`、`密码登录_全空字段_422`、`超时关单_回补库存_转已取消`）；说公开行为不说实现细节；@Nested 内省略重复主语；值对象单一场景允许一句话连读
- **类名分类**：`*Test` = 快环（单元/MockMvc 接口层），surefire 在 `mvn test` 跑；MockMvc 那批（继承 `WebControllerTestSupport`）跑**全量 Spring 上下文**、会连 shop_test 让 Flyway 整条链——`mvn test` 需要先有库（`pnpm db:up`），不是「不碰数据库」。集成测试一律 `XxxIT`（`OrderFlowIT`/`ProductIT`），failsafe 在 `mvn verify` 跑真库。CI 门禁 `mvn verify` 才覆盖集成测试。**防漂移守卫族**用 `@Tag("contract")` 标注（不看类名后缀），`mvn test -Dgroups=contract` 单跑，见下节
- 集成测试继承 `IntegrationTestSupport`：获得 `jdbc` 字段与每用例一个 `db: TestDb`，`@AfterEach` 自动 `purge()`
- 种子数据走 `db.seedOnSaleSku(shopId, priceFen, stock)` / `db.seedAddress(userId)`，清理自动登记
- service 产生的数据（无法预知主键）：建出后立即 `db.onDelete(sql, args…)` 按 ID/userId/shopId 圈定；下单等发领域事件的路径连 `kernel.event_publication` 一起登记（serialized_event LIKE %id%）
- **登记顺序 = 插入顺序（父表在前）**，purge 按登记逆序（先子后父）；删除幂等，重复登记无害
- 清理 SQL 禁止 TRUNCATE / 无 WHERE 的 DELETE；测试库允许整库 wipe，dev 库人机共用严禁触碰

## 接口测试（web 层契约）

统一继承 `WebControllerTestSupport`：全量上下文剔除数据源、service 全部 `@MockitoBean` 集中基类（所有子类共享一个缓存容器），请求走真实过滤器链。每条只留 **HTTP 边界独有的失败面**；出参形状不逐条断，归 `ResponseSerializationTest` 与 OpenAPI→SDK 兜底。seller 路径用 `stubSellerMembership()` 放行成员过滤器（MP lambda 缓存需预热，基类已处理）。

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

- **一组 `@Nested` = 一条路由**，类注释标路径（`// POST /cart/items`）

**只留这 4 类 HTTP 边界独有断言**（换到 service/IT/SDK 就测不到）：

1. **非 200 status**：守卫（401/403）、校验（422）、错误码（400/404/409/429）、创建/软删（201/204）
2. **absence**：软删标记、内部治理字段故意不吐（`deletedAt`/`ownerId`/`skuCode`/`userId`/`minPrice` 的 `doesNotExist()`）
3. **Cookie / 响应头契约**：`httpOnly`/`secure`/`path`/`maxAge=0`
4. **`verify()` 路由 + 参数绑定**：`X-Shop-Id`→shopId、路径变量 `{id}`、reason/密码透传

**哪些不测（删掉）**：

- 形状/枚举/Money 序列化的 `jsonPath().value(...)` 回声 —— 字段名由 OpenAPI→SDK 编译期钉死，序列化形状归 `ResponseSerializationTest`；业务拼装/状态机归 service 单测 + IT
- 纯 `isOk()` + 形状的读 happy path —— 除非该 200 带 HTTP 独有语义（匿名可达、成员过滤器放行），此时用 `verify()` 保路由与参数绑定
- 业务规则复述（可加购判定、防刷上限、分组算钱）—— 已由 service 单测/IT 验证

**两条硬约束**：

- **方法名不能以数字开头**（Java 标识符，`204软删` 非法 → `软删_204`）
- **删断言 ≠ 删 stub**：controller 需要非 null 返回值，删了 stub 会 500

**响应序列化契约**：`ResponseSerializationTest`（`tools.jackson` 3 的 `JsonMapper.builder().build()`）钉死 Money → `{amount,currency}`、枚举 → name、嵌套 record 扁平化——防有人给枚举加 `@JsonValue`/给 Money 加 custom serializer 悄悄改掉线上契约。

由 code review 维持：新集成测试不继承基类 / 手写 `@AfterEach` 删数 / 建数不登记，都是回归。

## 静态防漂移守卫（contract 组）

这一族**不是"验证行为对不对"的测试，是"两份东西有没有各自跑偏"的守卫**：注册表 ⇄ 两份生成常量 ⇄ catalog、Java 注解 ⇄ 契约列宽、前端 locale 集合 ⇄ 后端 `SupportedLocales`……**失败的含义是"有人改了契约没同步"，不是 bug**，所以它和普通单测、接口测试分开给信号。

- **住哪**：`src/test/java/com/shop/platform/contract/`。集中一处是刻意的——它们是跨切守卫，不归某个业务模块（与上面"平铺模块包根"相反）。
- **怎么标**：类上 `@Tag("contract")`。**新加一个防漂移守卫必须打这个 tag**——pre-push 靠 tag 挑它（不是类名后缀），漏打就静默掉出 push 门禁（`FilterErrorOutputTest` 曾是活样本：命名不带 `*VocabularyTest`/`*RulesTest`，旧口径下从没被 push 跑到）。
- **怎么跑**：`mvn test -Dgroups=contract`；本地 `pnpm test:contract`；lefthook pre-push 的 `java-build` 作业就是这条。**默认 `mvn test` / CI `mvn verify` 不排除它们**，照常全跑——tag 只用于"额外把这一族单独提前跑一遍"，不做减法，免得哪个环境把守卫排没了。
- **免库前提**：这族不连 DB、不起 Spring（反射 / 扫源码 / 读 catalog 文件），才进得了 push 热路径。连库的契约测试（`ApiDocsContractTest`、`ErrorResponseContractTest`，继承 `WebControllerTestSupport`）**不属此组**，别打 `contract` tag，它们归 CI `mvn verify`。
- **与 node drift 的分工**：纯前端侧的漂移（`sdk:drift`/`shape:drift`/`errors:drift`/`i18n:drift`）在 node；凡要读 **Java 注解 / 反射 / 编译期常量** 的核对只能在这族 JUnit（可达性锁死在 JVM，node 解析不了 Java 源码形态）。一个核对该放哪，看它要读的"最硬的那个形态"是什么语言。

## 编码风格 — Java

### 能用就用

| 注解                       | 使用场景                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `@RequiredArgsConstructor` | **构造器注入**：Service / Component 声明 `private final` 依赖时用，Spring 自动通过生成的构造器注入，省掉手写构造器 |
| `@Data`                    | POJO / Entity / DTO：所有字段可读写、需要 `toString`/`equals`/`hashCode` 时                                        |
| `@Getter` / `@Setter`      | 当 `@Data` 不合适时按需使用（如不想暴露 setter，或不需要生成 `equals`/`hashCode`）                                 |
| `@NoArgsConstructor`       | MyBatis-Plus / JPA Entity 需要无参构造时，常与 `@AllArgsConstructor` 或 `@Builder` 组合                            |
| `@AllArgsConstructor`      | 需要全参构造器时，常配合 `@Builder` 使用（加 `access = AccessLevel.PRIVATE` 强制走 Builder）                       |
| `@Slf4j`                   | 代替手写 `LoggerFactory.getLogger()`                                                                               |
| `record`                   | 请求/响应 DTO、不可变值对象、业务方法返回值（Spring 4.x / MyBatis-Plus 3.5.x 已完全兼容）                          |

### @Builder

构造器参数 **≥ 3 个** 时加 `@Builder`。

搭配方式：

```java
// 选项 A：配合 @Data（用于 DTO / 请求体）
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateProductRequest {
    private String name;
    private Long categoryId;
    private Long price;
}

// 选项 B：配合构造器私有化 + 全参构造（推荐用于实体）
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class Product {
    private Long id;
    private String name;
}
```

### service 层方法注释（编号脉络）

**业务方法内部用 `// 1.` `// 2.` `// 3.` 编号注释写出流程脉络** —— 只读注释骨架就能看懂编排（校验 → 变更 → 对账…）。既是自文档，也是验收介质。范本见 `AuthService.loginBySms` / `ProductService.updateSpecs`。

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

## 共享层语义（common / infra）

判据：**换技术会不会重写？** 会 → 技术适配；不会 → 框架无关契约。

- **`common/`（共享纯包）**：框架无关的共享契约，业务代码说得出口的语言 —— `BusinessException` / `Validate` / `UserIdHolder`。零框架依赖，换语言/技术栈依然成立。
- **根 `infra/`（共享纯包）**：跨模块共享的技术适配 —— `JwtProvider`（jjwt）、`RefreshTokenStore` / `RateLimiter`（Redis）、各类 Filter / Config / TypeHandler / `GlobalExceptionHandler`。换库就重写。
- **`<module>.infra/`（模块内部）**：单模块内的技术管道 —— `auth.infra.JwtAuthFilter`、`admin.infra.StaffAuthFilter`。Modulith 规定子包类型即模块内部，天然不被跨模块访问。

摆放两轴：**谁读它**（跨模块 → 根共享层；仅模块内 → `<module>.infra`）；**换技术重写吗**（重写 → infra；不重写 → common）。镜像示例：`UserIdHolder`（跨模块，common）vs `StaffContext`（仅 admin，admin.infra）。

## 命名规范（三层契约）

后缀只标方向，不标层次；出参能复用就复用，变形才新建。

- **数据库对象（mapper 包）**：裸名词无后缀（`User` / `Product` / `Sku`）；Mapper 接口以 `Mapper` 结尾
- **HTTP 入参（模块 `dto/` 包）**：`<动作>Request`，查询类入参用 `<名词>Query`；`Request` / `Query` 后缀只允许出现在 dto 包。create/update 共用同一 body 时允许 `<名词>Request`（如 BannerRequest / AddressRequest），字段完全相同才共用，别为了凑后缀复制两份
- **业务入参聚合（service 包内部类）**：`<动作>Command`，仅当入参字段多到无法拆包传基本类型时使用
- **跨模块 api 包（模块 `api/`，`@NamedInterface("api")`）**：对外暴露的同步接口。只读查询用 `<名词>ReadQuery`（如 ProductReadQuery，返回 XxxView 投影 record，状态魔法值私有在 owning 模块、对外给 `onSale()`/`published()` 这类谓词）；命令用 `<动作>Command`（如 StockCommand，同事务同步调用语义，失败抛异常回滚调用方事务）。跨 schema 裸 SQL 只允许出现在这里与 infra.db
- **Service 出参（service 包顶层类）**：能直接返回实体/已有类型就不新建；必须变形时按形状命名（`CategoryNode` / `StaffInfo` / `ProductDetail`），不贴统一 Response 标签，名字要说出"装的是什么"而非"某操作的结果"。形状名是开放集合、无方向性，ArchUnit 不强制其位置，按本节约定放 service 包顶层类
- **HTTP 出参（controller 包内部类；跨 controller 共用时可为包内顶层类，如 cms 的三个 Response、product 的 CategoryNodeResponse）**：**一律定义 `<名词>Response` record，禁止直接返回 mapper 实体或 service 形状类** —— 实体的每一列都是潜在契约，存储演进会悄悄破坏前端（先例：Address 曾把 deletedAt 软删标记序列化出去；CartController 曾直出 CartItemView）。字段镜像现状、只减不增；由 NamingRulesTest 强制：HTTP handler 返回类型必须是 `XxxResponse / List<XxxResponse> / PageResult<XxxResponse>` / void，共享层值对象（infra 的 TokenPair，auth/admin 登录共用）豁免。注意 service 形状类内嵌 mapper 实体时同样不得越过 HTTP 边界（如 ProductDetail 需转 ProductDetailResponse）
- **子组件**：Request 内部的嵌套小组件按语义命名（如 `SkuUpdateItem`），不受方向后缀约束
- **跨模块共享**：多个模块都要用的形状类（如 `TokenPair`）放共享层（`common/` 或 `infra/`），按共享层语义两轴判断归属

由 `src/test/java/com/shop/platform/NamingRulesTest.java`（ArchUnit）强制校验方向后缀的归属（Request → dto，Query → dto/api，Command → service/api，Response → controller，mapper 裸名词；JdbcTemplate 只允许 infra.db 与 api 包）；形状命名的位置为文字约定。

## 测试资产规范（integration tests）

真库直连 dev 库（WSL2 PostgreSQL），**不用 `@Transactional` 回滚**——AFTER_COMMIT 监听、Modulith outbox 登记这类提交期行为只有真提交才验得到。数据一律**自建自清**，机制收敛在 `src/test/java/com/shop/platform/testsupport/`：

- 测试统一**平铺在模块包根**（auth/XxxTest），不按 controller/service 再分层；仅当测试要触达被测类 package-private 成员时才下钻到其精确包
- **方法名 = 失败时的诊断书**：一律中文，下划线分段「动作/场景_条件_预期」（如 类目被商品引用_禁用拒绝_移除后放行、密码登录_全空字段_422、超时关单_回补库存_转已取消）；说公开行为不说实现细节；@Nested 组内可省略重复主语；值对象的单一场景允许一句话连读（非法手机号被拒绝）
- **类名分类**：`*Test` = 快环（单元 / MockMvc 接口层），surefire 在 `mvn test` 跑、不碰数据库；集成测试一律 `XxxIT`（如 OrderFlowIT / ProductIT），failsafe 在 `mvn verify` 跑真库。CI 门禁用 `mvn verify` 才覆盖集成测试
- 集成测试继承 `IntegrationTestSupport`：获得 `jdbc` 字段与每用例一个 `db: TestDb`，`@AfterEach` 自动 `purge()`
- 种子数据走 `db.seedOnSaleSku(shopId, priceFen, stock)` / `db.seedAddress(userId)`，清理自动登记
- service 调用产生的数据（无法预知主键）：建出后立即 `db.onDelete(sql, args…)` 登记，按自有 ID/userId/shopId 圈定；下单等发领域事件的路径要连 `kernel.event_publication` 一起登记（serialized_event LIKE %id%）
- **登记顺序 = 插入顺序（父表在前）**，purge 按登记逆序执行 → 先子后父；删除幂等，重复登记无害
- 清理 SQL 禁止 TRUNCATE / 无 WHERE 的 DELETE（dev 库人机共用）；类目这类有唯一索引的数据，名字带随机后缀防撞

**接口测试（web 层契约）**统一继承 `WebControllerTestSupport`：全量上下文剔除数据源、service 全部 @MockitoBean 集中在基类（所有子类共享一个缓存容器），请求走真实过滤器链。每个端点至少一条 happy path + 关键守卫（401/403/422/错误码透传）+ 出参形状回归（如地址不吐 deletedAt、买家侧 SKU 不吐 skuCode）。seller 路径用 `stubSellerMembership()` 放行成员过滤器（MP lambda 缓存需预热，基类已处理）。

由 code review 维持：新集成测试不继承基类 / 手写 @AfterEach 删数 / 建数不登记，都是回归。

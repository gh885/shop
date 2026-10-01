# Shop 后端规范（apps/server）

> 本文是后端工作的完整规范，随本目录自动加载；根 AGENTS.md 不再重复维护这些条款。

## 关键架构规则

1. **模块隔离**：模块之间不 import 对方的 service/repo。模块间通信 = **api 包接口**（`@NamedInterface("api")`，查询与命令，同步同事务调用）+ **events 包事件**（`@NamedInterface("events")`，纯通知）。消费方在 `@ApplicationModule(allowedDependencies = …)` 显式登记
2. **Schema 隔离**：每个模块拥有自己的 PG schema（`product.products`）；跨 schema 只读一律收进 owning 模块的 api 包，只有两类：**按 ID 点查**（`XxxReadQuery`）与**有序扫描**（`XxxRecallQuery`——谓词/排序键跑在 owning 模块的表上，别人代劳不了，如 `ProductRecallQuery` 的种子序 keyset 翻页），除此之外不开口子（JdbcTemplate 只允许 infra.db 与各模块 api 包引用，ArchUnit 强制）
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
- **模块 = 顶层包 = schema。** 两条登记的例外：order 模块用 `orders` schema；模块可以暂时没有自己的表（recommend V1 就没有——它的第一张表 V3 才来），但一旦有表就必须独占自己的 schema，不与他人共表
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

## mapper 层职责：怎么取，以及怎么在一条语句里原子地改

**判据一句话：mapper 管「怎么取」和「怎么在一条语句里原子地改」，本模块 service 管「做什么、按什么规则做、按什么顺序做」。** 分界不看代码长短，看**放错层之后会不会有人在别处抄第二份**——条件抄第二份就有两个答案，流转抄第二份就有一条绕过闸门的路。

- **该放**：查询条件、排序、批量 `IN` 的取值域、投影与聚合、常用查询的具名薄封装（`UserMapper.selectByPhone` / `TicketMapper.selectOpenByOrders` / `TicketEventMapper.selectLatestRejectNote` 直接回标量）。聚合在 SQL 里闭合、交出结果形状，不把裸 row 抛回 service 再拼：`FavoriteItemMapper.collectCountByProductIds` 与 `UserCouponMapper.countUsedByTemplateIds` 都回 `Map<UUID,Long>`，前者注释写死「只 count 不 join，跨模块读商品信息在 service 层拼装」
- **条件更新的守卫默认写死在 mapper，不由参数传入**：`UserCouponMapper.lockOne`（`UNUSED → LOCKED`，CPN-35）、`OrderMapper.markDelivered`（`SHIPPED` + `delivered_at IS NULL`）、`UserMapper.markDeletionRequested`（`ACTIVE` + 两个 `isNull`，ACC-75）、`ProductMapper.takedownPublished`（只碰 `PUBLISHED`）。方法名就是那条流转，守卫是这条语句的**适用域**——把守卫做成参数等于把「注销只碰 ACTIVE」这类裁决交给调用方，传错一个值洞就开了。只有两种情况该传参：① 起点是实体状态机推导出来的（`Order` 私有 TRANSITIONS 表那种），service 定从哪到哪、mapper 只保证「不是那一行就不改」；② 把上游已判过、但两步之间可能变掉的谓词在同一语句里重跑一遍（`UserMapper.anonymize` 的 `requestedBefore`，防冷静期内被撤销）
- **mapper 交出「改到了没有」的信号，不决定后果**：条件更新回影响行数，`SkuStockMapper.freezeOne` / `captureOne` / `releaseOne` 用 PG18 的 `WHERE` 闸门 + `RETURNING OLD/NEW` 一条语句拿回前后两帧（无行 = 闸门没过）。409 还是重试、要不要记流水，一律在 service 判；「0 行即没发生，不报错也不重试」是 `anonymize` 头注释里的既定口径
- **一切「读到再写回」的量都必须是一条语句**：禁的是 `selectById` 之后接 `updateById`——两步之间的窗口只有并发来了才看得见，看不见不等于没有。原子手段按需挑：`WHERE` 闸门（`lockOne`）、`ON CONFLICT DO NOTHING`（`SkuStockMapper.insertIgnoreConflict`）、`ON CONFLICT ... DO UPDATE ... RETURNING`（`FavoriteItemMapper.upsertIdempotent`，头注释写了为什么不能「先查再插、撞唯一索引后 catch 回读」：PG 一报唯一索引错就把整个事务标成 aborted，catch 之后的回读根本执行不到，25P02）
    - **`updateById` 的两条隐藏语义是这块的坑源**：它跳过 null 字段（所以「空串＝清空头像」这类写在 service 里的清空此前根本落不进去）、并靠 `AuditedEntity` 自动填 `updated_at`（所以 wrapper 条件更新必须自己 `.set(updatedAt, now)`）。整行回写的实际代价是「把别人的处置写回旧值」：登录/刷新手里的快照晚一步落库，就能撤销这期间管理端封的号、把已匿名化的号码复活。治理与账号写入因此一律收进 `UserMapper.updateStatus/touchLastLogin/updatePasswordHash/updateProfile`、`StaffMapper.disable/enable/updateRole`、`ShopReviewMapper.decideIfPending` + `ShopMapper.applyReviewVerdict` 这一族条件更新
    - **聚合量的末位保护不是一条行级语句能表达的**：「不能禁用/降级最后一个在岗超管」（ACC-57）数的是一个跨行聚合，`WHERE status = ACTIVE` 挡得住同一行被抢两次，挡不住两个最后超管被同时禁用——两边各不碰对方的行，各自的计数都还看见对方在岗。用的是 `StaffMapper.lockSuperAdminGovernance()`（事务级咨询锁，提交即释放）：行锁要锁住「其他那几行」，两个事务会各自先拿对方行的共享锁再抢主写锁，正好凑成环（PG 直接 deadlock → 500）。这类动作一天没有几次、全是人在管理端点的，串行化代价可以忽略。锁与计数必须成对出现在同一个私有出口里（`StaffService.requireNotLastActiveSuperAdmin`），否则新增调用点会忘记取锁
    - **真并发只有真线程验得到**：`StockConcurrencyIT` 的形状（起 16 个线程抢同一行、断言流水前帧互不重复）已复用到 `StaffGovernanceIT`（末位超管在竞争下是否还留一个）与 `ShopReviewConcurrencyIT`（双审批只落成一边）。串行用例跑不出这一格，mock 用例更是把失败面直接挡掉——见下条门禁
- **「根据查询结果决定下一步」这句要拆开看，否则会误杀两类正当代码**：正当的是 `ProductMapper.requireShopOwned` / `OrderMapper.requireOwned`——「取行 + 判归属 + 交回这一行」一句写完的薄封装，它不在分岔，只是把 404 的口径收在取数点（见下节，`OwnershipDoorTest` 背书）；不正当的是在 `default` 方法里连调两条语句、按第一条的结果决定第二条（要不要补发、锁哪张券、跳到哪个状态），那是编排，一旦住进 mapper，本模块的规则就没有一个读得到的地方了
- **有一条例外必须写出来，否则下一个人会去补 JOIN**：跨表聚合出来的排序键进不了 SQL。库存两档（PRD-79）不在 `products` 的列上，只能 service 把整店商品取回内存按聚合值排、再手动分页，mapper 只负责那一次批量取。不许为了「合规」写跨 schema JOIN，那条禁令更硬（见模块边界规范）
- **复杂条件里含业务口径时，口径要在名字或注释上现身**：`ShopReviewMapper.QUEUE_ORDER_BY` 把「待审记 0、已处置记 1」写成常量并注明排的不是列而是一句档位表达式（ACC-08）；`UserCouponMapper.selectPageMine` 的「UNUSED 那一档含 LOCKED、EXPIRED 那一档含库里还没收敛但已过 `expire_at` 的行」是券包页签的展示口径（CPN-51）。这类口径从注释里丢了，下一个人就会在 service 里再判一次状态，两处答案从此开始漂移
- **方向：MyBatis-Plus 的类型不往上一层外泄，`Page` 的翻译只有一处**。出参那半边已经闭合——没有任何 service/api 方法把 `Page<Entity>` 交出去，一律在 service 折成 `common.PageResult<T>`。入参那半边也已闭合：现拼条件容器、就地 `new Page<>`、裸 `.last(...)` 在 `src/main/java` 里只出现在 mapper 包，service/api 递进去的是 `PageParams` 与筛选值、接回来的是一个 `Page<T>` 局部变量（`AuthService.pageAdminUsers` 曾把「关键字命中手机号或昵称」这条列表规则住在 service，现在在 `UserMapper.selectPageAdmin`）。范本是 `ShopReviewMapper.selectQueuePage(PageParams, filter)`——入参给基本类型或 `PageParams`，`Page` 只在 mapper 内部成形；曾经的两个反形（`selectPageMine(Page<UserCoupon> page, …)` / `CouponTemplateMapper.selectPageByShop(Page<CouponTemplate> page, …)`）已改成收 `PageParams`
- **只碰本模块那张表**：mapper 不 import 他模块的 service / api / mapper，也不跨 schema JOIN（Modulith 校验、`NamingRulesTest` 的 `JdbcTemplate` 白名单、`MoneyTypeRulesTest` 的 `currency` 列白名单都假定这一条）；跨 schema 裸 SQL 只允许出现在 `infra.db` 与各模块 `api` 包
- **编译期门禁两道，钉的就是上面那条方向**（都在 `NamingRulesTest`）：`mybatis_conditions_only_in_mapper` 用 ArchUnit 挡住 `com.baomidou.mybatisplus.core.conditions..` 被任何非 mapper 包引用；`分页构造与裸SQL尾巴只住在mapper包` 扫 `src/main/java`，非 mapper 文件里出现 `new Page<` 或 `.last(` 即红。谁把一句查询条件留在 service，`mvn test` 当场拦
- **本节新加的一道门禁：写审计账本的调用点必须在事务里**（`AuditTransactionGateTest`，扫 `src/main/java`）。`RecordAuditCommand.record` 是 `@Transactional(MANDATORY)`，调用方漏了注解就是「业务库已改完、账本一行没有、接口回 500」——管理端禁用买家真实坏在这里，而它只有 mock 单测（mapper 被 mock，事务传播根本不参与），所以从测试里看不出来。门禁按行认成员：每个调用点必须解析到某个方法，方法自己（或其类）带 `@Transactional`，或那是 private 辅助方法且本文件内每处调用点都在事务里；**认不出所属方法也算违规**，签名形状一改先炸在这里而不是静默漏检。放宽只给 private：跨文件的调用方静态看不见，而「公开入口没事务」正是这道要拦的
- **本节钉不住的那半边仍由 code review 维持**：「有没有副作用」「有没有按结果决定下一步」这类语义静态判不了，与下面「Controller 编排」那条撞在同一道障碍上；`requireShopOwned` 那种正当薄封装的口径由 `OwnershipDoorTest` 背书（见下节）。写新的语句型 mapper 方法前先回答一句「这条能不能一条语句做完」；答案是不能的，就该搬到 service 或改状态机，而不是在 mapper 里堆步骤

## 越权口径：归属闸门 vs 上下文闸门

**「这条资源不归你」与「没有这条资源」必须是同一句话、同一个 404。** 给 403/400 就是说漏了嘴——那等于替调用方确认「这行存在、只是别家的」，脚本拿状态码差就能枚举别人名下的 ID。

- 归属判定只走 `common/Validate` 那道门：`owned(判定式, 缺席文案)`、`requireOwned(行, Entity::getShopId, 主体, 缺席文案)`、`presentOwned(Optional 形状, 同上)`。取行 + 判归属 + 交回这一行一句写完，调用点没有可写错的地方（等值判断与状态码都不在调用点）
- 403 只属于**上下文与角色**：缺 `X-Shop-Id`、不是本店成员、不是店主、账号被禁用、webhook 验签不过。那些挡的是「你有没有资格在这里操作」，不是「这条归谁」
- **403 只有一个具名出口 `BusinessException.forbidden(...)`**，不写 `new BusinessException(403, ...)`——构造器里的状态码常量在字节码里只是个 int，门禁扫不到
- 口径**没有例外清单**。要靠例外维持的口径，下一个人就会照清单抄第二份
- 编译期门禁：`OwnershipDoorTest`（403 出口白名单 + 「owner 列取值 + `equals` + `Validate.isTrue`」这种门外手搓形状）。业务条款散在 PRD-25 / ORD-01 / CART-05 / CPN-10 / AFS-06 / ACC-47 / ACC-79 / ACC-10

## 入站校验词表：一条规则一个名字

**同一个形状不许在两个文件里各抄一遍字面量。** 规则的定义住在持有该概念的领域类型里，DTO 的 `@Pattern`/`@Size` 只引用常量（`PhoneNumber.*` / `RegionRegistry.CODE_PATTERN` / `cms.dto.LinkTarget.PATTERN` / `UserCouponStatus.PATTERN` / `ProductSort.PATTERN` / `ProductFieldRules.*`）；存在性与语义判定也收在同一个类型里（`RegionRegistry.requireValidCode`/`requirePrefix` 是 400 话术的唯一出口，service 不各写一份 `validateRegion`）。细则见 GEN-52~64。

- **注解元素值必须是编译期常量表达式**——`String.join`、stream 推导都编不过。所以「常量等于枚举名 / wire 值 / 真实区划码」这条等式编译期查不了，由 `ValidationVocabularyTest`（无库，反射 + 扫 `src/main/java`）在测试期钉住，含 switch 分支穷尽性（Java 对 switch 语句不做穷尽检查）和「反证不空转」断言
- **商品词表在前端另有一份，两份都得是常量**（GEN-58）：`@Size(max = 30, message = "商品标题最长 30 字")` 那个数字在卖家端出现三次（发布表单的 `maxLength` 与校验、改标题弹窗的校验），其中一处还把上限拼进提示语，上限一改就有一句谎报。owner 是 `packages/common/product-fields.ts`，由 `FieldRuleVocabularyTest` 拿它比 Java 常量与契约那一格（数字与规则文案都比，不比各处的字段标签）
- **改词表 = 改契约**：值会导出进 `openapi/api-docs.json` 与生成的 zod，动一个字符就得先起后端跑 `pnpm gen:sdk`（`ApiDocsContractTest` 会先把不一致判红）。内部收口时替换值必须与被替换字面量**逐字节相同**，含 message 文案
- **形似而概念不同不许合并**：邮编与区划码同为 6 位数字、昵称与收件人同为 30 字，各留一份常量
- **数字规则和形状规则同罪同判（GEN-56）**：`@Size`/`@Max` 的长度、件数、条数上限同样只引用常量，owner 是 `common.Quantities`（件数 999 / 车 99 / 行 99 / 券 20）、`common.AddressFieldRules`（收件人 30 / 详址 120 / 智能粘贴整段 500 / 标签 20）、`common.TrackingFieldRules`（code 32 / 名字 50 / 运单号 64）、`account.dto.AccountFieldRules`（密码 8 至 72、电话 7 至 20、验证码 6、设备 ID 100、昵称 30）、`product.dto.ProductFieldRules`、`common.NoteFieldRules`（自由文本预算 200，买卖家备注 / 售后理由 / 运营补录轨迹描述等七个入参共用）、`cms.dto.CmsFieldRules`（标题 64 / 副标题 128 / tab 名 32 / key 32 / 子组 30 / 定位值 255 / URL 512——255 与 512 是两个概念，不是同一格没对齐）、`coupon.dto.CouponFieldRules`（券名 60 / 发行量 100 万，提示语由它拼出）、`shop.dto.ShopFieldRules`（店名 50 / logo key 255 / 审核备注 255 / 寄件公司名 60 / 邮编 6 位 / 地区规则 50 条 / 不配送地区 100 条）、`product.dto.CategoryFieldRules`（类目名 64 / 类目图标 255 / 属性名 32 / 属性值 64 / 属性值图 512）。`ProductFieldRules` 的量已从「标题与卖点」扩到整个商品域（图 key 255、SKU 名 160、编码 64、维度 10 / 取值 20、参数 32/64、关键词 128），`AccountFieldRules` 补工号 50 / 图形码 10 / refreshToken 200 / 头像 key 255，`TrackingFieldRules` 补轨迹地点 100，分页那一档 `PageParams.SIZE_MAX` 自持（不落在任何列上，是入口防刷闸门）。一个数字在这个仓库里最多同时住五边——Java 常量 → 编译进注解的那格 → 已发布契约 `openapi/api-docs.json` → 迁移里的列宽/CHECK → 前端三端三包里那份具名常量（GEN-64 之前它只是「外加 packages/common 抄的那一份」，app 里另外两处抄对门禁完全隐形），五边由 `FieldRuleVocabularyTest`（无库、不起 Spring，反射 record 字段 + 扫迁移和 TS 源）逐条核对。**方向是不对称的**：入站上限允许比落库那一格更紧（早一步 400 好过脏数据），绝不允许更松（松出去的那几个字符是 500，本门禁引入时抓到的第一个真 bug 就是回寄公司门 50 对列宽 32）；而 DB 是**第二道闸**的那几格（件数走 `CHECK` + `LEAST`）必须与入口**相等**——入口更宽时超出的件数会被 `LEAST` 静默改小而没人报错
- **不靠「记得登记」，靠结构禁令（GEN-61）**：`FieldRuleVocabularyTest.入站注解里的数字字面量只许住在owner里` 正则扫 `src/main/java` 全部源码，`@Size`/`@Min`/`@Max`/`@Pattern`/`@DecimalMin`/`@DecimalMax` 的参数里出现数字字面量即红，owner 类之外零豁免（清单今天为空，是刻意的）。只 `0` 与 `1` 放行——那不是容量档，是「不为负」与「非空」两句语义，给它们造常量等于把语义换成一个可漂移的数。旧写法是「登记表覆盖到哪儿算到哪儿」外加一份豁免清单，两者都会随改动静默过期
- **前端的具名边界也一样，且登记要两向核（GEN-64）**：`FieldRuleVocabularyTest.前端数值边界只许登记成三种对边之一` 从六个前端根目录（三端 `src` + 三包 `src`）扫出全部 `const X = <整数>` 形状的数值边界，与三张登记表（契约镜像 / Java 同值 / 策略数字）的并集**两向相等**——新增一个不登记就红，改名或删掉而不销登记也红。裸字面量禁令（`app里不许有裸的字数上限字面量`）在结构上看不见**起了名字的抄**，本轮就是这么漏掉购物车 999、商详 99、券发行量 100 万的。登记成「策略数字」的（后端根本不读它）必须填理由，空理由当场红。另两处自伤一并修掉：`stripComments`（如今住在 `testsupports.SourceScanner.withoutComments`）此前不认识字符串，`const ACCEPT_IMAGE = "image/*"` 里的 `/*` 会把它后面整段代码抹掉（污染本类**所有**读 TS 的测试），现改为逐字符的字符串感知剥离并留 `MAX_SIZE_MB` 作永久回归样本；`tsNumber` 学会认 `1_000_000` 的分节符写法。**改前端具名边界前先跑这条**，它是数字词表最后一边的唯一闸
- **迁移回放必须跟着搬家改键**：`dbNumbers()` 认识 `ADD COLUMN IF NOT EXISTS x VARCHAR(n)`、`ALTER TABLE x.y SET SCHEMA z`、`ALTER SCHEMA a RENAME TO b`、`RENAME COLUMN`，靠 `rekey` 把已收的宽度搬到今天的名字下。判据：门禁读的是历史脚本，而历史脚本会搬家——不改键，登记表里那些「落点」会停在已经不存在的表上（V42/V46/V48 之后有 18 条），下次真名那格被改窄时方向核对整个失明。同理，注释里 `{@code schema.table.column}` 形式的落点写的是搬家前的名字也要跟着改（迁移脚本里的历史名字不动，那是事实发生过的地方）
- **一个概念不许各说一半**：同一组件上「位数」与「形状」此前分居 `@Size(max = 6)` 和 `@Pattern("^\d{6}$")`，现在形状由位数拼出（`ShopFieldRules.POSTAL_CODE_PATTERN`），由 `邮编的位数与形状不许各说一半` 三向核对（注解上限、契约 pattern 原文、从形状反推的位数）。取不到位数或那是区间量词就直接抛，不回一个默认值——回默认值会让这条门禁在形状变复杂后悄悄失效
- **注释里宣称的数字等式要有门禁**：订单与售后批上限同值、车条目数与下单行数同值，这类「两个数为什么相等」的散文由 `SweepTest` / `FieldRuleVocabularyTest` 从源码里把两个数各自读出来比对，改一处不改另一处会红。注销批上限 20 刻意不等（毁灭性动作每轮少动几笔），没有等式就核对不了，只在注释里交代理由。**文档里的条数也算数字等式**：`docs/business-rules/README.md` 索引表「生效 / 待落地」两列由 `BusinessRulesIndexTest`（无库、纯文本）按顶格 `- **[编号]**` bullet 重数，尺子写死在测试里，同时要求索引覆盖规则目录每个 `.md`、无死链、编号全库唯一，并把全仓（含迁移与文档）引用的 `前缀-数字` 比对到真实条目——526 处引用零悬空。起这道闸门前五域合起来少写 9 条
- **错误码与数字同罪，但码值不进契约（GEN-62）**：`code` 也是裸 `String` 词汇，抛出点只许写 `common.ErrorCodes.X`，字面量在本仓库只住在 owner 里（41 处站点 / 19 个文件收一次；同一个码最多被抄 6 遍）。与 `@Size` 那一族的关键差别是：`code` 的**形状**虽然也进了契约（`ApiProblem.code` 声明成普通 `string`），但它的**取值**没有——契约里没有码的 enum，字面量在契约文件里出现次数实测全为 0，所以加码 / 改码不需要 `pnpm gen:sdk`（对照：新增一个扩展键、或改某个键的类型才需要，那属于形状变化）。也不许拿「值不在契约里」当不核对的理由。三边（Java 常量 ⇄ `docs/error-codes.md` ⇄ `packages/common/src/error-codes.ts`）、每一处站点的状态码、以及文档「谁在读」那一列，全由 `ErrorCodeVocabularyTest`（无库、不起 Spring）核对：状态码不抄表而从 `BusinessException` 工厂的签名与函数体读出来，前端落点不抄表而从生产源码里真实的 `ErrorCodes.X` 引用反查（两向相等，`—` 是合法值、含义是「今天没人按这个码分叉」）。码位允许「从变量来」的导管是三处（`Validate.isTrue` 形参、两个鉴权过滤器的 `verification.code()`），白名单写成等式，新起一条第四处就红——变量码静态扫不到，等于对门禁不存在
- **422 的字段级明细带 rule（2026-10）**：`errors[]` = `{field, message, rule?, min?, max?}`。`rule` 的取值只有 `common.ValidationRules` 那六个（`REQUIRED` / `MIN_LENGTH` / `MAX_LENGTH` / `PATTERN` / `MIN` / `MAX`），由 `infra.web.FieldValidationErrors` 从 DTO 注解读出（`@Size(max=30)` → `max: 30`；嵌套与数组沿属性路径逐段下钻找注解，**最后一段不去根对象上读值**——读了会抛 IAE，异常处理器自己抛就是 422 变 500）。`message` 保留（注解上那句中文，进日志、也是前端认不得 rule 时的兜底），**不要**为了「参数化」把它删掉。前端那份词表镜像在 `packages/common/src/validation-rules.ts`，两边相等由 `ValidationRuleVocabularyTest` 核。
- **错误体扩展属性只有两格，各带一条通道（2026-10）**：`errors`（字段级 `[{field, message, value?}]`）由 `BusinessException.badRequest(code, detail, errors)` 出口，`params`（错误级 `{槽位: 标量}`）由 `BusinessException.badRequestWithParams(code, detail, params)` 出口——两条都在 `GlobalExceptionHandler` 挂成 ProblemDetail 扩展属性。它们的**形状已在契约里**（`ApiProblem.errors` / `ApiProblem.params`，见 `docs/error-codes.md` §错误响应契约），**词表与取值不在**：改一个槽位名或它的值仍然不需要 `pnpm gen:sdk`，新增一个扩展键才需要（那要同时改 `OpenApiConfig` 与这三个键的门禁）。选哪一条看**有没有字段可定位**：按表单/DTO 的键标红输入框走 `errors`，没有对应输入框（「最多保存 {limit} 条收货地址」）走 `params`。纪律：`detail` 那句中文仍然写完整（日志与中文界面兜底靠它），但句子里的数字/词不由前端解析；`params` 的值只收标量、对象与数组一律不放（没哪句句子能插对象，且会顺着上报泄露成第四种形状），用户输入与手机号一类敏感值不进这两格。首个使用者是两条地址上限码（上限从常量作为 `params.limit` 出，前端 catalog 用 `{limit}` 槽位接）。
- **判权码同罪，且守卫清单只许一处（GEN-63）**：`@RequirePermission` 的码位只许写 `common.Permissions.X`，码值字面量在本仓库只住在 owner 里（16 处挂点 / 16 个控制器收一次）。代价比错误码再贵一档——错误码拼错断一条前端分支，判权码拼错断一次越权，且**没有任何测试会红**。文档 `docs/conventions/permission-codes.md` 那两张列（`授予`、`消费端点`）不是抄表：前者由 `StaffRole.permissions()` + `SellerGrants.GRANTABLE` 求值生成，后者由注解扫描生成（「券运营暂借 CMS_MANAGE」这类事实从此只能写在表里，写在注释里不算）。命名空间守卫同样只许一处定义：清单 `RequestPaths.GUARDED_NAMESPACES`、判定 `inNamespace`/`inGuardedNamespace`、自服务豁免 `isAdminSelfService` 由拦截器、两个过滤器、启动自检与本门禁共用——`AdminEndpointGuardTest` 此前自己抄了一份 `List.of("/admin", "/seller")` 并内联重写判定，「双保险」在清单扩容时只剩一重。新增两条安全等式：命名空间字面量只许出现在 owner 与 `@RequestMapping` 路由值里；匿名白名单按 `startsWith` 而判权按命名空间，两者在真实路由上的分歧（缝里的路由 = 匿名且无判权）必须为零。启动自检另有一道**静态版**，没有库也仍在跑（Spring 版要上下文）
- **扫描型门禁共用一把尺子 `testsupports.SourceScanner`**：走目录、读文件、去注释、指认相对路径这四件事此前在八份无库门禁里各写一遍（`Files.walk` 四种写法、去注释三种语义）。语义差别平时看不见，一旦某个门禁因为「注释里的字符串被数进去了」或「字符串里的 `/*` 把下一行代码吞了」而假绿，没人会去对八份实现。统一实现按路径排序（失败清单可复现）、整段块注释换成一个空格（相邻 token 不粘连）、保留换行（行级锚点照旧对得上）。新增扫描门禁直接用 `javaFiles` / `files` / `read` / `lines` / `withoutComments` / `rel`，不要再手写 walk；跳依赖、产物与生成物目录（含 `packages/api/src/sdk` 与点开头目录）由它负责
- 落点归属跟着「门装在哪一层」走，不跟着语义走：DTO 上挂了 `@Pattern` 的筛选值 → 422（GEN-19 ①），service 用 `Validate.enumFilter` 自判的 → 400（GEN-19 ③）。别靠猜，`ProductControllerTest.非法排序_422带字段名` 是实测锚点

## 业务事件：一个出口、一行、一份目录

**埋点只经 `infra.observability.BizEvent`**：`of("name").put(k, v)…emit()`（另有 `warn()` / `error()` / `error(cause)`）一次调用同时写完字段并打出那行，`message` 由字段表生成，值为 `null` 即跳过。`MdcScope` 只管信封（`trace_id` / `version` / `env`），不拿来手写 `event`。细则见 [business-event-logging.md](../../docs/conventions/business-event-logging.md) 与 GEN-48~51、GEN-55。

- **一条业务事实只打一行**：汇总行、复述上一行的 warn、"顺便也记一下"的第二份拷贝都要删。判据是第二行有没有新信息——只是换措辞或计数/求和就没有（聚合交给检索侧）
- **多条路径汇到一个方法时，事件打在各自入口**：`issueTokens` 同时服务登录与刷新，打在里面就把「续期」计成「登录」；共用同一后果的两条路径则共用一个事件名，用 `via` / `reason` 区分，不另起事件名
- **目录只有一份，且是核对出来的不是抄出来的**：`BusinessEventCatalogTest`（无库，纯文本扫描）拿代码和文档表逐条对——名字双向相等、必带字段双向包含、可选字段至少有人写、`*.failed` 带 `reason`、成功事件带实体 ID、规则文档反引号点名的名字目录里得有。埋点断言用 `testsupport.EventCapture`（挂根 logger，不挂被测类 logger：落点 logger 是实现细节，换出口会全线误红）
- **日志文本不是契约**：改事件名、字段、级别不导出进 OpenAPI，不需要 `pnpm gen:sdk`，但目录表得同批改；敏感面例外——手机号只能以 `PhoneNumber.mask()` 的形状入字段，号码明文不入日志（GEN-51）

## 共享层语义（common / infra）

判据：**换技术会不会重写？** 会 → 技术适配；不会 → 框架无关契约。

- **`common/`（共享纯包）**：框架无关的共享契约，业务代码说得出口的语言 —— `BusinessException` / `Validate` / `UserIdHolder`。零框架依赖，换语言/技术栈依然成立。
- **根 `infra/`（共享纯包）**：跨模块共享的技术适配 —— `JwtProvider`（jjwt）、`RefreshTokenStore`（Redis）、各类 Filter / Config / TypeHandler / `GlobalExceptionHandler`。换库就重写。
- **`<module>.infra/`（模块内部）**：单模块内的技术管道 —— `shop.infra.ShopMembershipFilter`、`account.infra.StaffPermissionResolver`。Modulith 规定子包类型即模块内部，天然不被跨模块访问。

摆放两轴：**谁读它**（跨模块 → 根共享层；仅模块内 → `<module>.infra`）；**换技术重写吗**（重写 → infra；不重写 → common）。镜像示例：`UserIdHolder`（跨模块，common）vs `ShopMemberContext`（仅 shop，shop.infra）。

## 定时扫描：逐笔隔离

**一批里有一笔抛异常，只丢那一笔。** 所有「扫一批到期行 → 逐笔推进状态」的作业，逐笔循环都经唯一出口 `common.Sweep.each(log, 线名, rows, 行标识, 落点)`：catch `RuntimeException`、单笔一行 error 带上行标识、批末一行 warn 交代「本批几笔里失败了几笔」；返回值仍只算真正落成的笔数（条件更新没抢到＝让位，不算失败）。细则见 GEN-57。

- **判据是查询形状，不是「出错概率低」**：扫描一律按到期时刻升序 + `LIMIT` 取头部，所以一笔稳定失败的行**每轮都排在队首**，它后面的行永远轮不到——调度照跑、每轮照打一行堆栈，而这条线已经停摆，日志里没有任何一句「停摆」。注销线尤其要命：卡住的正是冷静期早已满期的那批
- **隔离不等于吞异常，也不引入死信/重试计数**：下一轮同批重扫就是重试通道；行标识必传给 `Sweep` 而不是让它 `toString` 整行——实体是 `@Data`，把一行打进日志会把自由文本备注和号码一起写出去（GEN-51）
- **刻意不走 `Sweep` 的两处**：`TrackingPollJob`（外呼可用性与截止时刻的钩子不同形，套模板要配的开关比省下的代码长）、`ShipmentIssueService`（它要把 `DuplicateKeyException` 折成「已登记」这条正常路径，通用 catch 会把它误判成失败）。新增扫描线时先判是否落在这两类里，否则一律走 `Sweep`
- `SweepTest` 除机制单测外还扫源码：三条超时线里再出现「不带隔离的裸 for + 计数」就红（它挡的是「以后又有人就地写循环」，不是现在这三处）

## 读缓存（infra.cache）

**判据三条同时成立才上：读得极频、改得极少、且改动必须下一请求生效。** 现有名单就这三块（首页三块配置 / 类目树与子树 / 店铺公开信息），名字汇总在 `infra.cache.CacheNames`：

- **名单在 infra，值类型由拥有数据的模块声明**：各模块 `<module>.infra` 交一个 `infra.cache.CacheSpec` bean（`CmsCacheConfig` / `ProductCacheConfig` / `ShopCacheConfig`），`CacheConfig` 只定策略并核对登记是否齐——齐则启动通过，不齐直接启动失败，好过线上静默不缓存（运行期真遇到没登记的名字也是**直接不缓存**：`disableCreateOnMissingCache`，绝不退回默认序列化往 Redis 里写读不出来的字节）。`infra` 一旦 import 得动 `cms.mapper.NavEntry`，模块边界就漏了（Modulith 校验会判违规）
- 值按缓存给定具体 `JavaType` 序列化，不开 Jackson 多态类型标记；序列化器用 Jackson 3 的 `JacksonJsonRedisSerializer` + 注入 `tools.jackson.databind.ObjectMapper`（本项目的 mapper bean 是 Jackson 3，`com.fasterxml` 那个类型没有 bean，注入它启动即 `NoSuchBeanDefinition`）；键前缀 `cache:<名字>:`，与会话/限流键分段，`redis-cli` 上能按前缀扫到整组
- **读回用一份放过未知属性的 mapper 副本**（`CacheConfig.lenientReader`）：实体上的派生 getter（`Banner.isTimeRangeValid()` / `Shop.isActive()`）会被写成一个读不回去的属性，照 web 的严格口径缓存自己就 500；无参读的 key 显式给一个（`'tree'` / `'all'`），否则 Redis 里落下的是 `SimpleKey []` 那种带空格的键
- **写侧必须接失效**（`@CacheEvict` 或显式 evict）：TTL 5 分钟只兜漏接的写路径，不是新鲜度口径。判权、库存、订单状态这类闸门/账本一律不进缓存（ACC-43）
- 缓存靠代理生效，**同类自调用不命中**：所以「可以缓存的读」与「每次现算的推导」分成两个 bean（`CmsPublicReader` 是样板——banner 的生效时间窗口若跟着缓存，定时上下线就被冻住）
- `setTransactionAware(true)`：失效推迟到事务提交之后，否则「提交前就 evict」会被并发读用旧值填回，一 stale 就是一整个 TTL
- 只入缓存的正常返回：404 是抛异常、异常不入缓存，所以「未过审 → 审核通过」这条路天然不需要失效
- 测试上下文 `shop.cache.enabled=false`（注解全空转，用例不依赖 Redis、不跨用例串味）；缓存语义由 `infra/cache/ReadCacheTest` 用内存缓存器验「mapper 被打了几次」

## 金额（Money）

**判据：一笔钱在链路上只有一个形状 —— `common/Money`（`amount` 分 + `currency`）。** 裸 `long`/`BigDecimal` 出现在契约里，那一刻币种就丢了（前端只能替平台猜一个）。所以「哪儿该是 Money」不需要判断：**不在 mapper 包、又是金额的，就是 Money。**

- **落库存列对**：金额列（`price` / `pay_amount` / `first_fee`…）配一个本表自己的 `currency` 列，`CHECK (currency = 'CNY')` 把「一期只有 CNY」钉成 DB 不变式（V58）。币种按行存而不是随父行：派生视图要在自己这一行闭合，跨表继承币种得 JOIN 才说得出口
- **闸门分三层，各挡一类事故**：DB `CHECK`（脏数据写不进）＋ `Money.requirePlatformCurrency()`（入参币种错时给 400 而不是撞 CHECK 变 500）＋ 金额非负 / 区间不自相矛盾的 `CHECK`（`min_price <= max_price`）
- **实体只负责换算**：mapper 实体留 `price` + `currency` 两列（MyBatis 按列映射），对外给派生视图 `priceAsMoney()` / `originalPriceAsMoney()`（可空列走 `Money.ofFenOrNull`）；`currency` 字段不得出现在 mapper 实体与 Money 之外任何地方
- **运算不脱离 Money**：`plus` / `minus` / `times` / `atLeast` 只在同币种间成立；跨币种、负倍数、减法结果为负都表示代码或数据破坏了服务端不变量，抛 `IllegalStateException` 走 500 与 error 日志，不能伪装成用户输入错误。零金额用 `Money.zero(手上这笔钱的币种)`，不凭空造 CNY
- 由 `MoneyTypeRulesTest`（ArchUnit）强制：契约层（dto / api / controller / service / events / common）的金额命名字段类型必须是 Money；`currency` 字段只允许出现在 mapper 实体与 Money（含 `infra.db` 造数器）里

## Controller 编排：入口只调一次 use-case

**controller 的方法体里除了「取上下文 → 调一个 service 方法 → 交出结果」之外不许有第二步。**

这条曾经没有门禁，只有一例真违规（`AuthController.sendSmsCode` 自己调人机验证再调发码，已收进 `AuthService`）。
按 HTTP 方法计数去卡会误伤——把装配收进 service 之后，POST 与 GET 在「有没有副作用」上根本不是同一种形状，
而按「方法数 / 依赖数」卡又会把合法的入参映射算进去。**结论是：这条到今天仍由 code review 维持，出现第二例真违规再回来定规则形状**（白名单那种做法只会只增不减）。

判据一句话：**一个 handler 里出现第二个业务调用就是违规**。以下都不算：

- 取上下文（`@CurrentUser` / `@CurrentShop` / `@CurrentStaff`）与参数映射（`req.xxx()` 拆给 service）；
- `switch` 出不同状态的**不同** use-case（那是「一个动作一种状态」，仍是一次调用）；
- 事件发布、缓存失效——它们是 service 内部的步骤，不是 controller 的。

本轮新增的 controller（审计查询 / 店铺治理 / 评价三端 / 员工建号调岗）全部是「一次调用」形状，提交时逐个看过；
真出现第二例时，规则形状优先考虑「同一 handler 内出现 ≥2 次业务调用且返回值参与下一步判断」。

## 命名规范（三层契约）

后缀只标方向，不标层次；出参能复用就复用，变形才新建。

- **数据库对象（mapper 包）**：裸名词无后缀（`User` / `Product` / `Sku`）；Mapper 接口以 `Mapper` 结尾
- **HTTP 入参（模块 `dto/` 包）**：`<动作>Request`，查询类入参用 `<名词>Query`；`Request` / `Query` 后缀只允许出现在 dto 包。create/update 共用同一 body 时允许 `<名词>Request`（如 BannerRequest / AddressRequest），字段完全相同才共用，别为了凑后缀复制两份
- **业务入参聚合（service 包内部类）**：`<动作>Command`，仅当入参字段多到无法拆包传基本类型时使用
- **跨模块 api 包（模块 `api/`，`@NamedInterface("api")`）**：对外暴露的同步接口。只读查询用 `<名词>ReadQuery`（如 ProductReadQuery，返回 XxxView 投影 record，状态魔法值私有在 owning 模块、对外给 `onSale()`/`published()` 这类谓词）；命令用 `<动作>Command`（如 StockCommand，同事务同步调用语义，失败抛异常回滚调用方事务）。跨 schema 裸 SQL 只允许出现在这里与 infra.db
- **Service 出参（service 包顶层类）**：能直接返回实体/已有类型就不新建；必须变形时按形状命名（`CategoryNode` / `StaffInfo` / `ProductDetail`），不贴统一 Response 标签，名字要说出"装的是什么"而非"某操作的结果"。形状名是开放集合、无方向性，ArchUnit 不强制其位置，按本节约定放 service 包顶层类
- **HTTP 出参（controller 包内部类；跨 controller 共用时须为包内顶层类，如 `shop/controller/response/PhoneRevealResponse` 被两个 shop controller 直出）**：**二选一定死——带 `@Schema` 的形状即契约**：要么直出既有形状类（service 包形状 `XxxView / XxxItem / XxxNode / XxxInfo / XxxCount / XxxResult`，或 infra 共享值对象如 `TokenPair` / `UploadTicket`），要么在形状确需变形时（实体→wire 拍平、跨服务聚合派生，如 `ProductDetailResponse` / `PreviewResponse`）才定义 `<名词>Response`。**禁止恒等镜像：与 service 形状/infra 值对象逐字段同形的 Response 是多余的第二契约载体，HTTP 契约只允许一个承载者**；**一律禁止直接返回 mapper 实体** —— 实体的每一列都是潜在契约，存储演进会悄悄破坏前端（先例：Address 曾把 deletedAt 软删标记序列化出去）。直出形状类时该 record 就是 wire 契约：字段只减不增，变更等于改接口，靠 openapi 契约 + 前端 SDK 编译期兜底；内嵌 mapper 实体时同样不得越过 HTTP 边界（如 ProductDetail 内嵌 Product/Sku 实体，仍走 ProductDetailResponse）。由 NamingRulesTest 强制：HTTP handler（含 `@PatchMapping`）返回类型必须是 `XxxResponse` / service 包形状类 / infra 值对象（各自的 `List`/`PageResult` 包装同理）/ void
- **子组件**：Request 内部的嵌套小组件按语义命名（如 `SkuUpdateItem`），不受方向后缀约束
- **跨模块共享**：多个模块都要用的形状类（如 `TokenPair`）放共享层（`common/` 或 `infra/`），按共享层语义两轴判断归属
- **成功状态码（`@ResponseStatus`）**：三档，其余一律默认 200。**新建资源**的 POST → 201；**删掉一行**的 DELETE → 204（无 body）；**RPC 风格动作**（登录/刷新/登出、解析、揭示明文、批量判定、模拟确认、状态推进）→ 200，它们不新建资源也不删行。两条易错点：① 204 是枚举，不是「省了个 body」——给出去就等于承认「这行存在且已被你处理」，缺席与越权因此必须同为 404（见「越权口径」那节），否则状态码差可被用来枚举别人的 ID；② 幂等重放的入口不要按「这次真的写了吗」分 200/201（先例：`AdminLogisticsController` 补录重复节点恒 201，201 报的是「你要的那条事实现在在」）
- **springdoc/OpenAPI（`@Tag` + 方法名 = operationId）**：每个 Controller 加 `@Tag(name = "…", description = "…")`，tag 名决定 SDK 类名（`cart` → `CartApi`）与文档分组；不写 `@Operation(operationId)`——springdoc 默认取 Java 方法名当 operationId，直接决定 SDK 方法名，所以 **Controller 公共方法名必须语义化且全局唯一**（如 `addCartItem` / `listMyOrders` / `getPublicProductDetail`，杜绝 `add`/`list`/`update` 这类跨 Controller 撞名的泛名）。
    - tag 命名：域名词，跨端冲突时带角色前缀（`products` / `seller-products` / `admin-reviews` / `cms-public`）；同域只读/只写分端时各自成 tag（`shops` vs `public-shops`）
    - 方法名 = 动词 + 资源 + 必要限定（`listMyOrders` / `getShopOrderDetail`），同域多角色（买家/卖家/管理员）靠前缀区分保证全局唯一的 operationId

由 `src/test/java/com/shop/platform/NamingRulesTest.java`（ArchUnit）强制校验方向后缀的归属（Request → dto，Query → dto/api，Command → service/api，Response → controller，mapper 裸名词；JdbcTemplate 只允许 infra.db 与 api 包）；形状命名的位置为文字约定。

## 测试资产规范（integration tests）

集成测试直连**专用测试库 shop_test**（与 dev 库隔离；库在本地 WSL 还是云上随 `SHOP_DATASTORE` 走，见 `application-test.yml`），**不用 `@Transactional` 回滚**——AFTER_COMMIT 监听、Modulith outbox 登记这类提交期行为只有真提交才验得到。数据一律**自建自清**，机制收敛在 `src/test/java/com/shop/platform/testsupport/`：

- 测试统一**平铺在模块包根**（account/XxxTest），不按 controller/service 再分层；仅当测试要触达被测类 package-private 成员时才下钻到其精确包
- **方法名 = 失败时的诊断书**：一律中文，下划线分段「动作/场景_条件_预期」（如 类目被商品引用_禁用拒绝_移除后放行、密码登录_全空字段_422、超时关单_回补库存_转已取消）；说公开行为不说实现细节；@Nested 组内可省略重复主语；值对象的单一场景允许一句话连读（非法手机号被拒绝）
- **类名分类**：`*Test` = 快环（单元 / MockMvc 接口层），surefire 在 `mvn test` 跑；注意 MockMvc 那批（继承 `WebControllerTestSupport`）跑的是**全量 Spring 上下文**，会连 shop_test 让 Flyway 迁移整条链——`mvn test` 需要先有库（`pnpm db:up`），不是「不碰数据库」。集成测试一律 `XxxIT`（如 OrderFlowIT / ProductIT），failsafe 在 `mvn verify` 跑真库。CI 门禁用 `mvn verify` 才覆盖集成测试
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

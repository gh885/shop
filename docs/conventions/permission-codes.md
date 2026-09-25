# 权限码表

> 前后端共同语言。真相源是 `apps/server/src/main/java/com/shop/platform/common/Permissions.java` 的常量，
> **本文档是它的镜像**：两侧相等由 `PermissionVocabularyTest`（无库、不起 Spring）逐格核对，不再靠「记得同步改」。
> 「授予」与「消费端点」两列同样是**扫描 / 运行时求值的结果**，不是声明——写错会红，不会长期撒谎。
>
> 表头图例（授予列的取值字母表）：`岗位:REVIEWER` / `岗位:OPS` = 该岗位一经赋值即持有；`子账号` = 店主可授予
> （`SellerGrants.GRANTABLE`）；`仅超管` = 只有 SUPER_ADMIN 通配可达，没有任何岗位发它；`预留未消费` =
> 只有本文档登记它，无 Java 常量、无挂点（新增这类行必须同时进门禁的登记集合，否则红）。

| 域     | 码                 | 授予            | 消费端点                                                                                                           | 含义                           |
| ------ | ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| admin  | `SHOP_REVIEW`      | `岗位:REVIEWER` | `ReviewController`                                                                                                 | 入驻审核（通过与拒绝）         |
| admin  | `CMS_MANAGE`       | `岗位:OPS`      | `CmsContentAdminController`, `AdminCouponController`                                                               | banner / 导航 / 推荐位         |
| admin  | `CATEGORY_MANAGE`  | `岗位:OPS`      | `CategoryAdminController`, `CategoryAttrAdminController`                                                           | 平台类目                       |
| admin  | `LOGISTICS_MANAGE` | `岗位:OPS`      | `AdminLogisticsController`, `AdminShipmentIssueController`                                                         | 物流轨迹维护（补录节点、纠错） |
| admin  | `STAFF_MANAGE`     | `仅超管`        | `AdminAccountController`                                                                                           | 创建员工、分配岗位、禁用       |
| seller | `PRODUCT_MANAGE`   | `子账号`        | `ProductAdminController`                                                                                           | 商品增删改、规格 SKU、上下架   |
| seller | `ORDER_FULFILL`    | `子账号`        | `SellerOrderController`, `SellerLogisticsController`, `SellerAfterSaleController`, `SellerAfterSaleListController` | 卖家订单查看 + 发货            |
| seller | `ADDRESS_MANAGE`   | `子账号`        | `SellerAddressController`                                                                                          | 店铺发货/退货/揽收/账单地址    |
| seller | `SHIPPING_MANAGE`  | `子账号`        | `SellerShippingTemplateController`                                                                                 | 运费模板（按地区与件数计费）   |
| seller | `COUPON_MANAGE`    | `子账号`        | `SellerCouponController`                                                                                           | 店铺优惠券（建券、停券、名额） |
| seller | `MEMBER_MANAGE`    | `预留未消费`    | —                                                                                                                  | 成员管理                       |
| seller | `SHOP_MANAGE`      | `预留未消费`    | —                                                                                                                  | 店铺设置 / 注销                |

`Permissions.all()` 展开的就是这张表去掉 `预留未消费` 那两行的集合（顺序不参与核对，按码比对集合）。
SUPER_ADMIN 的 `me` 出参把通配符展开成 `all()`，判权内部仍用通配——两处新增码要同步这件事现在由门禁管，
不再由注释管。

平台岗位预设（`account.staff.role` 列，映射收在 `account/service/StaffRole`）：`SUPER_ADMIN`（通配）/ `REVIEWER` / `OPS`。

- 改「岗位 → 权限」映射 = 改 `StaffRole` 枚举发版；门禁核对「每条岗位至少一码」「岗位发出的码都在表里」
  与上表 `授予` 列，漏一格即红；
- 卖家可授予白名单 = `shop/service/SellerGrants`（防权限自我繁殖：OWNER 固有码不入集合）；
- 只有通配可达的码今天恰好一个：`STAFF_MANAGE`。它登记在门禁的 `WILDCARD_ONLY_CODES` 里，
  新增「运营岗该有但没有」的码要么补进 `StaffRole`，要么写进登记集合并说明理由——不能让读者猜；
- 全部为 MANAGE 型合并码（读随写权）；拆分触发器 = 第一个「能看不能改」岗位出现。

## 判权之外的另一半：命名空间守卫

`@RequirePermission` 只在**受保护命名空间**里是强制的，清单与判定共用一个 owner
`infra/web/RequestPaths`：`GUARDED_NAMESPACES`（`ADMIN_NAMESPACE` + `SELLER_NAMESPACE`）、
`inNamespace` / `inGuardedNamespace`、管理端自服务豁免 `isAdminSelfService`。

- 判权拦截器与启动自检读同一份清单。此前自检测试自己抄了一份 `List.of("/admin", "/seller")` 并内联重写
  了命名空间判定，而 `StaffAuthFilter` 的注释正宣称「两处共用」——往清单里加第三个命名空间时，
  运行时会拒绝、自检查不到，文档说的「双保险」当场失效；
- 匿名白名单（`JwtProperties.skipPaths`）按 `startsWith` 匹配，比命名空间判定更宽。缝里的路由
  （如假想的 `/administrators`）既不会被买家认证、也不在受保护命名空间内 = **匿名且无判权**。
  由 `匿名白名单与命名空间守卫在真实路由上不分歧` 逐条核对真实路由（`@RequestMapping` + 方法级映射拼接），
  分歧非零即红。

## 测试资产与离线可跑性

| 门禁                                                      | 依赖                    | 离线（无库、不起 Spring）能跑 |
| --------------------------------------------------------- | ----------------------- | ----------------------------- |
| `PermissionVocabularyTest`（词汇表 + 静态版启动自检）     | 无                      | ✅                            |
| `AdminEndpointGuardTest`（启动自检，读真实 handler 映射） | Spring 上下文           | ❌ 需 `pnpm db:up`            |
| `shop/AdminPermissionGuardTest`（判权矩阵 HTTP 契约）     | Spring 上下文 + MockMvc | ❌ 同上                       |
| `shop/SellerMemberPermissionIT`（收权即时生效）           | PG + Redis              | ❌ 同上                       |

静态版与 Spring 版核对的是同一条不变量（受保护命名空间的每条路由都声明了权限码），差别只在路由清单的来源：
前者从源码解析、后者从 Spring 的注册表取。没有库时仍有那道闸在跑，是本条存在的全部理由。

## 已知留白与历史

- `AdminCouponController` 挂的是 `CMS_MANAGE`——admin 域没有券运营专用码，独立授权点等增补 `COUPON_OPS` 后替换
  （见 [CPN-58](../business-rules/coupon.md)、`TODO.md`）。这一格借权在 `消费端点` 列里看得见，不再只活在注释里；
- `MEMBER_MANAGE` / `SHOP_MANAGE` 是文档占位：成员管理端点实际由 `ShopService.requireOwner` 把关（仅店主，
  否则 403），「店铺设置 / 注销」端点当前不存在。OWNER 固有能力不入可授予集合；
- 迁移脚本 V23 / V24 的头注释指向 `docs/permission-implementation.md` 并写着 `admin/service/StaffRole`，
  两者都是搬家前的地址（现为本文档与 `account/service/StaffRole`）。V24 那句「可授予白名单
  `{PRODUCT_MANAGE, ORDER_FULFILL}`」也已落后于 `SellerGrants`（现为五码）。**迁移脚本不改**——
  那是事实发生过的地方，改了 Flyway 校验和对不上；本表与门禁读的是今天的名字；
- P2 未做：员工管理 CRUD 剩余半边——创建员工 / 分配岗位（`STAFF_MANAGE` 消费端「查询 + 禁用」已随账号治理落地，
  自指禁令与末位保护随创建/调权一起做）。admin 前端已为账号治理消费 `me.permissions`：只有持
  `STAFF_MANAGE` 时才展示用户/员工管理入口；前端码值统一从 `packages/common/permission-codes.ts` 的
  `PermissionCodes.STAFF_MANAGE` 取，app 不再自写字符串。

# 权限码表

> 前后端共同语言。真相源两处：本文档 + `apps/server/src/main/java/com/shop/platform/common/Permissions.java` 常量（两侧同步改）。TS 侧**没有**权限码常量，也别去造：当前三端零消费点，admin 前端 nav 消费 me 出参 permission 字段（文末 P2）落地时再评估是否同步。改码表 = 改这两处发版。

| 域     | 码                              | 含义                           | 授予方式                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| seller | `PRODUCT_MANAGE`                | 商品增删改、规格 SKU、上下架   | 可授予子账号                                                                                                                                                                                                                                                                                |
| seller | `ORDER_FULFILL`                 | 卖家订单查看 + 发货            | 可授予子账号                                                                                                                                                                                                                                                                                |
| seller | `ADDRESS_MANAGE`                | 店铺发货/退货/揽收/账单地址    | 可授予子账号                                                                                                                                                                                                                                                                                |
| seller | `SHIPPING_MANAGE`               | 运费模板（按地区与件数计费）   | 可授予子账号                                                                                                                                                                                                                                                                                |
| seller | `COUPON_MANAGE`                 | 店铺优惠券（建券、停券、名额） | 可授予子账号                                                                                                                                                                                                                                                                                |
| seller | `MEMBER_MANAGE` / `SHOP_MANAGE` | 成员管理 / 店铺设置注销        | **预留未消费**：两码无 `Permissions.java` 常量、无任何 `@RequirePermission` 挂点。成员管理端点（邀请/调权/移除，`ShopController`）实际由 `ShopService.requireOwner` 把关（仅店主，否则 403），不走权限码；「店铺设置/注销」端点当前不存在。OWNER 固有能力，不入可授予集合，码名仅作文档占位 |
| admin  | `SHOP_REVIEW`                   | 入驻审核（通过与拒绝）         | 岗位 REVIEWER                                                                                                                                                                                                                                                                               |
| admin  | `CMS_MANAGE`                    | banner / 导航 / 推荐位         | 岗位 OPS                                                                                                                                                                                                                                                                                    |
| admin  | `CATEGORY_MANAGE`               | 平台类目                       | 岗位 OPS                                                                                                                                                                                                                                                                                    |
| admin  | `LOGISTICS_MANAGE`              | 物流轨迹维护（补录节点、纠错） | 岗位 OPS                                                                                                                                                                                                                                                                                    |
| admin  | `STAFF_MANAGE`                  | 创建员工、分配岗位、禁用       | 已消费（部分）：封号端点 `account/controller/AdminAccountController`（`PATCH /admin/users/{id}/status` + `PATCH /admin/staff/{id}/status`）类级 `@RequirePermission(STAFF_MANAGE)` 挂点，实际授予仍仅 SUPER_ADMIN 通配；「创建员工/分配岗位」CRUD 仍 P2（见文末）                           |

平台岗位预设（`account.staff.role`）：`SUPER_ADMIN`（通配）/ `REVIEWER` / `OPS`。

- 改「岗位 → 权限」映射 = 改 `account/service/StaffRole` 枚举发版；
- 卖家可授予白名单 = `shop/service/SellerGrants`（防自我繁殖：OWNER 固有码不入集合）；
- 全部为 MANAGE 型合并码（读随写权）；拆分触发器 = 第一个「能看不能改」岗位出现。

测试资产：`AdminEndpointGuardTest`（启动自检，缺注解启动失败）、`shop/AdminPermissionGuardTest`（判权矩阵）、`shop/SellerMemberPermissionIT`（收权即时生效）。
P2 未做：员工管理 CRUD 剩余半边——创建员工/分配岗位（`STAFF_MANAGE` 消费端「禁用」半边已随封号端点落地，自指禁令与末位保护随创建/调权一起做）、admin 前端 nav 消费 me 出参的 permission 字段。

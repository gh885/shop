# 权限码表

> 前后端共同语言。真相源两处：本文档 + `apps/server/src/main/java/com/shop/platform/common/Permissions.java` 常量（两侧同步改）。TS 侧**没有**权限码常量，也别去造：当前三端零消费点，admin 前端 nav 消费 me 出参 permission 字段（文末 P2）落地时再评估是否同步。改码表 = 改这两处发版。

| 域     | 码                              | 含义                           | 授予方式                                                                |
| ------ | ------------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| seller | `PRODUCT_MANAGE`                | 商品增删改、规格 SKU、上下架   | 可授予子账号                                                            |
| seller | `ORDER_FULFILL`                 | 卖家订单查看 + 发货            | 可授予子账号                                                            |
| seller | `ADDRESS_MANAGE`                | 店铺发货/退货/揽收/账单地址    | 可授予子账号                                                            |
| seller | `SHIPPING_MANAGE`               | 运费模板（按地区与件数计费）   | 可授予子账号                                                            |
| seller | `COUPON_MANAGE`                 | 店铺优惠券（建券、停券、名额） | 可授予子账号                                                            |
| seller | `MEMBER_MANAGE` / `SHOP_MANAGE` | 成员管理 / 店铺设置注销        | OWNER 固有，不入可授予集合（故不建 `Permissions` 常量，判权走成员角色） |
| admin  | `SHOP_REVIEW`                   | 入驻审核（通过与拒绝）         | 岗位 REVIEWER                                                           |
| admin  | `CMS_MANAGE`                    | banner / 导航 / 推荐位         | 岗位 OPS                                                                |
| admin  | `CATEGORY_MANAGE`               | 平台类目                       | 岗位 OPS                                                                |
| admin  | `LOGISTICS_MANAGE`              | 物流轨迹维护（补录节点、纠错） | 岗位 OPS                                                                |
| admin  | `STAFF_MANAGE`                  | 创建员工、分配岗位、禁用       | 仅 SUPER_ADMIN（消费端 P2）                                             |

平台岗位预设（`account.staff.role`）：`SUPER_ADMIN`（通配）/ `REVIEWER` / `OPS`。

- 改「岗位 → 权限」映射 = 改 `account/service/StaffRole` 枚举发版；
- 卖家可授予白名单 = `shop/service/SellerGrants`（防自我繁殖：OWNER 固有码不入集合）；
- 全部为 MANAGE 型合并码（读随写权）；拆分触发器 = 第一个「能看不能改」岗位出现。

测试资产：`AdminEndpointGuardTest`（启动自检，缺注解启动失败）、`shop/AdminPermissionGuardTest`（判权矩阵）、`shop/SellerMemberPermissionIT`（收权即时生效）。
P2 未做：员工管理 CRUD（STAFF_MANAGE 消费端，含自指禁令与末位保护）、admin 前端 nav 消费 me 出参的 permission 字段。

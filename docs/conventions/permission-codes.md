# 权限码表

> 前后端共同语言。真相源：本文档 + `apps/server/src/main/java/com/shop/platform/common/Permissions.java` 常量（两侧同步改）；TS 侧常量在 `packages/api`。改码表 = 改这三处发版。

| 域     | 码                              | 含义                         | 授予方式                    |
| ------ | ------------------------------- | ---------------------------- | --------------------------- |
| seller | `PRODUCT_MANAGE`                | 商品增删改、规格 SKU、上下架 | 可授予子账号                |
| seller | `ORDER_FULFILL`                 | 卖家订单查看 + 发货          | 可授予子账号                |
| seller | `MEMBER_MANAGE` / `SHOP_MANAGE` | 成员管理 / 店铺设置注销      | OWNER 固有，不入可授予集合  |
| admin  | `SHOP_REVIEW`                   | 入驻审核（通过与拒绝）       | 岗位 REVIEWER               |
| admin  | `CMS_MANAGE`                    | banner / 导航 / 推荐位       | 岗位 OPS                    |
| admin  | `CATEGORY_MANAGE`               | 平台类目                     | 岗位 OPS                    |
| admin  | `STAFF_MANAGE`                  | 创建员工、分配岗位、禁用     | 仅 SUPER_ADMIN（消费端 P2） |

平台岗位预设（`admin.staff.role`）：`SUPER_ADMIN`（通配）/ `REVIEWER` / `OPS`。

- 改「岗位 → 权限」映射 = 改 `admin/service/StaffRole` 枚举发版；
- 卖家可授予白名单 = `shop/service/SellerGrants`（防自我繁殖：OWNER 固有码不入集合）；
- 全部为 MANAGE 型合并码（读随写权）；拆分触发器 = 第一个「能看不能改」岗位出现。

实现进度与测试资产见 [apps/server/docs/permission-implementation.md](../../apps/server/docs/permission-implementation.md)（快照）。

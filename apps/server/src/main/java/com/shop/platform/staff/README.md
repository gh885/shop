# staff — 平台员工身份

> 平台能力 · schema `staff` · 最小可用

```yaml
module: staff
layer: 平台能力
schema: staff
status: in-progress
depends_on: []
emits: []
consumes: []
```

## 职责

平台员工账号、岗位、岗位到权限点的映射。

## 模块契约

| 方向 | 对象           | 内容                                                                           |
| ---- | -------------- | ------------------------------------------------------------------------------ |
| 输入 | —              | 不依赖任何业务模块，也不消费事件                                               |
| 输出 | `infra` 的 SPI | `StaffOperatorResolver`：把令牌里的员工 id 解析成 `CurrentOperator` + 岗位权限 |

**权限点清单不在这个模块里**：枚举在 `infra.security.Permission`，字典表在 `common.permission`，
两边相等由 `Authorizer` 启动时校验。staff 只负责"谁在什么岗位"。

**和 seller 是两套身份**：这里是平台自己人，商家子账号在 `seller.operator`，令牌靠 `typ` 声明分流。

## 拥有什么

`account` `role_permission`

## 为什么是第三套身份，不并进 seller

`seller.operator` 那一行有 `merchant_id`，整个权限模型都建立在"属于某个商家"上。平台运营不属于任何商家，
硬塞进去只有两条路：让 `merchant_id` 可空（然后所有判断都要防 null），或给平台运营造一个假商家
（然后它出现在商家列表里）。

三套身份**共用一把签名密钥**，靠 JWT 的 `typ` 声明分流——见
[access-control.md](../../../../../../../../../docs/domain/access-control.md) §1.1。

## 三个岗位

| 岗位          | 权限点                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `REVIEWER`    | `SHOP_REVIEW` `SHOP_GOVERNANCE` `AUDIT_VIEW`                                                             |
| `OPS`         | `CATEGORY_MANAGE` `CMS_MANAGE` `LOGISTICS_MANAGE` `COUPON_OPS` `AUDIT_VIEW` `RUM_VIEW` `SHOP_GOVERNANCE` |
| `SUPER_ADMIN` | 全部                                                                                                     |

岗位是给人看的，权限点是给代码判的。分配住 `staff.role_permission`，权限点清单住 `common.permission`——
后者是三端共用的总清单，`Authorizer` 启动时拿它和 `Permission` 枚举双向比对，少一个多一个都起不来。

## 边界

**不做平台员工的注册**。账号由超管创建（`STAFF_MANAGE`），本地靠 `LocalStaffSeed` 造一个超管。

**不做细粒度数据范围**。平台运营看全平台，没有"这个人只能管这几个店"的概念。真要加，那是另一个维度，
不能塞进岗位里。

## 闭环断点

登录 + 身份解析 + 权限点已落。`/api/admin/categories/*` 已经用上了 `CATEGORY_MANAGE`。

未做：员工管理接口（创建、改岗位、禁用）、登录审计、密码重置、`STAFF_MANAGE` 的任何挂点。

## 层与依赖

平台能力层，不依赖任何业务模块。业务模块通过 `Permission` 枚举和 `Authorizer` 使用它，
不需要 `depends_on: staff`——权限判断是横切的，走的是 `infra`。

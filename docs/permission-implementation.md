# 权限系统实现对照

> 基于：《权限细节清单》（D:/Code/docs/permission-details.md v1.0）。项目内权限契约的唯一真相源 = 本文档。
> 范围：**P0 平台侧 RBAC 与 P1 商家侧子账号权限均已落地**；P2 员工管理待做。引用时注明本表对应的清单版本。

## 权限码表（前后端共同语言，TS 侧常量见 packages/api）

| 域     | 码                              | 含义                         | 授予方式                    |
| ------ | ------------------------------- | ---------------------------- | --------------------------- |
| seller | `PRODUCT_MANAGE`                | 商品增删改、规格 SKU、上下架 | 可授予子账号                |
| seller | `ORDER_FULFILL`                 | 卖家订单查看 + 发货          | 可授予子账号                |
| seller | `MEMBER_MANAGE` / `SHOP_MANAGE` | 成员管理 / 店铺设置注销      | OWNER 固有，不入可授予集合  |
| admin  | `SHOP_REVIEW`                   | 入驻审核（通过与拒绝）       | 岗位 REVIEWER               |
| admin  | `CMS_MANAGE`                    | banner / 导航 / 推荐位       | 岗位 OPS                    |
| admin  | `CATEGORY_MANAGE`               | 平台类目                     | 岗位 OPS                    |
| admin  | `STAFF_MANAGE`                  | 创建员工、分配岗位、禁用     | 仅 SUPER_ADMIN（消费端 P2） |

平台岗位预设（`admin.staff.role`）：`SUPER_ADMIN`（通配）/ `REVIEWER` / `OPS`。改映射 = 改 `admin/service/StaffRole` 枚举发版；可授予白名单 = `shop/service/SellerGrants`。

## 实现对照

> P1 补充：V24 `shop.shop_members.permissions JSONB`；ShopMembershipFilter 顺带装载成员上下文（判权零额外查询）；
> 可授予白名单 `shop/service/SellerGrants`；改权接口 `PUT /shops/{shopId}/members/{memberId}/permissions`（OWNER-only，全量替换）；
> 集成验证 `shop/SellerMemberPermissionIT`（含收权即时生效 TIME-01 用例）。

| ID        | 优先级 | 状态      | 说明                                                                                                                                                            |
| --------- | ------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SUBJ-02   | P0     | ✅ 已实现 | kind=staff / kind=user 双 token 域隔离（JwtProvider + 双过滤链，先于本改造存在），AdminPermissionGuardTest 补了 C 端令牌打 admin 接口 401 回归                  |
| ROLE-01   | P0     | ✅ 已实现 | 权限挂岗位不挂人：`admin.staff.role` 列（V23）→ `StaffRole` 枚举映射，无直接授权通道                                                                            |
| ROLE-02   | P0     | ✅ 已实现 | role 无 DEFAULT（插入漏写报错）；未知 role 字符串 `parseOrNull → null → 空集`                                                                                   |
| ROLE-05   | P2     | ⏳ 延后   | 静态映射收口在 `admin/service/StaffRole`；搬表触发条件 = 改映射发版成为真实痛点                                                                                 |
| RES-01    | P0     | ✅ 已实现 | 判权签名 `RequirePermission(String[] codes)`，condition 位在 P1 卖家域扩展时保留（X-Shop-Id 即条件上下文）                                                      |
| RES-02    | P0     | ✅ 已实现 | `common/Permissions.java` 常量 + notes §3.3 码表为唯一真相源；TS 侧暂只消费错误码                                                                               |
| GRAN-02   | P0     | ✅ 已实现 | 全部 MANAGE 型合并码（读随写权）；拆分触发器 = 第一个「能看不能改」岗位出现                                                                                     |
| ENF-02/03 | P0     | ✅ 已实现 | `infra/security/authz/PermissionInterceptor`：/admin/** 缺注解运行时默认拒绝（/admin/auth/** 自服务豁免）                                                       |
| ENF-04    | P0     | ✅ 已实现 | 分层：拦截器判权（403 PERMISSION_DENIED）；业务不变式留 service（如审核状态机校验）                                                                             |
| ENF-05    | P0     | ✅ 已实现 | 启动自检 `AdminEndpointGuardTest`：扫全部 handler，缺注解启动失败；test-classes 探针豁免                                                                        |
| ENF-06    | P0     | ✅ 已实现 | 通配 `*` 只在 `PermissionResolver` 解析层流转，注解全写具体码                                                                                                   |
| TIME-01   | P0     | ✅ 已实现 | 每请求实时查库（`StaffService.effectivePermissions`），禁用/改岗下一请求即生效；AdminPermissionGuardTest.禁用员工_合法token_下一请求即403 钉死                  |
| LIFE-01   | P0     | ✅ 已实现 | 收权 = `status != ACTIVE → 空集`，无需吊销 token                                                                                                                |
| SOD-01/03 | P0     | ⏳ 延后   | 自指禁令/末位保护随 STAFF_MANAGE 消费端（员工管理 CRUD，P2）落地——当前无变更角色的接口，不存在违反路径                                                          |
| RISK-01   | P0     | ✅ 已实现 | L3 审计：`shop_review.decided` 结构化事件（review_id/shop_id/decision/staff_id，business-event-logging 约定）；分级清单在 notes §3.5                            |
| ARCH-01   | P0     | ✅ 已实现 | 进程内拦截器 + ThreadLocal（StaffContext），零新依赖                                                                                                            |
| ARCH-02   | P0     | ✅ 已实现 | fail-close：resolver 不认领 → 空集拒绝；未知岗位 → 空集                                                                                                         |
| ARCH-03   | P0     | ✅ 已实现 | admin 每请求一次 PK 查询；seller 域零增量（复用 ShopMembershipFilter 的成员查询顺带装载角色/权限到 ShopMemberContext）                                          |
| ERR-01/02 | P0     | ✅ 已实现 | 403 + `PERMISSION_DENIED`（docs/error-codes.md 与 packages/api 同步）；与业务性 403 区分                                                                        |
| GOV-04    | P1     | ⏳ 延后   | 审计先行原则已立（RISK-01 先于权限功能铺事件）；审计落表按 §3.6 触发条件观察                                                                                    |
| SUBJ-03   | P1     | ✅ 已实现 | SellerGrants 白名单（{PRODUCT_MANAGE, ORDER_FULFILL}）；MEMBER_MANAGE/SHOP_MANAGE 不入集合防自我繁殖；改权接口拒绝目标为 OWNER；邀请默认空集=最小权限（GOV-01） |

## 测试资产

- `AdminEndpointGuardTest` —— 启动自检（快环）
- `admin/AdminPermissionGuardTest` —— 判权矩阵：OPS 无权 403 / SHOP_REVIEW 放行 / 禁用即时失权 / C 端令牌 401
- `WebControllerTestSupport` 默认桩：契约测试假定持通配的在岗员工，权限用例自行覆盖

## 待办（按分期）

- **P1**：V24 shop_members.permissions、ShopMembershipFilter 顺带装载、SellerGrant 白名单、两个 seller 控制器标注、邀请接口勾选
- **P2**：员工管理 CRUD（STAFF_MANAGE 消费端，含 SOD-01 自指禁令、SOD-03 末位保护）、me 出参进 admin 前端 nav.ts 的 permission 字段消费

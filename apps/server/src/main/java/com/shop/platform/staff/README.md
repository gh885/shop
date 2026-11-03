# staff — 平台员工身份

> 平台能力 · schema `staff` · 登录与管理接口已落

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

**权限点清单不在这个模块里**：枚举在 `infra.security.Permission`，由 `contracts/permissions.yaml` 生成；
岗位到权限的映射在 yaml 的 `staff_roles`，由代码推导（`Permission.staffRoleCodes`），不查库。
staff 只负责"谁在什么岗位"。

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

| 岗位          | 权限码                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `REVIEWER`    | `shop:review` `shop:suspend` `audit_log:read`                                                                                     |
| `OPS`         | `category:configure` `content_article:write` `package:track` `coupon:configure` `audit_log:read` `rum_report:read` `shop:suspend` |
| `SUPER_ADMIN` | 全部（从清单推导，不落库）                                                                                                        |

岗位是给人看的，权限点是给代码判的。岗位 → 权限码的映射住 `contracts/permissions.yaml` 的 `staff_roles`——
代码推导而不是种子行：漏同步是静默失权，删表是全体失权。

## 边界

**员工没有自助注册**。账号由超管创建（`POST /api/staff`，`STAFF_MANAGE`），本地靠 `LocalStaffSeed` 造一个超管。

**不做细粒度数据范围**。平台运营看全平台，没有"这个人只能管这几个店"的概念。真要加，那是另一个维度，
不能塞进岗位里。

## 会话

与买家同一套刷新链路（`RefreshTokenStore`，kind 各自隔离）：access 15 分钟 + refresh 7 天 httpOnly cookie，
一次一换 + 重放裁决。**禁用即双保险**：判权每请求实时查库（下一请求生效），同时吊销该员工全部 refresh。

## 管理动作与两道禁令

`POST /api/staff`（创建，岗位是入参）、`PUT /api/staff/{id}/role`（调岗）、`PATCH /api/staff/{id}/status`
（禁用/启用），全部要 `STAFF_MANAGE`，全部写审计账本（`account.staff.*` 动作）。

- **不能改自己的岗位**：调低等于当场自削权限且事后无痕
- **末位超管保护**：禁用/降级最后一个在岗超管是 409。判的是聚合，先取 `pg_advisory_xact_lock`
  串行闸再数人——行级条件更新挡不住「两个最后超管在同一刻被分别禁用」

## 闭环断点

登录 + 身份解析 + 权限点 + 员工管理已落；`/api/admin/categories/*` 用 `CATEGORY_MANAGE`。

已补：员工列表（`GET /api/admin/staff`，游标分页）、`GET /api/staff/me`（身份 + 岗位 + 权限码 + 语言偏好）、
`PUT /api/staff/locale`。

未做：登录审计（只有结构化日志，没有进 audit 账本——登录不是治理动作，先留日志）、
员工自改密码（重建密码目前只能靠超管重置库或重新 seed）。

## 层与依赖

平台能力层，不依赖任何业务模块。业务模块通过 `Permission` 枚举和 `Authorizer` 使用它，
不需要 `depends_on: staff`——权限判断是横切的，走的是 `infra`。

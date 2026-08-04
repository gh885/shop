# 商家入驻与平台审核 — 本期范围

> 本期目标：打通「商家入驻 → 平台审核 → 卖家经营商品」的最小闭环，顺带收口商品管理接口的店铺归属校验（堵掉 `shopId` 前端传入的越权漏洞）。
>
> 涉及后端新模块：`shop`（卖家侧）、`admin`（平台侧）。`apps/seller` / `apps/admin` 前端不在本期。

## 本期要做

### 1. shop 模块（卖家侧：店铺 + 成员）

- **开店**：登录用户（统一账号 `auth.users`）创建店铺 → 状态 `PENDING_REVIEW`，店主自动成为 `OWNER` 成员
- **店铺成员**：多店铺模型，一个用户可属多个店铺
    - 店主邀请（填手机号）→ 落 `PENDING` → 对方登录后确认 → `ACTIVE`
    - 店主可移除成员
    - 角色两档：`OWNER` / `MEMBER`，本期权限相同（不细分岗位）
- **店铺状态机**：`PENDING_REVIEW` →（平台审核）→ `ACTIVE` / `REJECTED`；`DISABLED` 仅建模，本期不做封禁操作

### 2. admin 模块（平台侧：员工 + 审核）

- **平台员工账号**：独立账号体系（`admin.staff`），工号 + 密码登录，登录入口与 token 范围与 C 端隔离；seed 一个初始管理员（`admin` / `admin123`，仅开发环境）
- **入驻审核**：待审队列 → 通过 / 拒绝，审核留痕（`admin.shop_reviews`：谁批的、批没批、理由、时间）

### 3. 跨模块协作（事件驱动）

- shop 开店 → 发 `ShopCreatedEvent` → admin 入队一条 PENDING 审核
- admin 审批 → 发 `ShopReviewDecidedEvent` → shop 把店铺状态改为 `ACTIVE` / `REJECTED`
- 两模块各写各的 schema，不直接碰对方的表（遵循 Modulith 模块边界）

### 4. 鉴权收口（product 模块）

- `ProductAdminController` 的 `shopId` 从登录上下文取（`X-Shop-Id` 头 + 成员校验），不再由前端传入
- 商品操作（改 / 发 / 上下架）校验商品确实属于当前店铺，非本店成员返回 403

## 本期不做

- **完整入驻资质审核**：营业执照 / 保证金 / 人工资质校验 —— 本期只有「开店 → 审核 → 通过 / 拒绝」两步
- **细粒度 RBAC**：客服 / 运营 / 财务等岗位权限 —— 本期成员全权
- **邀请短信通知**：被邀请人登录后在「待确认邀请」里看到，不发短信
- **员工自助注册 / 员工管理界面**：本期只 seed 一个管理员，更多员工由后续管理接口创建
- **店铺封禁（`DISABLED`）操作入口**：状态已建模，操作留待平台运营模块
- **店铺装修 / 店铺主页**
- **订单、售后、营销、数据、资金** 模块
- **买家端商品浏览**（apps/web 商品列表 / 详情页）
- **类目管理的鉴权收口**：`CategoryAdminController` 已留 TODO（admin 模块落地后接入），本期不动，现状任何登录用户可管理类目
- **apps/seller / apps/admin 前端界面**：本期只落后端与表结构

## 表结构（V8 / V9 / V10）

| 迁移                        | 内容                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `V8__shop_shops.sql`        | `shop.shops`（店铺）+ `shop.shop_members`（成员，`uk_shop_members_shop_user` 唯一约束） |
| `V9__admin_staff.sql`       | `admin.staff`（员工，`uk_staff_employee_no`）+ `admin.shop_reviews`（审核留痕）         |
| `V10__seed_admin_staff.sql` | 初始平台管理员 seed                                                                     |

设计要点：`auth.users` 不加 `role` 列，卖家身份由 `shop_members` 推导（统一账号可同时是买家 + 多店铺成员）；店铺状态存 `shop.shops.status`，审核状态存 `admin.shop_reviews.status`，两模块各记各的事实。

## 验收口径

- V8/V9/V10 迁移可执行，`shop` / `admin` 两个 schema 就位
- 后端链路：开店 → 审核 → 成员邀请 / 同意 → 用店铺上下文操作商品，接口可跑通
- 越权用例：非本店成员传 `X-Shop-Id` 或改他人商品 → 403

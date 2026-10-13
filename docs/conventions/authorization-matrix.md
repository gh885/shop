# 授权矩阵（角色 × 资源 × 操作 × 数据范围 × 字段 × 状态 × 审批流）

> 授权全景的单一矩阵：谁（角色）能对什么（资源）做什么（操作），在什么范围（数据范围）内，
> 看得到哪些格（字段），只在哪些态（状态）下成立，以及谁批谁（审批流）。
>
> §三/§四/§五/§六 四张表全部按「源码扫描 ⇄ 表格逐格核对」设计：控制器清单与基路径、状态枚举与常量、
> 审计动作码、揭示事件名都是从代码里扫出来比对，漏一行即红——写错会红，不会长期撒谎（门禁
> `AuthorizationMatrixVocabularyTest`，**尚未实现**）。§一/§二/§七/§八 是口径与登记，不参与机检。
>
> 判权码不在此复制：码的真相源、岗位→码映射与子账号可授予白名单见 [permission-codes.md](permission-codes.md)；
> 错误码与 401/403/404 的码位口径见 [error-codes.md](../error-codes.md)。

## 一、判读口径

三条出口，各管各的语义，互相不许串门：

| 出口         | 语义                                                                                                | 唯一实现                                        | 机械约束                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **404**      | 「这条不归你」与「没有这条」同一句话（数据范围）                                                    | `common.Validate.requireOwned/presentOwned`     | `OwnershipDoorTest`（ArchUnit）：归属判定不许在门外手搓状态码，无例外清单                        |
| **403**      | 上下文与角色：缺 `X-Shop-Id`、非本店成员、权限码不足、账号被禁用、webhook 验签失败                  | `BusinessException.forbidden`（唯一出口）       | 同上：403 只许出现在 allowlist 的上下文/角色类里                                                 |
| **默认拒绝** | 受保护命名空间（`/admin` `/seller`）里 handler 缺 `@RequirePermission` 一律 403 `PERMISSION_DENIED` | `PermissionInterceptor` 运行时 + 启动自检双保险 | 唯一豁免 `/admin/auth/**` 自服务（只吃认证不吃授权）；匿名白名单与命名空间判定在真实路由上零分歧 |

其余口径：

- `@RequirePermission` 方法级覆盖类级，value 为 ANY 语义（持有任一码即通过）；通配 `*` 恒通过，只出现在解析层，注解上永远写具体码。
- 判权每请求实时查库、不做缓存：禁用/收权/岗位调整**下一请求即生效**，fail-close（无人认领 = 空集）。
- **关系闸门**：`/shops` 不在受保护命名空间内，按「调用者与这条资源的关系」裁决（店主 / 本店成员），登记见 §七。
- 路径规范化先于一切判定：百分号编码、`;`、`//`、`.`/`..` 路径一律 400（`RequestPaths`），杜绝前缀判定被编码变体绕过。
- 前端侧栏/按钮按码裁剪**不是安全边界**，只回答「不该看见的人不必看见」；直敲 URL 由后端 403/404 挡（ACC-58 口径）。

## 二、主体与角色

| 主体           | 凭证                                    | 角色                                  | 有效权限来源                                                                              | 备注                                                                                                                                                                             |
| -------------- | --------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 买家           | 用户 JWT（`kind=user`）                 | 无角色字段                            | 登录 + 归属闸门（本人资源）                                                               | 账号 = 手机号，`account.users`（ACC-15）                                                                                                                                         |
| 平台员工       | 员工 JWT（`kind=staff`）                | `SUPER_ADMIN` / `REVIEWER` / `OPS`    | `StaffRole.permissions()`（唯一收口）                                                     | `SUPER_ADMIN`=通配；`REVIEWER`=`SHOP_REVIEW`+`AUDIT_VIEW`+`SHOP_GOVERNANCE`；`OPS`=`CMS_MANAGE`+`CATEGORY_MANAGE`+`LOGISTICS_MANAGE`+`COUPON_OPS`+`AUDIT_VIEW`+`SHOP_GOVERNANCE` |
| 卖家（店主）   | 用户 JWT + `X-Shop-Id`                  | `OWNER`（`shop_members` 的 OWNER 行） | 通配全通过                                                                                | 「是卖家」= `shop_members` 有 ACTIVE 的 OWNER 行；店铺上下文只认请求头，永不从请求体取                                                                                           |
| 卖家（子账号） | 子账号 JWT（`kind=subaccount`），第三套 | 无角色字段，等价 `MEMBER`             | 凭证行 `account.shop_subaccounts.permissions`（可授予白名单 5 码，`common.SellerGrants`） | 凭证**自带店铺**：不吃 `X-Shop-Id`，带了别家店的一律 403；令牌只在 `/seller/**` 与 `/auth/subaccount/**` 生效，买家链路拒（ACC-25）                                              |
| 匿名           | 无                                      | —                                     | 匿名白名单（`JwtProperties.skipPaths`，按前缀匹配）                                       | 白名单与命名空间守卫的分歧由门禁在真实路由上逐条核对                                                                                                                             |
| 承运商         | 无                                      | —                                     | HMAC 验签（fail-close）                                                                   | `/logistics/webhooks/**`，未启用/签名失败一律 403                                                                                                                                |

## 三、端点矩阵

列语法：**动作闸门** = `Permissions.X` 常量（类级 `@RequirePermission`），或非码闸门 `匿名` / `仅认证` / `验签` / `关系`；
**数据范围闸门** = 结果集与目标行的收口方式（mapper 级事实，见各模块）。

### 3.1 平台端 `/admin`（员工 JWT，受保护命名空间）

| 控制器                         | 基路径                    | 动作闸门               | 数据范围闸门                    | 备注                                                     |
| ------------------------------ | ------------------------- | ---------------------- | ------------------------------- | -------------------------------------------------------- |
| `StaffAuthController`          | `/admin/auth`             | `仅认证`（自服务豁免） | 仅本人会话                      | 登录/刷新/me/登出/语言；只吃认证不吃授权                 |
| `AdminAccountController`       | `/admin`                  | `STAFF_MANAGE`         | 全平台（账号治理）              | 仅超管通配可达；自指禁令 + 末位超管保护（advisory lock） |
| `AdminAuditController`         | `/admin/audits`           | `AUDIT_VIEW`           | 全平台账本（只读）              | 账本 append-only，无更新/删除                            |
| `AdminCouponController`        | `/admin/coupons`          | `COUPON_OPS`           | 全平台（可按 userId/shopId 筛） | 仅 `UNUSED`→`VOID`，其余态 409                           |
| `CmsContentAdminController`    | `/admin/cms`              | `CMS_MANAGE`           | 全平台内容                      | 无状态机，状态直设                                       |
| `CategoryAdminController`      | `/admin/categories`       | `CATEGORY_MANAGE`      | 全平台类目                      | 停用门槛 = 整子树无商品                                  |
| `CategoryAttrAdminController`  | `/admin`                  | `CATEGORY_MANAGE`      | 全平台属性模板                  | 仅叶子类目可挂                                           |
| `AdminLogisticsController`     | `/admin/logistics`        | `LOGISTICS_MANAGE`     | 全平台包裹（裸 id 补录）        | 补录落审计账本                                           |
| `AdminShipmentIssueController` | `/admin/logistics/issues` | `LOGISTICS_MANAGE`     | 全平台异常单                    | `OPEN`→`RESOLVED` 条件更新，0 行 409                     |
| `AdminShopController`          | `/admin/shops`            | `SHOP_GOVERNANCE`      | 全平台店铺                      | 封店级联下架；解封不自动重上架（ACC-60）                 |
| `ReviewController`             | `/admin/reviews`          | `SHOP_REVIEW`          | 全平台审核队列                  | 决定与店状态同事务；店主号掩码 + 揭示端点                |

### 3.2 商家端 `/seller`（用户 JWT + `X-Shop-Id`，受保护命名空间）

| 控制器                             | 基路径                            | 动作闸门          | 数据范围闸门                                           | 备注                                               |
| ---------------------------------- | --------------------------------- | ----------------- | ------------------------------------------------------ | -------------------------------------------------- |
| `SellerOrderController`            | `/seller/orders`                  | `ORDER_FULFILL`   | 本店（列表 `eq shop_id`；详情 `requireShopOwned` 404） | 买家号掩码；明文揭示端点留痕                       |
| `SellerAfterSaleController`        | `/seller/orders/{id}/after-sales` | `ORDER_FULFILL`   | 本店（`requireSellerOpen` 404）                        | 卖家裁决：同意/拒绝/收货                           |
| `SellerAfterSaleListController`    | `/seller/after-sales`             | `ORDER_FULFILL`   | 本店（`eq shop_id` / 按订单批查）                      | 动作集批查是前端按钮唯一来源（ORD-51）             |
| `SellerLogisticsController`        | `/seller`                         | `ORDER_FULFILL`   | 本店（发货 `presentOwned(shop_id)` 404）               | 承运商目录 + 发货                                  |
| `ProductAdminController`           | `/seller/products`                | `PRODUCT_MANAGE`  | 本店（`requireShopOwned` 404）                         | 上下架/规格/图片凭证；发布即上架、无审核（PRD-40） |
| `SellerCouponController`           | `/seller/coupons`                 | `COUPON_MANAGE`   | 本店（`requireShopOwned` 404）                         | 建券/停券                                          |
| `SellerAddressController`          | `/seller/addresses`               | `ADDRESS_MANAGE`  | 本店（`requireOwnedAddress` 404）                      | 默认发货/默认退货各至多一                          |
| `SellerShippingTemplateController` | `/seller/shipping-template`       | `SHIPPING_MANAGE` | 本店（`eq shop_id`）                                   | 按收货地区与件数计费                               |
| `SellerReviewController`           | `/seller/reviews`                 | `ORDER_FULFILL`   | 本店（`requireOwned` 404）                             | 回复一次（已回复 409）                             |

### 3.3 买家端（用户 JWT，无判权码：登录 + 归属闸门）

| 控制器                      | 基路径                     | 动作闸门            | 数据范围闸门                                        | 备注                             |
| --------------------------- | -------------------------- | ------------------- | --------------------------------------------------- | -------------------------------- |
| `AuthController`            | `/auth`                    | `仅认证`            | 本人                                                | `me` 出参手机号掩码              |
| `AccountDeletionController` | `/auth/deletion`           | `仅认证`            | 本人                                                | 注销 15 天冷静期                 |
| `AddressController`         | `/user/addresses`          | `仅认证`            | 本人（`requireOwned` 404）                          | 软删；上限 20 条                 |
| `CartController`            | `/cart`                    | `仅认证`            | 本人（`requireOwned` 404；批操作 SQL 带 user 条件） |                                  |
| `FavoriteController`        | `/favorites`               | `仅认证`            | 本人（`eq user_id`）                                |                                  |
| `CouponController`          | `/coupons`                 | `仅认证`            | 本人（`mine` `eq user_id`）+ 领取门槛               | 领取按模板配额/窗口/一人一张     |
| `OrderController`           | `/orders`                  | `仅认证`            | 本人（`requireOwned` 404）                          | 状态推进走条件更新（§四）        |
| `TrackingController`        | `/orders`                  | `仅认证`            | 本人（shipment `WHERE user_id`）                    | 轨迹查询                         |
| `AfterSaleController`       | `/orders/{id}/after-sales` | `仅认证`            | 本人（`requireBuyerOpen` 404）                      | 申请/撤销/回寄                   |
| `PaymentController`         | `/payments`                | `仅认证`            | 本人（`requireOwned` 404）                          | 双段式：发起 + 确认              |
| `MyReviewController`        | `/reviews`                 | `仅认证`            | 本人（订单归属先行 404）                            | 提交/追评（窗口 + 一次性）       |
| `ShopController`            | `/shops`                   | `关系`（见 §七）    | 本人 / 本店（关系裁决）                             | 开店/重提/我的店铺/子账号管理    |
| `SubaccountAuthController`  | `/auth/subaccount`         | `匿名` / `仅子账号` | 本人（登录/激活匿名；me、登出、改密吃子账号令牌）   | 卖家子账号的认证（ACC-10/13/25） |

### 3.4 匿名（无凭证）

| 控制器                   | 基路径            | 动作闸门 | 数据范围闸门                     | 备注                     |
| ------------------------ | ----------------- | -------- | -------------------------------- | ------------------------ |
| `ProductController`      | `/api/products`   | `匿名`   | 仅已发布（非发布 404；在售 SKU） | 显式列投影，内部字段不出 |
| `CategoryController`     | `/api/categories` | `匿名`   | 仅启用                           | 读缓存                   |
| `ShopPublicController`   | `/api/shops`      | `匿名`   | 仅 ACTIVE                        | 读缓存                   |
| `CouponPublicController` | `/api/shops`      | `匿名`   | 可领列表（ACTIVE + 时间窗）      |                          |
| `PublicReviewController` | `/api/reviews`    | `匿名`   | 公开评价                         | 买家昵称掩码             |
| `CmsPublicController`    | `/api/cms`        | `匿名`   | 启用 + 时间窗                    | 读缓存                   |
| `FeedController`         | `/api/feed`       | `匿名`   | 随机批                           |                          |
| `RumEventsController`    | `/api/rum`        | `匿名`   | 遥测接收（IP 限流、恒 204）      | 刻意不进 OpenAPI 契约    |

### 3.5 承运商回推

| 控制器                     | 基路径                | 动作闸门 | 数据范围闸门 | 备注                                     |
| -------------------------- | --------------------- | -------- | ------------ | ---------------------------------------- |
| `CarrierWebhookController` | `/logistics/webhooks` | `验签`   | 按承运商     | HMAC fail-close：未启用/验签不过一律 403 |

## 四、状态机

状态规则归实体/枚举（半充血），**执行闸门 = 条件更新**（受影响行数 = 0 即 409，正确性不依赖加锁）——
「合法转移」这一列不是文档声明，是枚举里那张转移表/条件更新里 WHERE 子句的镜像。

| 实体               | 枚举                   | 状态                                                                                                                                                           | 合法转移                                                                                                                                                        | 执行闸门                                                                                                                                                                                                                                   |
| ------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 订单履约           | `OrderStatus`          | `PENDING_PAYMENT` `PAID` `SHIPPED` `COMPLETED` `CANCELLED`                                                                                                     | `PENDING_PAYMENT`→`PAID`/`CANCELLED`；`PAID`→`SHIPPED`/`CANCELLED`；`SHIPPED`→`COMPLETED`/`SHIPPED`（自环=追加包裹）；`COMPLETED`/`CANCELLED` 终态              | `OrderMapper` 条件更新（`WHERE status IN sourcesOf(target)`）：`cancelReturningPrevious` / `markPaid` / `markShippedReturningPrevious` / `markCompleted` 等；买家/卖家动作集由 `buyerActions()`/`sellerActions()` 派生（ORD-17/18）        |
| 订单售后投影       | `AfterSaleStatus`      | `NONE` `APPLYING` `RETURNING` `REFUNDED` `REJECTED` `CLOSED`                                                                                                   | 无独立状态机：售后单每次转移经 `order::api` 写回投影                                                                                                            | 展示投影，不承载转移                                                                                                                                                                                                                       |
| 售后单             | `TicketStatus`         | `APPLYING` `RETURNING` `REFUNDED` `REJECTED` `CLOSED`                                                                                                          | 见下行 `TicketAction` 转移表                                                                                                                                    | `TicketMapper.transitionStatus/transitionRefunded/transitionReturnShipped/transitionClosingUnshipped`（`WHERE id + status = from`）                                                                                                        |
| 售后动作（转移表） | `TicketAction`         | `APPLY` `REFUND` `AGREE_RETURN` `RETURN_GOODS` `RECEIVE_RETURN` `REJECT` `REJECT_RETURN` `CLOSE` `AUTO_REFUND` `AUTO_AGREE_RETURN` `AUTO_CLOSE` `AUTO_RECEIVE` | 每行 from→target（`APPLY` 新建；`RETURN_GOODS` 自环只落物流单号；4 条 SYSTEM 超时边）；发起方 = `BUYER`/`SELLER`/`SYSTEM`                                       | 每行即条件更新的闸门依据与 409 文案；「该不该回补库存」由知道来源的动作决定，不由目标态反推（AFS-17/18）                                                                                                                                   |
| SPU 商品           | `ProductStatus`        | `WAREHOUSE` `PUBLISHED` `DRAFT`                                                                                                                                | `DRAFT`→`PUBLISHED`/`WAREHOUSE`；`PUBLISHED`→`WAREHOUSE`；`WAREHOUSE`→`PUBLISHED`                                                                               | `ProductMapper.transitionStatus` + 实体谓词 `Product.ensureSpecsEditable` 与发布门槛 `ProductService.ensurePublishable`；上架商品规格冻结（PRD-40）                                                                                        |
| SKU                | `SkuStatus`            | `DISABLED` `ON_SALE`                                                                                                                                           | 与 SPU 正交（上架 SPU 可含停用 SKU）                                                                                                                            | 写入口在 `SkuService`（规格全量替换）                                                                                                                                                                                                      |
| 类目               | `CategoryStatus`       | `DISABLED` `ENABLED`                                                                                                                                           | 禁用 = 整支剪掉、可无损恢复                                                                                                                                     | `CategoryService.updateStatus`：停用门槛 = 子树无商品                                                                                                                                                                                      |
| 类目属性           | `CategoryAttrStatus`   | `DISABLED` `ENABLED`                                                                                                                                           | 禁用后新商品不可选，存量引用自洽                                                                                                                                | 直设                                                                                                                                                                                                                                       |
| 店铺               | `ShopStatus`           | `PENDING_REVIEW` `ACTIVE` `REJECTED` `DISABLED`                                                                                                                | `PENDING_REVIEW`→`ACTIVE`/`REJECTED`；`REJECTED`→`PENDING_REVIEW`（补材料重提）；`ACTIVE`⇄`DISABLED`                                                            | `ShopMapper.resubmit/suspend/resume/applyReviewVerdict` 条件更新；转 `DISABLED` 必须同事务播 `ShopTradingSuspendedEvent`（级联下架，ACC-72）                                                                                               |
| 店铺审核单         | `ShopReviewStatus`     | `PENDING` `APPROVED` `REJECTED`                                                                                                                                | `PENDING`→`APPROVED`/`REJECTED`（终态）                                                                                                                         | `decideIfPending` 条件更新；决定与店状态同事务                                                                                                                                                                                             |
| 子账号             | `SubaccountStatus`     | `PENDING_ACTIVATION` `ACTIVE` `DISABLED`                                                                                                                       | `PENDING_ACTIVATION`→`ACTIVE`（员工验本人手机号）；`ACTIVE`⇄`DISABLED`（店主停用/启用）；启用时**没验过号**的行回 `PENDING_ACTIVATION`；移除 = 删行（无第四档） | `ShopSubaccountMapper.activate`（`WHERE status = 'PENDING_ACTIVATION'`）/ `disable`（`WHERE status = 'ACTIVE'`）/ `enable`（`WHERE status = 'DISABLED'` + 验号事实），0 行即 409；`ck_shop_subaccounts_activation` 钉「ACTIVE 必须已验号」 |
| 商家地址           | `AddressStatus`        | `ACTIVE` `DISABLED`                                                                                                                                            | 停用不删；软删归 `deleted_at`                                                                                                                                   | 快照解析只认「未删 + `ACTIVE`」（ACC-56）                                                                                                                                                                                                  |
| 买家账号           | `UserStatus`           | `ACTIVE` `DISABLED`                                                                                                                                            | `ACTIVE`⇄`DISABLED`（注销走 `DISABLED`，不物理删）                                                                                                              | `UserMapper.updateStatus` 条件更新（`status <> target AND deleted_at IS NULL`），0 行 409                                                                                                                                                  |
| 员工账号           | `StaffStatus`          | `ACTIVE` `DISABLED`                                                                                                                                            | `ACTIVE`⇄`DISABLED`                                                                                                                                             | `StaffMapper.disable/enable`；末位在岗超管保护（advisory lock + 计数，ACC-71）                                                                                                                                                             |
| 用户券             | `UserCouponStatus`     | `UNUSED` `LOCKED` `USED` `EXPIRED` `VOID`                                                                                                                      | `UNUSED`→`LOCKED`→`USED`；`LOCKED`→`UNUSED`（释放）；`UNUSED`→`EXPIRED`；`UNUSED`/`LOCKED`→`VOID`                                                               | `UserCouponMapper.lockOne/useByOrder/releaseByOrder/expireDue/voidUnused` 条件更新；`USED` 不可逆（退款另发新券，CPN-34）                                                                                                                  |
| 券模板             | `CouponTemplateStatus` | `ACTIVE` `STOPPED`                                                                                                                                             | `ACTIVE`→`STOPPED`（停止领取；已领出的券不受影响）                                                                                                              | `CouponTemplateMapper.stopIfActive`；不做软删                                                                                                                                                                                              |
| 支付流水           | `PaymentStatus`        | `PENDING` `SUCCESS` `FAILED` `REFUNDED`                                                                                                                        | `PENDING`→`SUCCESS`/`FAILED`；`SUCCESS`→`REFUNDED`（订单取消/售后触发）                                                                                         | `PaymentMapper.transition` 条件更新，0 行 409                                                                                                                                                                                              |
| 包裹               | `ShipmentStatus`       | `PENDING_PICKUP`(10) `PICKED_UP`(20) `IN_TRANSIT`(30) `DELIVERING`(40) `DELIVERED`(50) `RETURNED`(60) `EXCEPTION`(0)                                           | rank 单调前进；`EXCEPTION` 过程态可进可出（滞留/拒收后仍可继续）；`DELIVERED`/`RETURNED` 终态                                                                   | `ShipmentMapper.advanceStatus`（`WHERE status IN sourcesOf`，rank 反推）；轨迹节点是唯一写入源，状态是投影（LOG-11/12）                                                                                                                    |
| 物流异常单         | `ShipmentIssueStatus`  | `OPEN` `RESOLVED`                                                                                                                                              | `OPEN`→`RESOLVED`                                                                                                                                               | `ShipmentIssueMapper.resolve` 条件更新，0 行 409                                                                                                                                                                                           |
| CMS 内容           | `CmsStatus`            | `DISABLED` `ENABLED`                                                                                                                                           | 直设（无状态机）                                                                                                                                                | 停用后前台不展示                                                                                                                                                                                                                           |

## 五、审批与留痕

### 5.1 审批流

| 审批流         | 发起                        | 裁决                                            | 状态与规则                                                                                                                                                                                   | 审计动作（`AuditAction`）                                                                                               |
| -------------- | --------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 入驻审核       | 卖家开店 → `PENDING_REVIEW` | 平台 `SHOP_REVIEW`（REVIEWER 岗）               | 审核单 `PENDING`→`APPROVED`/`REJECTED`；店 `PENDING_REVIEW`→`ACTIVE`/`REJECTED`；驳回必填理由，可补材料重提（ACC-03/09/74）                                                                  | `shop.review.decided`                                                                                                   |
| 店铺治理       | 平台 `SHOP_GOVERNANCE`      | 同左                                            | `ACTIVE`→`DISABLED`（级联下架在架商品）；`DISABLED`→`ACTIVE`（不自动重上架）                                                                                                                 | `shop.trading_suspended` / `shop.trading_resumed`                                                                       |
| 售后裁决       | 买家申请                    | 卖家 `ORDER_FULFILL` 同意/拒绝；SYSTEM 超时兜底 | `APPLYING`→`REFUNDED`/`RETURNING`/`REJECTED`；`RETURNING`→`REFUNDED`/`REJECTED`/`CLOSED`；超时边 4 条（48h 自动同意 / 7d 自动关 / 10d 自动退）；七天无理由单在 `APPLYING` 只许同意（AFS-45） | 不进治理账本：交易纠葛走售后自己的 append-only 时间线（`ticket_events`，REV-17/GEN-69）                                 |
| 券作废         | 平台 `COUPON_OPS`           | 同左                                            | 仅 `UNUSED`→`VOID`；`LOCKED`/`USED`/`EXPIRED`/`VOID` 一律 409                                                                                                                                | `coupon.user_coupon.voided`                                                                                             |
| 员工与账号管理 | 超管 `STAFF_MANAGE`         | 同左                                            | 建号（201）/调岗/禁用/启用；不能改自己岗位；不能禁用或降级最后一个在岗超管（ACC-57/71）                                                                                                      | `account.staff.created` / `account.staff.role_changed` / `account.staff.status_changed` / `account.user.status_changed` |

### 5.2 治理动作与审计账本

治理动作必须落一行 append-only 审计账本：写入只经 `audit::api` 的 `RecordAuditCommand`，**与动作同事务**
（`Propagation.MANDATORY`，动作回滚则账本一起回滚）；账本无更新/删除出口，查询与导出在 `/admin/audits`（`AUDIT_VIEW`）。

十个动作码（`AuditAction` 枚举，唯一收口）：`account.user.status_changed`、`account.staff.status_changed`、
`account.staff.created`、`account.staff.role_changed`、`coupon.user_coupon.voided`、`shop.review.decided`、
`shop.trading_suspended`、`shop.trading_resumed`、`logistics.shipment_issue.resolved`、`logistics.tracking.written`。

边界（GEN-65/69）：账本只记**治理动作**（谁对谁做了什么，可按人/对象/时间反查）；读取类操作与买卖双方的
内容往来（评价、售后协商）不进账——后者有各自的时间线。敏感字段写入侧即掩码（手机号/工号），账本不解析、不还原。

## 六、字段与脱敏

批量出参一律掩码；明文只能逐条显式索取，且取用留痕。手机号掩码唯一出口 `PhoneNumber.mask()`（前 3 后 4，GEN-51），
买家昵称唯一出口 `Nickname.mask()`。

| 数据                 | 默认出参                                                                                                             | 明文出口                                                                                  | 留痕                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 买家手机号（卖家侧） | 列表/详情恒掩码（视角工厂 `OrderDetailView.buyerView/sellerView`：买家看自己仍是明文，同一字段两侧语义不同是刻意的） | `POST /seller/orders/{id}/receiver-phone`（本店，`requireShopOwned` 404）                 | `order.receiver_phone_revealed` 事件（号码本身不入日志），叠加 `http.request` 逐请求留痕（ORD-62） |
| 店铺子账号手机号     | 子账号列表：一律掩码                                                                                                 | `POST /shops/{shopId}/subaccounts/{subaccountId}/phone`（店主专属，越店与不存在同为 404） | `shop_subaccount.phone_revealed`（ACC-79）                                                         |
| 店主手机号（平台侧） | 审核队列恒掩码（查不到号 = `****`，契约不留「有时是明文」的缝）                                                      | `POST /admin/reviews/{id}/owner-phone`（`SHOP_REVIEW`）                                   | `shop_review.owner_phone_revealed`（ACC-79）                                                       |
| 买家昵称             | 公开评价/卖家侧恒掩码                                                                                                | 无                                                                                        | —                                                                                                  |
| 买家本人手机号       | `me` 出参掩码；订单详情买家视角明文                                                                                  | —（自己的号）                                                                             | —                                                                                                  |
| 商品公开出参         | 显式列投影：无 `status`/`updatedAt`/`skuCode` 等内部字段                                                             | —                                                                                         | 公开查询按已发布过滤（非发布 404）                                                                 |

口径：**任何批量出参都不带别人或买家的手机号明文**；前端掩码唯一出口 `@shop/common` 的 `maskPhone`/`MaskedValue`，
索取入口 `MaskedValueCell`（明文行不再给入口、请求在途按钮禁用——一次索取 = 后端一条取用记录，连点就是凭空多几条）。
揭示属**读取类动作**，不进治理账本（§5.2 边界），留痕随日志保留期滚失——这是刻意的，见 §八。

## 七、`/shops` 关系闸门登记

`/shops` 不在受保护命名空间（`RequestPaths.GUARDED_NAMESPACES` 只含 `/admin` `/seller`），也吃不到判权码：
这里的闸门是**关系**，不是角色——四种关系闸门，全部在 service 层裁决（403 属上下文/角色，404 属归属）：

- `SELF`：只按调用者自己的 id 取数/建资源，无既有资源可越权；
- `OWNER`：店主专属（`isActiveOwner`，否则 403「只有店主可以执行该操作」）；
- `ACTIVE_MEMBER`：本店任一 ACTIVE 成员即可（今天只有店主一种成员行，`findActiveMember` 装载上下文）；
- `ID_IN_SHOP`：目标行必须属于路径上的店（`Validate.requireOwned`/`present` 收口，别店的行与不存在的行同为 404）。

| 端点                                               | 闸门种类 | 服务方法             | 说明                                        |
| -------------------------------------------------- | -------- | -------------------- | ------------------------------------------- |
| `POST /shops`                                      | `SELF`   | `createShop`         | 开店落 `PENDING_REVIEW`（201）              |
| `GET /shops/mine`                                  | `SELF`   | `myShops`            | 我的店铺（ACTIVE 店主身份；子账号令牌 401） |
| `POST /shops/{shopId}/resubmit`                    | `OWNER`  | `resubmitReview`     | 被驳回的店补材料重提（非驳回态 409）        |
| `POST /shops/{shopId}/subaccounts`                 | `OWNER`  | `create`             | 建子账号落 `PENDING_ACTIVATION`（201）      |
| `GET /shops/{shopId}/subaccounts`                  | `OWNER`  | `list`               | 子账号列表（手机号恒掩码）                  |
| `PUT /shops/{shopId}/subaccounts/{id}/permissions` | `OWNER`  | `replacePermissions` | 权限全量替换，下一请求即生效                |
| `PATCH /shops/{shopId}/subaccounts/{id}/status`    | `OWNER`  | `setEnabled`         | 停用/启用（`enabled` 布尔）                 |
| `POST /shops/{shopId}/subaccounts/{id}/password`   | `OWNER`  | `resetPassword`      | 店主重置口令（子账号没有短信自助找回）      |
| `POST /shops/{shopId}/subaccounts/{id}/phone`      | `OWNER`  | `revealPhone`        | 取号码明文并留痕（`ID_IN_SHOP` 404）        |
| `DELETE /shops/{shopId}/subaccounts/{id}`          | `OWNER`  | `remove`             | 移除子账号 = 删凭证行（204）                |

> 子账号的**认证**端点不在本表：它们在 `/auth/subaccount/**`（§三 3.3），只吃认证不吃授权。

## 八、已知留白

- **`/shops` 不在运行时默认拒绝内**：运行时闸门是 service 层的关系裁决（§七），静态侧只有 §七 登记表 + 人工同步——
  文档里曾承诺的 `ShopEndpointGuardTest`（扫路由比对登记表）**至今没有实现**，所以「新增端点漏登记」不会红，
  得靠 review 对着 §七 逐行看。`AdminEndpointGuardTest` 只管受保护命名空间的 `@RequirePermission`，覆盖不到这里。
- **揭示留痕随日志保留期滚失**：读取类动作不进治理账本（GEN-65/69 的边界），取用记录活在业务事件日志里，
  按保留期滚失；且**无频次闸门**——脚本刷全量号码今天仍可行，只是每一笔都留得下痕（ACC-79 明文登记的边界，
  闸门随消息/客服体系或隐私面单一起补）。
- **权限码全部为 MANAGE 型合并码**（读随写权）：没有「能看不能改」的拆分；拆分触发器 = 第一个此类岗位出现
  （permission-codes.md 口径）。
- **平台员工无按店/类目数据范围**：岗位是平台级角色，`SUPER_ADMIN` 通配即全平台；不存在「某 OPS 只管某类目」。
- **字段级权限没有独立机制**：掩码 + 视角工厂 + 逐条揭示端点就是现方案；没有「按角色可见字段」的声明式系统。
- **状态与审批是领域状态机，不是通用引擎**：各域的条件更新即闸门（§四），没有集中的审批流引擎——
  新增审批流 = 新增领域状态机 + 审计动作码，而不是配置一张表。
- **前端裁剪不是安全边界**（§一），侧栏/按钮按 `me.permissions` 裁剪只是体验，直敲 URL 由后端挡。

# 管理操作审计查询

平台侧的治理动作（封号、员工创建/调权/禁用、券作废、店铺审核决定、封店/解封、物流异常处置、轨迹补录）留两份痕迹，**分工不同，不要互相代替**：

| 要回答的问题                                       | 去哪查                                                    | 为什么                                                                        |
| -------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 「谁对哪个对象做了什么」——追责、合规、导出         | `audit.audit_records`（账本）                             | append-only、不随日志保留期滚失、按操作人/对象/时间能反查                     |
| 「这一次请求链路里发生了什么」——排障、性能、原因链 | 结构化日志里的 `BizEvent`（按 `trace_id` / `event` 检索） | 覆盖每一次调用与失败分支，但**按 trace 检索、会滚失，且没有「操作人」这一格** |

规则出处是 [business-rules/crosscut.md](../business-rules/crosscut.md) 的 GEN-65 ~ GEN-71（为什么同事务、为什么不记查询动作、为什么评价不进账本）；本文只讲**怎么查**。

## 1. 账本在哪

表：`audit.audit_records`（结构见 `apps/server/src/main/resources/db/migration/V69__audit_records.sql`）。

| 列              | 类型           | 含义                                                                                                                  |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `action`        | `varchar(64)`  | `AuditAction` 的 code，形如 `account.user.status_changed`                                                             |
| `target_type`   | `varchar(32)`  | `AuditTargetType` 枚举名（`USER` / `STAFF` / `USER_COUPON` / `SHOP` / `SHOP_REVIEW` / `SHIPMENT_ISSUE` / `SHIPMENT`） |
| `target_id`     | `varchar(64)`  | 被操作对象的 ID **文本**（跨模块对象，刻意不建 FK、不回查）                                                           |
| `operator_id`   | `uuid`         | 操作人 = 平台员工 `account.staff.id`（不是买家 user id）                                                              |
| `operator_name` | `varchar(50)`  | 操作人展示名**快照**：员工改名或被删后账本仍读得懂；查无此人为 `NULL`，前台显「未知操作人」                           |
| `detail`        | `varchar(200)` | 键值说明；**只允许已掩码的形状**（见 §4）                                                                             |
| `created_at`    | `timestamptz`  | 动作发生时刻（与业务动作同事务，因此就是提交时刻）                                                                    |

三条索引就是三条主路径，写查询时按它们挑条件，别造第四个形状：

- `idx_audit_records_operator (operator_id, created_at DESC)` —— 「这个员工做过什么」
- `idx_audit_records_target (target_type, target_id, created_at DESC)` —— 「这个对象被谁动过」
- `idx_audit_records_created_at (created_at DESC)` —— 纯时间窗翻页（导出、按天核对）

**没有 UPDATE / DELETE 入口**：`AuditRecordMapper` 只暴露 insert 与只读分页（`apps/server/src/main/java/com/shop/platform/audit/mapper/AuditRecordMapper.java`）。谁绕过它改了账本，这一线的价值当场归零——发现账本里有表外的 action 值，第一假设是「有人手改过库」，按事故处理。

### 连库

账本没有「按人反查」的界面之外的第二种读法，直连库只用于核对与批量。本地口径 15432（默认经 ssh 隧道接云主机上的 PG；根 AGENTS.md「数据库与 Redis」）：

```bash
wsl -d Ubuntu -- bash -lc \
  "PGPASSWORD=shop_dev psql -X -h localhost -p 15432 -U shop -d shop -c \
   'select created_at, action, operator_name, target_type, target_id, detail from audit.audit_records order by created_at desc limit 50'"
```

- 生产没有 `SHOP_DB_PORT` 这一说——prod 的库地址整体来自 `SPRING_DATASOURCE_URL`（`application-prod.yml`），端口按真实实例走。
- 测试库 `shop_test` 同一套结构（Flyway 从零跑全量迁移），拿它验证查询语句最安全。
- 只读核对请带 `LIMIT`：账本 append-only，时间窗放宽一天可能就是几万行。

## 2. 哪类动作落在哪一格

动作码的唯一词表是 `apps/server/src/main/java/com/shop/platform/audit/api/AuditAction.java`，`target_type` 由 action 决定（调用点传不了、也不需要传）。写入方与 detail 形状：

| action                              | target_type      | target_id 是    | 谁写的（同事务调 `RecordAuditCommand`）                                       |
| ----------------------------------- | ---------------- | --------------- | ----------------------------------------------------------------------------- |
| `account.user.status_changed`       | `USER`           | 买家账号 id     | `account/service/AuthService.updateUserStatus`                                |
| `account.staff.status_changed`      | `STAFF`          | 员工 id         | `account/service/StaffService`（禁用/启用）                                   |
| `account.staff.created`             | `STAFF`          | 新员工 id       | `account/service/StaffService.createStaff`                                    |
| `account.staff.role_changed`        | `STAFF`          | 员工 id         | `account/service/StaffService.updateStaffRole`                                |
| `coupon.user_coupon.voided`         | `USER_COUPON`    | 用户券实例 id   | `coupon/service/CouponAdminService`（作废）                                   |
| `shop.review.decided`               | `SHOP_REVIEW`    | 入驻审核记录 id | `shop/service/ShopReviewService.decide`                                       |
| `shop.trading_suspended`            | `SHOP`           | 店铺 id         | `shop/service/ShopAdminService.suspend`（封店，级联下架）                     |
| `shop.trading_resumed`              | `SHOP`           | 店铺 id         | `shop/service/ShopAdminService.resume`（解封，**不**自动重上架）              |
| `logistics.shipment_issue.resolved` | `SHIPMENT_ISSUE` | 异常单 id       | `logistics/service/ShipmentIssueService.resolve`（客服结单）                  |
| `logistics.tracking.written`        | `SHIPMENT`       | 包裹 id         | `logistics/service/TrackingService.recordNodeByOperator`（运营补录/纠错轨迹） |

两个容易查错的地方：

- **`logistics.tracking.written` 只有人工补录才记**。承运商 webhook（`/logistics/webhooks/{carrierCode}`）走的是同一条 `recordNode`，但没有人操作人，因此不进账——查不到某个节点的账本行不代表节点没落库，先分清的它是 webhook 还是人写的。幂等跳过的重复补录同样不记（没产生新事实）。
- **评价不进账本**（GEN-69）：买家与卖家之间的内容往来不是平台治理动作，混进去会把审计查询淹成噪音。卖家回复评价要去 `review.reviews` 看内容本身，那不是「谁对谁做了什么」。

## 3. 按什么键查

```sql
-- ① 某个员工做过什么（入职调查、权限收回后是否还有动作）
select created_at, action, target_type, target_id, detail
  from audit.audit_records
 where operator_id = '<staff-uuid>'
   and created_at >= now() - interval '30 days'
 order by created_at desc;

-- ② 某个对象被谁动过（用户投诉「我的号被禁了」、券被作废、店被封）
--    target_type 必带：不带它就走不上 idx_audit_records_target
select created_at, action, operator_id, operator_name, detail
  from audit.audit_records
 where target_type = 'USER' and target_id = '<user-uuid>'
 order by created_at desc;

-- ③ 某天某类动作的全量（发布窗口核对、按天做治理报表）
select action, count(*) from audit.audit_records
 where created_at >= date '2026-09-27' and created_at < date '2026-09-28'
 group by action order by count(*) desc;

-- ④ 某个动作的最近若干条（先认形状再谈条件）
select * from audit.audit_records where action = 'shop.trading_suspended'
 order by created_at desc limit 20;
```

对象 ID 之间要跳一次板：账本记的是**那一格动作的对象**，不是店铺。查「这家店发生过的全部治理动作」得拼三条：`target_type='SHOP' and target_id=<shopId>`（封店/解封）、`target_type='SHOP_REVIEW'`（先按 `shop.shop_reviews.id` 拿到审核记录 id）、以及该店券的 `USER_COUPON`（先按 `coupon.user_coupons.shop_id` 列券实例 id）。审计查询刻意不回查各模块表（GEN-70），所以它给不出「一个店铺的全部相关行」——这是决定，不是漏实现。

### 管理端界面

日常查询走管理端，不必连库：`GET /admin/audits`（`audit/controller/AdminAuditController.java`），权限 `AUDIT_VIEW`（REVIEWER / OPS / SUPER_ADMIN 三个岗位都持有，见 `contracts/permissions.yaml`）。筛选条件是操作人 / 目标类型 + 目标 ID / 动作 / 时间窗，全空即「最近发生了什么」；界面在 `apps/admin/src/audit/`（路由 `/audits`）。

导出（`apps/admin/src/audit/export-button.tsx`）：**点击前有二次确认**，写清按当前筛选导出与上限；单次上限 `EXPORT_ROW_LIMIT = 1000`（`apps/admin/src/audit/constants.ts`），超限提示收窄条件而不是静默截断。CSV 拼接在前端（`apps/admin/src/audit/export.ts`，RFC 4180 转义 + BOM）。要导十万行是后端导出任务的活，别拿浏览器拼。

## 4. detail 只有掩码形状

`detail` 是自由文本，**掩码责任在写入侧**：调用点必须先掩再传，审计模块不解析、不还原、只忠实存（GEN-68）。现行两族：

- 手机号：`PhoneNumber.mask()`（唯一后端出口，前 3 后 4 → `138****1234`），见 `account.user.status_changed` 的 `status=DISABLED, phone=138****1234`
- 工号：`StaffService.maskEmployeeNo()`，员工那一族动作都带

因此：

1. **账本里查不出明文手机号**，导出文件同理——这是设计目的，不是查询写错了。别为了「看起来方便」把明文塞进 detail，那会同时破 GEN-51（日志红线）和这条。
2. 需要明文号码时走**逐条显式索取**的端点，它们自带留痕事件：`POST /admin/reviews/{id}/owner-phone` → `shop_review.owner_phone_revealed`；`POST /shops/{shopId}/subaccounts/{subaccountId}/phone` → `shop_subaccount.phone_revealed`；`POST /seller/orders/{id}/receiver-phone` → `order.receiver_phone_revealed`。号码本身不入日志（GEN-50），要核实「谁取的号」按这三个事件查 `staff_id` / `operator_id`。
3. `reason` / `note` 这类人写的自由文本原样入 detail（审核驳回理由、异常结单备注），非敏感；**不要**在里面粘联系方式——那一列没有任何掩码兜底。

## 5. 缺一行账怎么判

账本行与业务动作同一个事务（`RecordAuditCommand.record` 是 `Propagation.MANDATORY`，不在事务里直接抛），所以两种偏差都被消掉了：动作回滚不会留下假账，动作提交不会因监听器没跑而缺账。于是**缺一行就是真的缺**：

- 先确认这个动作在 §2 的词表里——查询类操作、webhook 自动落库、幂等跳过的重复提交本来就不记账。
- 再确认它不是评价/内容类动作（GEN-69）。
- 都不是，才算写入侧漏接：治理动作新增了但没人调 `RecordAuditCommand`。补的顺序是先加 `AuditAction` 一格（带 `AuditTargetType`）、在业务方法的事务内调用、再往 `docs/business-rules/crosscut.md` 补规则编号；只加动作码不加调用点，账本永远查不出东西。

缺失的记录**不补写回业务表**，也不手工 `INSERT` 进账本去「对齐」：补出来的时间戳和操作人都是猜的，假账比缺账坏。要说明历史，走日志那侧按 `event` + 对象 ID 找证据，并在结论里写明「依据是结构化日志，账本无对应行」。

## 6. 新增治理动作的清单

1. `audit/api/AuditAction.java` 加一格：动作名沿用 `域.实体.动词过去式`（与事件目录同形状，但两者不共用名字），并声明唯一的 `AuditTargetType`；目标类型是新的就在 `AuditTargetType.java` 加。
2. 业务方法里在**自己的事务内**同步调 `recordAuditCommand.record(action, targetId, operatorId, operatorName, detail)`。`operatorName` 取 `staffReadQuery.displayNameById(operatorId)`——查无此人给 null，不要为了拿名字把动作做成会失败。
3. `detail` 里凡是个人数据先掩（`PhoneNumber.mask()` / `maskEmployeeNo()`），键值形状 `k=v, k=v`，长度按 `AuditFieldRules.DETAIL_MAX`（列宽 200，入参与落库同宽）。
4. `docs/business-rules/crosscut.md` 补编号条目；前端要按动作筛的话，管理端筛选器与中文映射跟着 `AuditAction` 词表走（`apps/admin/src/audit/constants.ts`），不另立一套动作名。

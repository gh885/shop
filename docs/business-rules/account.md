# 店铺 / 账号 / 权限

> 代码入口：apps/server/.../shop、account、infra/security；apps/web（auth/address）、apps/admin。规则以代码为准沉淀，改代码请同步本文件。

## 一、店铺（开店 / 状态 / 资料）

- **[ACC-01]** 任何已登录的统一账号用户（account.users，手机号即身份）都可开店，无需额外资格；开店即建店并自动进入待审核态 `PENDING_REVIEW`，平台审核通过才 `ACTIVE`。**一人一店**（拍板）：开店时该用户在 `shop_members` 已持有 ≥1 条 OWNER 记录即拒（400 + code `SHOP_LIMIT_EXCEEDED`）；判定口径取 OWNER 行数（与授权同源，不看 `shops.owner_id` 冗余列），被拒/被封的店仍占名额（店铺不物理删除、无释放通道）；子账号同闸——别人店的 MEMBER 身份既不占名额、也不额外拦人。
- **[ACC-02]** 店名必填、trim 后最长 50 字符（DB `VARCHAR(50)`）；**店名全平台唯一**：被任一既有店铺（含待审/被拒/被封——不看状态）占用即拒（400 + code `SHOP_NAME_TAKEN`），并发由唯一索引 `uk_shops_name`（V61）兜底成同一 400；logoKey 可选、最长 255。
- **[ACC-03]** 开店是同事务三写：建店（PENDING_REVIEW）+ 店主自动成为本店 `OWNER` 角色、`ACTIVE` 状态的成员 + 入队一条 `PENDING` 审核记录；授权判断以 `shop_members` 为准，`shops.owner_id` 只是冗余并存。
- **[ACC-04]** 店铺状态机：`PENDING_REVIEW → ACTIVE / REJECTED`；`REJECTED →（卖家补材料原地重提）PENDING_REVIEW`（ACC-74）；`ACTIVE ⇄ DISABLED`（枚举含 4 态：PENDING_REVIEW / ACTIVE / REJECTED / DISABLED）；唯一可营业态是 ACTIVE（谓词 `ShopStatus.isActive()`），不做物理删除。状态一旦进入不可营业（驳回/禁用），推进与「全店在架商品级联下架」同事务发生，见 ACC-72。
- **[ACC-05]** 买家侧公开查看店铺（`GET /api/shops/{id}`，匿名可达）只对 `ACTIVE` 店铺返回；待审核/被拒/封禁的店一律 404「店铺不存在」，不泄露"存在但不可用"。公开出参仅 id/店名/logoKey/createdAt。这份读进 Redis 缓存（`shop:public`，按店铺 id）：只有 ACTIVE 行会入缓存——404 是抛异常而异常不入缓存，所以「审核通过」不需要失效；反向离开 ACTIVE 的唯一路径是店主注销时的 `suspend`，它显式 evict（缓存口径见 apps/server/AGENTS.md「读缓存」）。
- **[ACC-06]** 卖家侧接口（`/seller/**`）必须携带 `X-Shop-Id` 头，缺失或非法（非 UUID）→ 403「缺少店铺上下文」；店铺必须存在且状态为 `PENDING_REVIEW` 或 `ACTIVE` 才放行（REJECTED/DISABLED 不可经营，403「店铺不存在或不可用」）；当前用户必须是该店 `ACTIVE` 成员，否则 403「你不是该店铺成员」。产物接口的 shopId 一律取过滤器装载的上下文，不信任请求体/参数里的 shopId。**放行经营 ≠ 放行成交**：待审店能备货建商品，但买家侧交易只认 ACTIVE（ACC-05 店页 404 + ACC-72 交易闸），商品上架了也卖不出去。
- **[ACC-07]** 「是卖家」= 在 `shop.shop_members` 有 ACTIVE 记录；一个用户可同时是买家 + 多店成员。我的店铺列表返回全部 ACTIVE 成员身份对应的店，新店在前。
- **[ACC-72]** 店铺停止营业的级联与交易闸（拍板）：
    - **级联下架**：审核驳回（及将来任何进入不可营业态）在店铺状态推进的**同一事务**发布 `shop::events` 的 `ShopTradingSuspendedEvent(shopId, reason)`，product 侧同步 `@EventListener` 一条条件 UPDATE 把该店全部 `PUBLISHED` 商品置 `WAREHOUSE`——店都不能营业了，架上留着只让买家点得进买不下。只动在架：草稿与「仓库中」的商品原样不动；不逐个走 `ProductService#off`（那条路径带 X-Shop-Id 归属校验与读-改-写，卖家语境专用）。**反向不自动回上架**：恢复 ACTIVE 不发布事件也不补逻辑——恢复营业 ≠ 平台背书这批历史商品仍满足上架门槛，卖家自己在后台重上、重上时复检（`off` 已收为包内方法，级联不借用）。
    - **交易闸**：买家侧成交路径逐店校验营业态——加购（按商品所属店）与下单（本单任一家店）在其余闸门之后过 `ShopReadQuery.isActive`，非 ACTIVE 一律 **409「店铺已停止营业」（不带 code）**：不是入参非法（400），是资源当前状态不允许这笔操作，前端只需按 status 分支。结算预览**不查**（预览不是成交，见 ORD 侧口径）。加购这道闸兜的是「车里已有条目 + 店刚好停了」的并发窗口——级联下架已让第 1 步「商品已下架」先挡下多数情况。
    - **依赖口径**：`ShopReadQuery.isActive` 是 shop :: api 里唯一「按状态过滤」的读出口，只吐 boolean、`ShopStatus` 词表不外泄给 cart/order；给布尔而不是抛异常，是因为它同时服务「拒绝成交」与「列表灰显」两种消费。`DISABLED` 的写入方目前只有一个：店主注销时的连带停营业（ACC-76，走同一个事件）。立约不变：**将来任何让店进入不可营业态的入口必须发布同一个事件**，否则级联漏一处即静默失守。
- **[ACC-74]** 被驳回的店铺可以**原地重新提交审核**（卖家自助，对标「资质补齐再来」）：`POST /shops/{shopId}/resubmit`，入参与开店同形状（复用 `CreateShopRequest`，不另立 DTO）。
    - **谁能提**：只有该店 `OWNER`（复用 ACC-12 的 `requireOwner`，外人 403）；**能提的只有当前态 = REJECTED 这一格**——待审的店已经在队列里、ACTIVE 店无需重审、被封的店要等平台解封（ACC-60 仍未落），三者一律 409「只有审核未通过的店铺可以重新提交」。
    - **改什么**：店名与 logoKey 按提交值整体覆盖，改名重新过全局唯一闸（本店自己那行不算冲突：`existsOtherNamed` 带 `id <> ?`；并发撞 `uk_shops_name` 兜成同一个 400 `SHOP_NAME_TAKEN`）。
    - **怎么落**：条件更新（`WHERE status = REJECTED`）是并发真相——预检与写之间被并发的重提/审核抢先则影响 0 行 → 409「店铺状态已变化，请刷新后重试」；成功后同事务再入队一条 `PENDING` 审核记录，**上一轮那条 REJECTED 留痕不动**（一店多条 review 是常态，审核员看到的仍是完整历史链）。
    - **为什么不释放名额再开一家**：一人一店数的是 OWNER 身份（ACC-01），被拒的店仍占名额；只放开名额等于让卖家丢掉店名占位与已上传 logo，也让平台丢掉上一轮审核记录。原地重提把「补材料」留在同一行店铺上，代价只是队列多一条 PENDING。
    - **重提不复活营业**：驳回时全店在架商品已级联下架（ACC-72），这次重提只把店推回 `PENDING_REVIEW`；即便日后审核通过也只到 ACTIVE，商品仍要卖家自己重新上架（ACC-72 反向刻意不回上架）。
    - **驳回理由下发**：`ShopResponse.rejectReason`（可空）= 该店 REJECTED 行里 `decidedAt` 最新那条的 reason，**只在店铺当前状态为 REJECTED 时装配**（已通过/已封禁的店不挂历史批注）；`reason` 为空则不下发，前端不显示空标题。这只出现在卖家侧 `/shops`，买家侧 `PublicShopResponse`（ACC-05）字段另有一只，不受影响。

## 二、店铺审核（平台侧）

- **[ACC-08]** 审核队列 `GET /admin/reviews` 需 `SHOP_REVIEW` 权限（岗位 REVIEWER / SUPER_ADMIN）；列表按 status 筛选分页，PENDING 优先、新店在前；出参拼装店名与店主手机号（跨 schema 按 ID 两步查，禁止 JOIN）。
- **[ACC-09]** 仅 `PENDING` 的审核记录可被处置，重复审核报错「该店铺已审核，请刷新列表」；通过 → 店铺转 `ACTIVE`，拒绝 → 转 `REJECTED` 且理由必填（≤255 字符）；审批留痕（审批员工 ID、理由、decidedAt）与店铺状态推进同事务原子生效。**驳回的副作用链不止改状态**：同事务发布 `ShopTradingSuspendedEvent` 触发全店在架商品级联下架（ACC-72），且这家店继续占着店主的「一人一店」名额（ACC-01）——卖家自助「重开一家店」无路，自助路是原地重提（ACC-74）。已处置的审核记录本身不翻案（不做二次开放、不改写历史行），但被驳回的店可由卖家补材料重新入队一条 PENDING（ACC-74）。处置落一条业务事件 `shop_review.decided`（GEN-50）。

## 三、店铺成员与邀请

- **[ACC-10]** 成员加入是两段式：店主按手机号发起邀请（落 `PENDING`）→ 被邀请人登录后在「我的待确认邀请」裁决（接受置 `ACTIVE`，或拒绝）→ 结束。只有本人可处理发给自己的 PENDING 邀请：确认（`POST /shops/invites/{id}/accept`）与拒绝（`POST /shops/invites/{id}/decline`，204 空体）共用同一套三档口径——别人的邀请 ID → 400「不能确认/拒绝发给别人的邀请」（两侧文案对称）；已处理 → 409「该邀请已处理」；行不存在（含从未存在与自己已拒掉的）→ 404「邀请不存在或已失效」，缺席与越权同一话术、不泄露他人邀请的存在性（拒绝也因此刻意不返回 204：204 等于对任意 id 承认「这条邀请存在且已被你拒绝」）。
- **[ACC-11]** 邀请规则：目标手机号必须是已注册的大陆手机号（`^1[3-9]\d{9}$`，未注册 400「该手机号还未注册」）；不能邀请自己；同店同人至多一条成员记录（含待确认邀请，重复 → 409，唯一索引 `uk_shop_members_shop_user` 兜底并发）。**拒绝/撤回不留行**：`declineInvite` 是带 `status=PENDING` 条件的删除（与并发的 accept 相撞时后到者拿 409，不会把刚生效的成员删掉），不新增 `DECLINED` 终态——成员表按 (shop_id, user_id) 单行唯一，保留拒绝行会让「再次邀请」多出一条必须先改回 PENDING 的更新分支连带并发口径，而删行后再邀天然可用（无行可撞）、「待确认邀请」列表按 PENDING 查也自然不挂已拒条目，两处目标一次到位、状态词表不必扩。
- **[ACC-12]** 店主专属操作（均需 `isActiveOwner`，否则 403「只有店主可以执行该操作」）：邀请成员、调整子账号权限（全量替换）、移除成员、查看成员列表。成员列表只要本店任一 ACTIVE 成员即可看（出参含各成员手机号：本人那行明文、他人那行掩码，明文逐条索取并留痕，见 ACC-79）。**店主撤回发出的邀请没有独立端点**，走 `removeMember` 删行（唯一通道，见 ACC-13）。
- **[ACC-13]** OWNER 权限固有不可改（调权目标必须是 MEMBER，否则「不能修改店主的权限」）；店主不能被移除（「不能移除店主」，且不能移除自己）；移除成员是删除成员行——该端点语义只有「删掉这一行」，不区分删的是已生效成员还是自己发出的待确认邀请（要区分得看目标行状态）。调权下一请求即生效（判权实时查库，无缓存）。**拒绝不是退店通道**：`ACTIVE` 成员离开本店只有店主移除这一条路，本人 decline 已生效的邀请会撞 409。
- **[ACC-14]** 子账号可授予的权限码白名单只有 5 个：`PRODUCT_MANAGE / ORDER_FULFILL / ADDRESS_MANAGE / SHIPPING_MANAGE / COUPON_MANAGE`；`MEMBER_MANAGE / SHOP_MANAGE` 为 OWNER 固有、不入可授予集合（防子账号自我提权）。入参经 sanitize：null/空 → 空集（最小权限默认值）、去重保序、白名单外或 null 元素 → 400「包含不可授予的权限码」。权限码以 jsonb 数组存 `shop_members.permissions`，默认 `[]`。
- **[ACC-79]** 「卖家自己的号」同样按 ORD-62 的口径处理，批量出参一律掩码、明文逐条索取且取用留痕（个保法最小必要不因「这是自己人」而豁免；号码掩码的唯一后端出口仍是 `PhoneNumber.mask()`，GEN-51）：
    - **平台审核队列**：`GET /admin/reviews` 的 `ownerPhone` 恒为掩码（前 3 后 4，查不到号时是 `****` 而不是 null——契约上不留「有时是明文」的缝）。要打电话核实资质走 `POST /admin/reviews/{id}/owner-phone`，落业务事件 `shop_review.owner_phone_revealed`（`review_id/shop_id/staff_id`，号码本身不入日志，GEN-50）。审核记录/店铺/店主账号任一缺席同为 404，不给「存在但拿不到号」的中间态。做成独立动作端点而不是把明文塞回队列，是为了让「看号码」在契约上就是一个动作。
    - **店铺成员列表**：`GET /shops/{shopId}/members` 里**只有操作者本人那一行给明文**（自己的号没必要瞒自己），其余一律掩码；要拨别人的号走 `POST /shops/{shopId}/members/{memberId}/phone`，落 `shop_member.phone_revealed`（`shop_id/member_id/operator_id`）。闸门与列表同档（本店 ACTIVE 成员），别店的成员行与不存在的行同为 404「成员不存在」——不泄露「这个 id 是不是别家店的成员」。
    - **前端只有一个索取入口**：三处掩码列（卖家订单列表的买家号、店铺成员列表的他人号、平台审核队列的店主号）共用 `@shop/ui-web` 的 `MaskedValueCell`，`****` 这道「还能不能索取」的判断因此只有一份。它管三件事：明文行不再给入口、**索取中那个按钮必须禁用**（一次索取 = 后端一条取用记录，连点就是凭空多几条审计记录）、给了 `subject`（收件人 / 店名）时可访问名要说得出是谁的号——一屏十个都叫「查看」的按钮读屏分不出来。写回明文这件事仍在各页自己的 mutation 里（就地改列表缓存那一行、不失效列表，ORD-62 ②），组件只管显示与按住。
    - 已知边界同 ORD-62：索取没有频次闸门，脚本刷全量号码今天仍然可行，只是每一笔都留得下痕；闸门随消息/客服体系或隐私面单一起补。

## 四、认证与令牌（买家）

- **[ACC-15]** 买家账号 = 手机号（全局唯一，唯一索引 `idx_users_phone` 兜底），无角色字段；短信验证码登录即注册：首次登录自动建号，状态固定 `ACTIVE`、密码为 NULL（可后补）。并发撞唯一索引时回读对方插入的账号幂等。
- **[ACC-16]** 登录/刷新/下单统一账号闸门：`UserStatus` 只有 ACTIVE/DISABLED 两态，非 ACTIVE 一律 403 + code `USER_DISABLED`；禁用账号不能借短信通道绕过（短信登录同样校验）。刷新链路同样校验账号状态：禁用账号的旧 refresh 已被消费、新码不签发——「封号」自动等效「吊销全部会话」（买家与员工同规则）。账号不做物理删除：**「不删行」不等于「不注销」**——注销是另一个轴（`deleted_at` + 匿名化，见 ACC-75），封号与注销共用「非 ACTIVE 即失去全部资格」这一道闸门，但只有注销会把个人信息清掉。
- **[ACC-17]** 密码登录防枚举：对外失败文案恒为「手机号或密码错误」（无此用户/未设密码/密码错误三分支只进内部日志）；用户不存在或未设密码时对合法 dummy BCrypt 哈希白算一次补齐耗时；被限流时同样跑 dummy hash 且返回与登录失败一模一样的响应（不告知"被限流"）。已移除 `PASSWORD_NOT_SET` 错误码。
- **[ACC-18]** 密码登录限流双维度：IP 10 次/60 秒、手机号 5 次/600 秒（Redis 固定窗口 INCR，超限任一即拒）；登录成功清除两侧计数。
- **[ACC-19]** 双 token：access = ES256 JWT，含 `type=access`、`kind=user|staff`、jti/iss(`shop-platform`)/aud(`shop-api`) claim；买家 access 寿命 10 分钟（600_000ms），平台员工 access 寿命独立 8 小时（28_800_000ms）。refresh = 不透明随机串（前缀 `rt:` + 32 字节随机 hex），寿命 7 天；有效期权威是 Redis TTL，cookie maxAge 只是展示层。
- **[ACC-20]** refresh token 只在服务端存 HMAC-SHA256(pepper, token) 摘要不落明文；pepper 配置于 `shop.security.pepper`，生产必须 ≥32 字符（过短启动失败），未配置降级为临时值并告警（重启即在途凭证失效，为何这样降级见 ACC-73）。响应体刻意不序列化 refreshToken（TokenPair `@JsonIgnore`），只经 httpOnly cookie 下发。
- **[ACC-21]** refresh cookie 属性：httpOnly + Secure + SameSite=Lax，`name=refresh_token`、path 收窄到 `/auth/refresh`、maxAge 7 天；管理端独立 `name=staff_refresh_token`、path=`/admin/auth/refresh`、不设 domain。买家 refresh 端点入站双来源（Cookie 优先、Body 兜底），两者皆无 → 401 `INVALID_TOKEN`；admin 端只认 cookie。入参 deviceId 缺省（无 body 或未带）归入 `"default"` 桶——注意它只是**提交值**，最终生效的设备身份以 token 绑定为准（ACC-63），`"default"` 只在反查不到绑定时才真正落账。
- **[ACC-22]** refresh 一次一换（rotation，Redis GETDEL 原子消费）+ 重放裁决：已消费过的 refresh 再现，15 秒宽限期内按多标签页并发竞争处理（401 无 code，detail「登录状态正在其他页面刷新，请稍后重试」，不吊销）；超宽限期判定盗用 → 吊销该主体全部设备会话，410 + code `REFRESH_TOKEN_REUSED`。消费痕迹 TTL 30 分钟。
- **[ACC-24]** 改密（setPassword）与重置密码（resetPassword）成功后一律吊销该用户全部设备的 refresh token（全端下线）；普通登出只吊销当前 deviceId；提供登出单设备与 logout-all。重置密码对不存在的手机号静默成功（不暴露账号存在性）。
- **[ACC-25]** 双 token 域隔离：`kind=staff` 的 token 只能在 `/admin/**` 链路生效（StaffAuthFilter requireStaff=true），买家链路（JwtAuthFilter）拒绝 staff token；反之用户 token 进不了管理端。kinds 校验失败统一 401 `INVALID_TOKEN`。校验顺序：Bearer 头 → 验签 → type=access → kind → audience → 过期（`TOKEN_EXPIRED`）。access 无黑名单：改密后旧 access 最多再存活其剩余寿命（≤10 分钟），为已接受的取舍。
- **[ACC-26]** 匿名可达面（skipPaths 前缀匹配）：商品/Feed/类目/店铺/.cms 浏览、`/auth/captcha|sms-code|login/*|refresh|forgot-password|reset-password`、`/admin`（走员工链）、物流 webhook（靠报文签名，未配密钥一律 403 不 fail-open）、actuator 与 OpenAPI 文档。购物车/下单等买家写接口不豁免，需登录。非法（非规范）路径统一 400「非法请求路径」，不给绕过前缀判断留缝。
- **[ACC-27]** 买家/卖家共享会话（轻量单点登录）：web 与 seller 共用同一账号与同一 `refresh_token` cookie，生产配 `shop.auth.refresh-cookie-domain`（如 `.example.com`）后登录一处另一处自动登录；本地留空不共享。admin 不纳入共享。共享只解决身份不解决权限——卖家侧能操作什么完全由 X-Shop-Id + 成员关系在服务端裁决。共享 cookie 带来一个副作用必须处理：两端 localStorage 各持一份 deviceId，同一个 token 会被两个值交替提交，设备身份因此**不跟提交值走**（ACC-63）。

## 五、员工（Staff）账号

- **[ACC-29]** 平台员工是独立于买/卖家的第二套账号体系（`account.staff`）：登录凭证 = 工号 + 密码，不走手机验证码；员工不能自助注册，由管理员创建（员工管理 CRUD 仍属 P2，仅「禁用/启用」入口已随封号端点落地，见 ACC-71）。工号全局唯一（varchar(50)，唯一索引 `uk_staff_employee_no`），密码 BCrypt 必填。
- **[ACC-30]** 员工登录失败对外统一「工号或密码错误」（工号不存在与密码错误不区分）；`StaffStatus` 非 ACTIVE → 403 + code `STAFF_DISABLED`。员工登录入口 `/admin/auth/login`，refresh 与 C 端复用同一套轮换/重放检测机制（RefreshTokenStore），但员工侧不采集 UA/IP 设备元数据，设备名固定「管理端」。
- **[ACC-31]** 员工 `me` 出参含岗位与有效权限码列表：禁用员工或未知/为空岗位一律给空权限集（如实呈现，拦截由判权层负责）；SUPER_ADMIN 展示时把通配符展开为全量具体码。
- **[ACC-71]** 封号端点（C12 产品化）：admin 侧 `PATCH /admin/users/{id}/status`（买家）与 `PATCH /admin/staff/{id}/status`（员工），body `{status: ACTIVE|DISABLED}`，授权统一 `STAFF_MANAGE`（仅 SUPER_ADMIN）。禁用后的闭合链路两侧不同：买家侧**不**同步吊销 refresh——在途 access 无黑名单最长剩 10 分钟（ACC-19/25 取舍），随后刷新撞 `refresh` 状态闸门（旧码已被 rotate 消费、新码不签发）+ 重登被 `USER_DISABLED` 拦，封号在 10 分钟窗口后自然等效全端下线；员工 access 寿命 8 小时，禁用在落状态之外同步 `RefreshTokenStore.revokeAll` 吊销全端会话，即时收场。启用＝状态回 ACTIVE，闸门实时查库，恢复登录/刷新（判权下一请求即生效）。不做物理删除（ACC-16）。

## 六、验证码规则（短信 OTP）

- **[ACC-32]** 短信验证码为 6 位数字（SecureRandom），有效期 5 分钟；Redis 只存 HMAC-SHA256(pepper, "phone:code") 摘要。登录码与重置密码码是同一套机制，仅 key 前缀与短信文案不同（重置码带「重置密码验证码: 」前缀）。
- **[ACC-33]** 发送频控四层：单 IP 10 条/分钟（429 `SMS_RATE_LIMIT`）→ 单 IP 每日不同手机号数上限默认 30（可配 `shop.auth.sms-ip-distinct-phones-max`，只限"新号码"，已见号码复发不受影响）→ 单手机号 60 秒重发冷却（429 `SMS_RATE_LIMIT`）→ 单手机号每日 20 条上限（429 `SMS_DAILY_LIMIT`）。短信发送被限流时明示 429（与密码登录被限流的静默策略相反，因该信息无枚举价值）。
- **[ACC-34]** 校验规则：同一验证码至多尝试 5 次，错满 5 次即烧码（后续输入走 `SMS_CODE_EXPIRED`）；前 4 次错误不烧码只计数（手滑友好），重发即重置尝试计数；校验成功立即消费（一次性）；无哈希（未发/过期）报 400 `SMS_CODE_EXPIRED`，码不符报 400 `SMS_CODE_INVALID`。校验接口不另设限流（猜测空间数学封顶 10⁶×5 次）。
- **[ACC-35]** 发码前置人机验证：`POST /auth/sms-code` 必须先通过图形验证码（防线顺序：入参格式（`@Valid`，在方法体之前）→ 人机验证 → 频控 → OTP）。图形验证码 4 位字符（字符集剔除 0/O/1/I/L 等混淆字符），答案 SHA-256 摘要存 Redis 5 分钟；校验无论成败都消费该 captchaId（防重放）；缺失 → 400 `CAPTCHA_REQUIRED`，过期 → `CAPTCHA_EXPIRED`，错误 → `CAPTCHA_INVALID`（大小写不敏感，前端据此刷新重输）。
- **[ACC-36]** 开发环境固定短信码 `666666`：仅当显式配置 `shop.auth.sms-channel=dev` 才装配 DevSmsChannel（matchIfMissing=false），生产漏配真实通道直接启动失败，不会静默留后门。dev 固定码同样清尝试计数并放行。

## 七、密码与资料

- **[ACC-37]** 密码策略：至少 8 位、UTF-8 字节数 ≤72（BCrypt 硬限制）、不能与手机号相同、不在硬编码常见弱密码黑名单（14 条，小写比较）；BCrypt cost 12。错误码不带独立 code，统一 400 文案。
- **[ACC-38]** 设置/修改密码：首次设置（passwordHash 为 NULL）不要求旧密码；已有密码必须提供正确的 currentPassword（401「当前密码错误」）；改密后全端吊销（见 ACC-24）。重置密码走短信码体系（非长 token）：先本地校验强度再消费一次性验证码。
- **[ACC-39]** 个人资料：昵称 trim 后非空且 ≤30 字（400）；avatarKey 为对象存储 key ≤255，null=不改、空串=清空；手机号在 `me`/资料出参一律脱敏为 `138****8000` 形态。头像上传走一次性 ticket 直传对象存储。
- **[ACC-40]** 手机号值对象：三档口径按「这个入口能不能猜」分——**触发真实发短信的入站端点**（`POST /auth/sms-code`、`POST /auth/forgot-password`）在 DTO 上强校验大陆手机号 `@Pattern(PhoneNumber.CHINA_MOBILE_PATTERN)`（`^1[3-9]\d{9}$`），格式错走 **422 + `errors[]`、不带 code**（GEN-19 第①条线；被 Zod 拦在前端时根本到不了这里）；**登录族**（短信/密码登录、改密）维持 7–20 字符 trim 宽松直存，与「对外失败文案恒为手机号或密码错误」的防枚举姿态配套（ACC-17），校验过严反而把格式判据泄露给脚本；地址联系人电话允许 `^[0-9+\-]{5,20}$`（可代收/座机）。业务强校验处（邀请成员）在 service 层用大陆号正则（ACC-11）。归一化去空格/连字符/括号/点号。日志一律脱敏（GEN-51）。

## 八、权限判定（RBAC / 判权拦截器）

- **[ACC-41]** 判权入口 = `@RequirePermission` 注解（方法级覆盖类级），value 为 ANY 语义（持有任一码即通过）；通配码 `*` 恒通过，只出现在解析层，注解上永远写具体码。权限码契约 SCREAMING_SNAKE_CASE，只增不改名不删除。
- **[ACC-42]** 受保护命名空间 `/admin/**` 与 `/seller/**` 默认拒绝：handler 缺 `@RequirePermission` → 403 `PERMISSION_DENIED`「接口未配置权限」；唯一豁免是 `/admin/auth/**` 自服务端点（登录/刷新/me/登出，只吃认证）。另有启动自检 AdminEndpointGuardTest 把漏标炸在开发期（双保险）。非法路径不进判权。
- **[ACC-43]** 判权按主体域解析：PermissionResolver 链取第一个非 null 结果——员工域（StaffContext 有值）实时查库解析岗位权限集；卖家域（ShopMemberContext 有值，由 ShopMembershipFilter 装载）OWNER → 通配 `*` 全通过，MEMBER → 被授予码集（null 当空集）。上下文不属于任何受保护域（无人认领）→ 空集 fail-close。判权每请求实时查库不做缓存：禁用/收权下一请求即生效。
- **[ACC-44]** 平台岗位 → 权限映射（枚举硬编码，改映射=改代码发版）：`SUPER_ADMIN` → 通配全通过；`REVIEWER` → `SHOP_REVIEW`；`OPS` → `CMS_MANAGE + CATEGORY_MANAGE + LOGISTICS_MANAGE`。库中未知/null role 一律空权限（fail-close）。`STAFF_MANAGE` 的首个消费点是封号端点（ACC-71，买家与员工两侧状态变更），SUPER_ADMIN 之外的岗位暂不持有它。
- **[ACC-45]** 全量权限码 10 个：admin 域 5（SHOP_REVIEW / CMS_MANAGE / CATEGORY_MANAGE / STAFF_MANAGE / LOGISTICS_MANAGE）+ seller 域 5（PRODUCT_MANAGE / ORDER_FULFILL / ADDRESS_MANAGE / SHIPPING_MANAGE / COUPON_MANAGE）。全部是 MANAGE 型合并码（读随写权），拆分读写的触发器=第一个「能看不能改」岗位出现。卖家侧实际注解：订单/售后/物流发货 → ORDER_FULFILL，商品 → PRODUCT_MANAGE，商家地址 → ADDRESS_MANAGE，运费模板 → SHIPPING_MANAGE，优惠券 → COUPON_MANAGE。
- **[ACC-46]** 店铺成员管理（邀请/改权/移除/列表）不走权限码，按「店主角色」裁决（`/shops/**` 不在判权命名空间内，service 层 requireOwner/requireActiveMember）；文档口径：`MEMBER_MANAGE`/`SHOP_MANAGE` 为 OWNER 固有，刻意不建权限码常量。

## 九、地址簿（买家收货地址）

- **[ACC-47]** 买家地址全部需登录（`/user/addresses`），仅本人可见——不存在或不属于当前用户一律 404「地址不存在」，不泄露他人数据存在性。列表排序：默认地址置顶，其余按创建时间倒序。
- **[ACC-48]** 每个买家至多一个默认地址：设默认（新增/编辑/设默认端点）先清本人其他默认，部分唯一索引 `uk_addresses_default`（is_default=TRUE 且未删）兜底并发；允许「无默认地址」状态——删除默认地址不自动顶替，另有显式取消默认端点（DELETE /{id}/default）。
- **[ACC-49]** 地址删除是软删（deletedAt 逻辑删除，查询自动过滤，且不把 deletedAt 序列化出 HTTP 边界）。地址独立于订单：下单结算时按 ID 跨 schema 只读（快照归 order）。
- **[ACC-50]** 地址字段校验：收件人 ≤30、电话 `^[0-9+\-]{5,20}$`（可代收≠账号手机号）、行政区划码 6 位数字且必须是 RegionRegistry 合法国标码（「行政区划代码无效」）、省/市/区各 ≤30 必填、详址 ≤120、标签 ≤20。前端 zod 镜像同样规则（不复刻默认唯一性等业务规则）。
- **[ACC-51]** 地址标签：内置枚举 HOME/WORK/SCHOOL/PARENTS/FRIEND（未指定默认 HOME），其余非空字符串视为用户自定义文案原样入库（前端自定义标签限 4 字）；前端按已知 code 渲染图标，未知值按纯文本展示。
- **[ACC-52]** 智能粘贴：一段非结构化收货文本可解析为结构化字段（第三方分词库 + RegionRegistry 区划名→国标码映射），解析不入库；收件人清洗尾部标点杂讯；收件人/手机号可能解析失败，由前端回填让用户确认。
- **[ACC-53]** 买家地址条数上限 20 条：新增（create）时未删地址已达 20 条即拒（400 + code `ADDRESS_LIMIT_EXCEEDED`，「最多保存 20 条收货地址」）；软删不占名额（计数只算未删行）。

## 十、地址簿（商家发货/退货地址）

- **[ACC-54]** 商家地址归 shop 模块（`shop.merchant_addresses`，表迁自 merchant_address schema），授权 = `ADDRESS_MANAGE` 权限码 + 成员身份（X-Shop-Id 上下文），shopId 前端不传；越店访问一律 404。单表模型：一条地址 = 地址本体 + 「默认发货」「默认退货」两个布尔，一条地址可同时承担两者；面单寄件人 = companyName（公司名称）。
- **[ACC-55]** 每店默认发货/默认退货各至多一个：设默认先清本店同类默认，部分唯一索引（未删且为默认的行）兜底并发；列表排序默认发货/默认退货置顶、其余按更新时间倒序；删除/取消默认不静默顶替，允许该店暂时无默认。
- **[ACC-56]** 商家地址字段：联系人 ≤30、电话 `^[0-9+\-]{5,20}$`、区划码 6 位国标校验、省/市必填、区/县可空（直辖市/直筒子市）、详址 ≤120、邮编可空 6 位数字、公司名 ≤60、备注 ≤200；默认标记 null 时新增视为 false、编辑保持原值。地址有 ACTIVE/DISABLED 状态维度（停用不参与快照解析，软删归 deletedAt）；api 快照解析只认「未删 + ACTIVE」。
- **[ACC-70]** 商家地址条数上限每店 200 条：新增（create）时本店未删地址已达 200 条即拒（400 + code `MERCHANT_ADDRESS_LIMIT_EXCEEDED`，「最多添加 200 条地址」，与卖家工作台文案同口径）；软删不占名额。

## 十一、账号注销（买家自助，个保法第 47 条）

- **[ACC-75]** 注销是两段式（申请 → 生效），不是一键删除：
    - **申请只落一个时刻**：`account.users.deletion_requested_at`（冷静期起点）。期内账号一切照常——能登录、能下单、能撤销，数据一行不动。
    - **冷静期 15 天**（`AccountDeletionTimeouts.COOLING_OFF`），期满由 `AccountDeletionJob`（每小时扫一轮，每批至多 20 笔）执行。两段的理由：删除不可逆，而「误操作 / 验证码被他人拿到后恶意注销」唯一的补救窗口就是这段时间；它同时是**反劫持**门槛——只握有一枚一次性码的人 15 天内也拿不到账号，真机主有 15 天发现并撤销。批量上限不是性能考虑：注销是毁灭性动作，宁可分批慢做，也不要一轮锁住大批账号行。
    - **冷静期不是审核期，也不暂停任何东西**：平台不审批注销（无人工闸、无客服介入），期内不冻结交易能力，订单/退款/售后照常流转。
    - **撤销 = 清空申请时刻**，无限次。因为申请什么都没动，撤销即完全复原，不存在「已部分清理不可恢复」的中间态。
- **[ACC-76]** 三档数据处置（个保法「删除」在电商语境下的实际形状）：
    - **匿名化（清掉个人信息，行保留）**：phone → 占位串（见 ACC-77）、`password_hash` / `avatar_key` → null、nickname → 「已注销用户」、status → DISABLED、`deleted_at` = 生效时刻。行不删（电商法第 31 条交易信息留存，且历史订单/评价/售后要有主语可挂）；刻意**不**加 `@TableLogic`——`deleted_at` 是「注销生效时刻」这个业务事实，与地址/商品的软删标志语义不同，不混用同一列（ACC-16「不删行 ≠ 不注销」）。昵称/占位号码是系统生成、全员同一形状，不属于个人信息，留给仍在引用这个 id 的地方一句能读的说明，而不是空白或裸 uuid。
    - **清掉（意愿数据）**：购物车条目与收藏 `deleteByUser` 物理删——人不在，「我喜欢/我想要」既无人消费，又是一份可关联到具体某人的兴趣画像，正是删除权要带走的那类信息；收货地址走它自己的软删（与 ACC-49 同一套删除词汇，不立第二套）；未使用券置 `VOID` 而非删行（核销流水与「这张券曾发给谁」的发放统计要靠这行对账，VOID 是券自己的终态，运营作废走同一个态）。
    - **保留（平台治理凭据，一律不动）**：订单、退款/售后、支付与资金流水、评价、店铺本体与店主归属、审核历史。
    - **卖家身份**：店主名下 ACTIVE 店 → 条件更新 `suspend`（ACTIVE→DISABLED）+ 同事务按 ACC-72 的立约发布 `ShopTradingSuspendedEvent(shopId, "OWNER_DELETED")`，product 据此级联下架在架商品；本人作为子账号/待确认邀请的 `shop_members` 行删掉（ACTIVE 成员离开本店只有「店主移除」一条通道，不连带清理等于留一扇打不开的门）。**店不删、不改店主、不释放店名**——「这家店曾属于谁」是治理凭据，已售出的单还要有人对货；平台侧的封店端点仍属空缺（ACC-60），这里只是「店主这个人消失了」这一事实的既有出口。
    - **依赖方向**：清理散在 cart / favorite / coupon / shop 四个模块。account 谁都不依赖，只发布 `account::events` 的 `UserDeletedEvent`（不携带任何个人信息），四个消费方各自 `@EventListener` 同步处理；反向（account 调它们的 api）会与既有的 `shop → account::api` 凑成模块环。同步监听 = 同一个事务，任一处失败整体回滚，不会出现「号已注销、购物车还挂在那个手机号上」这种半截状态。顺带的好处：清理规则长在使用那张表的模块里。
    - **不做在途资格闸门**（拍板）：注销不检查「有没有未完成订单/售后」——那要读 order/aftersale，而 account 依赖它们同样成环；何况人在 15 天里始终能正常处理在途事务，期满仍在途的单由 ORD/AFS 自己的超时链跑到终态。注销删的是**将来**的资格，不是别人的在途工作。
    - **会话**：`RefreshTokenStore.revokeAll` 排在事务内最后一步——Redis 不在事务里、回滚也退不回来，宁可多踢一次也不要「注销失败却把人留着」。在途 access 无黑名单，最长 10 分钟后自然失效（ACC-19/25 同一取舍）。并发与幂等不靠锁：全部资格判定合成**一笔**条件 UPDATE（未注销 + ACTIVE + 申请时刻非空且已过 cutoff），影响 0 行即本轮不执行——多实例并发扫描同一行只有一个赢，期内被撤销或被平台禁用天然不落地。
- **[ACC-77]** 号码释放与新主体：注销后 phone 列填 `dz` + uuid **尾** 16 位十六进制。取尾不取头：头部是毫秒时间戳，同一毫秒注销的两行会撞全局唯一索引 `idx_users_phone`，尾段是 uuidv7 的随机段（约 62 位熵）；`dz` 前缀让它不再是任何合法号码形状，登录族按号码查不到这行，长度 18 ≤ 列宽 20。原号码就此交还——电信循环放号后的下一个人可把它注册成**全新主体**（新 user id，与注销者无任何关联，历史不继承）。已知边界：号码占位使 ORD-59 那类「按手机号的计数」自然归零，新主体因此拿到满额额度，与「买家滥用侧无计数」同档，属已接受。
- **[ACC-78]** 端点与前端入口：4 条口子全在 `/auth/deletion`（`GET` 状态出 `{requested, effectiveAt}`、`POST /code` 发验证码、`POST` 提交申请、`DELETE` 撤销），均要求已登录——不在 ACC-26 的匿名豁免清单里。
    - **发码不收手机号、也不要图形验证码**：号码取 token 背后的账号，不让前端自报，因此不存在「拿别人的号收码」这条通道（这正是它与注册/登录发码的差别）。
    - **申请只带 code**（`ConfirmDeletionRequest`，6 位数字），不再输密码：能登录 + 能收本机短信已是两因子。验证码在写库**之前**消费：写库失败（并发/已申请）只浪费一枚码，是重发一次的烦；反过来等于「没过验证就能注销」，是漏洞。
    - **前端入口在「账号安全」页**：注销条目 → 数据处置清单（哪些清掉 / 哪些保留 / 哪些匿名，让用户在知情前提下决定）→ 发码 + 输码 → destructive 二次确认 → 提交即进冷静期；已在冷静期时该条目改显「预计 X 生效」并给撤销按钮。OTP 错误/限流的前端行为沿用 ACC-67，不另立一套。
    - **禁用中的账号不给自助注销**：`requireActive` 对 `deleted_at != null` 回 404「用户不存在」（注销后没有账号可看，也不泄露"曾经存在"），非 ACTIVE 回 403 `USER_DISABLED`——封号是平台在追的事，注销不能成为「把追踪线索自我销毁」的出口；要注销先由平台解禁（ACC-71）。

## 全局会话与鉴权行为（横切）

- **[ACC-61]** 前端会话（三端共用 auth-kit）：access token 只存内存（auth-kit 闭包变量），不落 localStorage；refresh token 走 httpOnly cookie——cookie 安全属性见 ACC-21，买家/卖家共享会话见 ACC-27。启动时 `bootstrapAuth()` 用 refresh cookie 静默刷新一次裁决登录态：单例 Promise（多处 await 只发一次请求——第二次轮换会把第一次签发的 token 判成重放），refresh cookie 有效 → 换 accessToken 并裁决 authed，失败 → clear 裁决 guest；登录态三值 unknown/authed/guest 经 `useSyncExternalStore` 订阅广播，tokenStore 写入即 authed、清除即 guest。**两个例外让结论不会卡死**：已 authed 时 `bootstrapAuth()` 直接放行不再刷（登录成功不该再等一轮）；`clear()` 作废那枚单例 Promise，登出后同一页面仍能用 cookie 静默重登，而不是必须整页重载（cookie 没过期就登不回来是 bug，不是语义）。
- **[ACC-62]** 401 自动续期重发：SDK 响应拦截器收到 401 且非 refresh 端点自身时，用原生 fetch POST 各自前缀下的 refresh 端点（C 端默认 `auth/refresh`，admin 装配时传自己的），成功则写入 tokenStore 并重建重发原请求（用户无感）；refresh 失败/响应无 accessToken → 原始 401 正常冒泡。刷新失败不弹提示、不清态由消费方按 401 自行处理。**刷新是单飞的**：同一时刻多个请求各自 401（首屏并发是常态）只发一笔 refresh，兄弟请求 await 同一枚 Promise，成功写 tokenStore 也只做一次——各刷各的等于自己制造 ACC-22 的重放。刷完仍失败按 ACC-22 分两档：落在 15 秒宽限期内后端判「多标签页竞争」给 401 不吊销，本请求冒泡原始 401（此时兄弟请求早已换到新 token，用户看到的是句假的「登录已过期」，重试即恢复）；超出宽限期判成盗用 → 410。**410 例外（C14 已实现）**：refresh 返回 410 且 code `REFRESH_TOKEN_REUSED`（后端已全端吊销，ACC-22）时，拦截器就地 `tokenStore.clear()` 清登录态（`clear` 在 TokenStore 上是必给字段：可选就意味着某个装配漏实现时清态静默变成 no-op，人被吊销了前端还显示已登录），并把该 410 冒泡——detail（「全部设备已下线」语义）经错误拦截器归一成 ApiError，toast 由消费方全局错误通道呈现，拦截器不直造 UI。响应的 body 只能消费一次，所以吊销时每个 await 到结果的调用点各自拿一份同体的新 410，不是共享同一个 Response。重发原请求要重建 `Request`（原 body 已消费，从序列化结果取）；重建失败则原始 401 冒泡。
- **[ACC-63]** 设备 ID：首次 `crypto.randomUUID()` 生成并持久化 localStorage（默认键 `shop_device_id`，各端可换键隔离会话——admin 用独立键隔离），随 refresh 上报支撑多端设备列表与按设备吊销。**设备身份以 refresh token 首次绑定为准，不信任本次提交的 deviceId**（拍板，方案①）：`RefreshTokenStore.rotate` 先在设备集合里反查「当前索引指向本 token 摘要」的 deviceId（消费旧码删的是权威键 `refresh:<hmac>`，设备索引 `refresh:user:<subject>:<deviceId>` 此时仍在，其值即旧摘要；扫本主体个位数成员、不碰 KEYS），命中则清索引与重签发都沿用那一条，只有反查不到（历史数据/绑定丢失）才回退用提交值登记。这不加 Redis 往返，也不引入新状态。**语义变化：吊销粒度 = 浏览器**——同一浏览器上 web/seller 两端（各持一份 deviceId、共用一个 cookie，ACC-27）从此合并成一条设备条目，不再每换一端刷新就迁移出一个假活跃条目；代价是「按设备吊销」再也无法只踢卖家工作台而留住买家端，跨标签页/跨端「单独下线其中一个」属已接受的边界。员工侧不采集设备元数据、恒 `"default"` 单桶（ACC-30）。
- **[ACC-64]** 未登录访问受保护路由：客户端导航 `beforeLoad: requireAuth()` 先 await bootstrap 裁决，未登录拉起全局登录 Dialog 并 redirect 首页（web）；SSR 首屏不裁决登录态（cookie 只在浏览器端刷），由客户端守卫（`_protected` 布局 gate）兜底。
- **[ACC-80]** 卖家登出的清态范围 = access token **+ 当前店铺上下文**（`X-Shop-Id` 的来源，ACC-06）：它持久在 localStorage 并由 SDK 拦截器注入每一个请求，只清 token 就是让下一个用同一浏览器登录的账号替上一个人发 `/seller/**` 请求（不在那家店 → 403「你不是该店铺成员」；恰好是成员 → 未经选择就开在别人店里经营）。清态放在 `finally`：登出接口失败也要清，本地状态不该因为一次远端调用失败而留着。已知边界：410 吊销裁决走 ACC-62 的 `tokenStore.clear()`，不经 `logout()`，店铺上下文因此残留——`/shops/mine` 不在 `ShopMembershipFilter` 的 `/seller` 命名空间内，`useCurrentShop` 的「落到第一家 ACTIVE 店」兜底仍能把它修回来，所以残留的代价是首个 `/seller/**` 请求可能带错店铺头，不是永久卡死。

## 错误码 → 前端行为

- **[ACC-65]** Token 类错误：`TOKEN_EXPIRED`（401，access token 过期——买家 10 分钟 / 员工 8 小时）→ 前端静默 refresh 续期，用户无感；`INVALID_TOKEN`（401，未携带/格式错/类型错/受众错/签名失败）→ 清用户状态回未登录；`REFRESH_TOKEN_REUSED`（410，重放超宽限期）→ 后端同步吊销该主体所有设备会话，前端呈现「所有设备已下线」。
- **[ACC-66]** `USER_DISABLED` / `STAFF_DISABLED`（403）：登录与鉴权时账号状态非 ACTIVE 即抛，前端展示后端 detail「账号已被禁用」；`PERMISSION_DENIED`（403）：已认证主体缺权限码（PermissionInterceptor 判权失败），前端按 403/无权限呈现，不引导重新登录。
- **[ACC-67]** 短信码错误的前端行为：`SMS_CODE_INVALID`/`SMS_CODE_EXPIRED` 使验证码输入框标红（invalid 态），用户重新输入即清错；发码按钮成功后本地起 60s 倒计时（「Ns 后重发」），倒计时/手机号合法/图形码 4 位三者齐备才可发码。429 `SMS_RATE_LIMIT` 命中时同样起 60s 倒计时（C14 已实现：服务端窗口就是 60s，连点只会再撞限流；`SMS_DAILY_LIMIT` 等其余失败不起）。
- **[ACC-68]** 图形验证码错误的前端行为：前端（共享 LoginForm）对三类图形验证码错误（`CAPTCHA_REQUIRED`/`CAPTCHA_EXPIRED`/`CAPTCHA_INVALID`，后端规则见 ACC-35）统一处理：标红输入框、刷新验证码图、清空重输；重输时只清除验证码类错误。
- **[ACC-73]** 安全配置缺失的统一姿态是「按能不能安全降级分档」，不是一刀切 fail-fast：**降级会留后门**的（短信通道 `shop.auth.sms-channel` 漏配真实通道、物流验签密钥）→ 启动失败或请求侧一律拒绝（LOG-22 webhook 未配密钥 403，不 fail-open）；**降级只伤在途凭证**的（pepper、JWT ES256 密钥对）→ 生成临时值并告警，重启即在途凭证全部失效，等于「开发环境免配置可跑」的代价显式转嫁给会话。两处临时值告警级别刻意不同：pepper 影响 refresh 与验证码（`log.warn`），JWT 只影响 access（`log.info`，且无长度闸门）——这是不对称，不是遗漏。是否要给 JWT 补长度/存在性闸门尚未拍板，列为留白。

## 十二、已定案未实现（文档已写、代码没有）

- **[ACC-57]** 员工管理 CRUD 的「创建员工/分配岗位」仍未实现（含自指禁令与末位保护），员工建档仍只能手工写库；「禁用」半边已随封号端点落地（ACC-71，`STAFF_MANAGE` 首个消费点）。
- **[ACC-58]** admin 前端导航消费 me 出参 permission 字段——文档 P2 未做。
- **[ACC-59]** auth.md §5 边界声明中仍属"故意不做"且代码确未实现：泄露密码库比对（黑名单仅硬编码 14 条占位）、短信异步化+双通道、登录风控（异地提醒/设备指纹）、Redis 故障降级、密码哈希升级检测（登录时重写旧 cost）、CSRF Token（现靠 SameSite=Lax）、access 主动登出限制（access 过期时点登出会 401，refresh cookie 等自然过期）、跨标签页登录态同步（多标签页输家显示未登录，属前端已知边界）。
- **[ACC-60]** 店铺「封禁/解禁/注销」的**平台侧操作端点**不存在：`ShopStatus.DISABLED` 与 ACTIVE⇄DISABLED 转换在状态机中定义，`ShopMapper.suspend` 也已存在（ACC-76 店主连带停营业在用），但 admin 侧没有任何封禁/解禁/注销店铺的 service 方法或端点（要停一家人的店目前只能改库）；被拒店铺的重提通道已落（ACC-74），被封的店仍无自助路，也无平台侧恢复路。**改库时的立约**：直接 UPDATE 成 DISABLED 不会发布 `ShopTradingSuspendedEvent`，级联下架因此漏做（交易闸 ACC-72 仍兜得住成交，但架上商品不会自动撤）——将来落封禁端点必须复用 `suspend` + 发事件那条同事务路径，不另起第二套下架逻辑。

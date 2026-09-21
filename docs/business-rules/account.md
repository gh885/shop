# 店铺 / 账号 / 权限

> 代码入口：apps/server/.../shop、account、infra/security；apps/web（auth/address）、apps/admin。规则以代码为准沉淀，改代码请同步本文件。

## 一、店铺（开店 / 状态 / 资料）

- **[ACC-01]** 任何已登录的统一账号用户（account.users，手机号即身份）都可开店，无需额外资格；开店即建店并自动进入待审核态 `PENDING_REVIEW`，平台审核通过才 `ACTIVE`。同一用户开店数量无上限校验。
- **[ACC-02]** 店名必填、trim 后最长 50 字符（DB `VARCHAR(50)`）；店名不要求全局唯一，无重名校验；logoKey 可选、最长 255。
- **[ACC-03]** 开店是同事务三写：建店（PENDING_REVIEW）+ 店主自动成为本店 `OWNER` 角色、`ACTIVE` 状态的成员 + 入队一条 `PENDING` 审核记录；授权判断以 `shop_members` 为准，`shops.owner_id` 只是冗余并存。
- **[ACC-04]** 店铺状态机：`PENDING_REVIEW → ACTIVE / REJECTED`；`ACTIVE ⇄ DISABLED`（枚举含 4 态：PENDING_REVIEW / ACTIVE / REJECTED / DISABLED）；唯一可营业态是 ACTIVE，不做物理删除。
- **[ACC-05]** 买家侧公开查看店铺（`GET /api/shops/{id}`，匿名可达）只对 `ACTIVE` 店铺返回；待审核/被拒/封禁的店一律 404「店铺不存在」，不泄露"存在但不可用"。公开出参仅 id/店名/logoKey/createdAt。
- **[ACC-06]** 卖家侧接口（`/seller/**`）必须携带 `X-Shop-Id` 头，缺失或非法（非 UUID）→ 403「缺少店铺上下文」；店铺必须存在且状态为 `PENDING_REVIEW` 或 `ACTIVE` 才放行（REJECTED/DISABLED 不可经营，403「店铺不存在或不可用」）；当前用户必须是该店 `ACTIVE` 成员，否则 403「你不是该店铺成员」。产物接口的 shopId 一律取过滤器装载的上下文，不信任请求体/参数里的 shopId。
- **[ACC-07]** 「是卖家」= 在 `shop.shop_members` 有 ACTIVE 记录；一个用户可同时是买家 + 多店成员。我的店铺列表返回全部 ACTIVE 成员身份对应的店，新店在前。

## 二、店铺审核（平台侧）

- **[ACC-08]** 审核队列 `GET /admin/reviews` 需 `SHOP_REVIEW` 权限（岗位 REVIEWER / SUPER_ADMIN）；列表按 status 筛选分页，PENDING 优先、新店在前；出参拼装店名与店主手机号（跨 schema 按 ID 两步查，禁止 JOIN）。
- **[ACC-09]** 仅 `PENDING` 的审核记录可被处置，重复审核报错「该店铺已审核，请刷新列表」；通过 → 店铺转 `ACTIVE`，拒绝 → 转 `REJECTED` 且理由必填（≤255 字符）；审批留痕（审批员工 ID、理由、decidedAt）与店铺状态推进同事务原子生效。审核记录不做二次开放（拒绝后无重新申诉/再审通道）。

## 三、店铺成员与邀请

- **[ACC-10]** 成员加入是两段式：店主按手机号发起邀请（落 `PENDING`）→ 被邀请人登录后在「我的待确认邀请」确认 → 置 `ACTIVE`。只有本人可确认发给自己的 PENDING 邀请（别人的邀请 ID →「不能确认发给别人的邀请」，已处理的 →「该邀请已处理」）。
- **[ACC-11]** 邀请规则：目标手机号必须是已注册的大陆手机号（`^1[3-9]\d{9}$`，未注册 400「该手机号还未注册」）；不能邀请自己；同店同人至多一条成员记录（含待确认邀请，重复 → 409，唯一索引 `uk_shop_members_shop_user` 兜底并发）。
- **[ACC-12]** 店主专属操作（均需 `isActiveOwner`，否则 403「只有店主可以执行该操作」）：邀请成员、调整子账号权限（全量替换）、移除成员、查看成员列表。成员列表只要本店任一 ACTIVE 成员即可看（出参含各成员手机号）。
- **[ACC-13]** OWNER 权限固有不可改（调权目标必须是 MEMBER，否则「不能修改店主的权限」）；店主不能被移除（「不能移除店主」，且不能移除自己）；移除成员是删除成员行。调权下一请求即生效（判权实时查库，无缓存）。
- **[ACC-14]** 子账号可授予的权限码白名单只有 5 个：`PRODUCT_MANAGE / ORDER_FULFILL / ADDRESS_MANAGE / SHIPPING_MANAGE / COUPON_MANAGE`；`MEMBER_MANAGE / SHOP_MANAGE` 为 OWNER 固有、不入可授予集合（防子账号自我提权）。入参经 sanitize：null/空 → 空集（最小权限默认值）、去重保序、白名单外或 null 元素 → 400「包含不可授予的权限码」。权限码以 jsonb 数组存 `shop_members.permissions`，默认 `[]`。

## 四、认证与令牌（买家）

- **[ACC-15]** 买家账号 = 手机号（全局唯一，唯一索引 `idx_users_phone` 兜底），无角色字段；短信验证码登录即注册：首次登录自动建号，状态固定 `ACTIVE`、密码为 NULL（可后补）。并发撞唯一索引时回读对方插入的账号幂等。
- **[ACC-16]** 登录/刷新/下单统一账号闸门：`UserStatus` 只有 ACTIVE/DISABLED 两态，非 ACTIVE 一律 403 + code `USER_DISABLED`；禁用账号不能借短信通道绕过（短信登录同样校验）。刷新链路同样校验账号状态：禁用账号的旧 refresh 已被消费、新码不签发——「封号」自动等效「吊销全部会话」（买家与员工同规则）。账号不做物理删除。
- **[ACC-17]** 密码登录防枚举：对外失败文案恒为「手机号或密码错误」（无此用户/未设密码/密码错误三分支只进内部日志）；用户不存在或未设密码时对合法 dummy BCrypt 哈希白算一次补齐耗时；被限流时同样跑 dummy hash 且返回与登录失败一模一样的响应（不告知"被限流"）。已移除 `PASSWORD_NOT_SET` 错误码。
- **[ACC-18]** 密码登录限流双维度：IP 10 次/60 秒、手机号 5 次/600 秒（Redis 固定窗口 INCR，超限任一即拒）；登录成功清除两侧计数。
- **[ACC-19]** 双 token：access = ES256 JWT，含 `type=access`、`kind=user|staff`、jti/iss(`shop-platform`)/aud(`shop-api`) claim；买家 access 寿命 10 分钟（600_000ms），平台员工 access 寿命独立 8 小时（28_800_000ms）。refresh = 不透明随机串（前缀 `rt:` + 32 字节随机 hex），寿命 7 天；有效期权威是 Redis TTL，cookie maxAge 只是展示层。
- **[ACC-20]** refresh token 只在服务端存 HMAC-SHA256(pepper, token) 摘要不落明文；pepper 配置于 `shop.security.pepper`，生产必须 ≥32 字符（过短启动失败），未配置降级为临时值并告警（重启即在途凭证失效）。响应体刻意不序列化 refreshToken（TokenPair `@JsonIgnore`），只经 httpOnly cookie 下发。
- **[ACC-21]** refresh cookie 属性：httpOnly + Secure + SameSite=Lax，`name=refresh_token`、path 收窄到 `/auth/refresh`、maxAge 7 天；管理端独立 `name=staff_refresh_token`、path=`/admin/auth/refresh`、不设 domain。买家 refresh 端点入站双来源（Cookie 优先、Body 兜底），两者皆无 → 401 `INVALID_TOKEN`；admin 端只认 cookie。deviceId 缺省归入 `"default"` 桶。
- **[ACC-22]** refresh 一次一换（rotation，Redis GETDEL 原子消费）+ 重放裁决：已消费过的 refresh 再现，15 秒宽限期内按多标签页并发竞争处理（401 无 code，detail「登录状态正在其他页面刷新，请稍后重试」，不吊销）；超宽限期判定盗用 → 吊销该主体全部设备会话，410 + code `REFRESH_TOKEN_REUSED`。消费痕迹 TTL 30 分钟。
- **[ACC-24]** 改密（setPassword）与重置密码（resetPassword）成功后一律吊销该用户全部设备的 refresh token（全端下线）；普通登出只吊销当前 deviceId；提供登出单设备与 logout-all。重置密码对不存在的手机号静默成功（不暴露账号存在性）。
- **[ACC-25]** 双 token 域隔离：`kind=staff` 的 token 只能在 `/admin/**` 链路生效（StaffAuthFilter requireStaff=true），买家链路（JwtAuthFilter）拒绝 staff token；反之用户 token 进不了管理端。kinds 校验失败统一 401 `INVALID_TOKEN`。校验顺序：Bearer 头 → 验签 → type=access → kind → audience → 过期（`TOKEN_EXPIRED`）。access 无黑名单：改密后旧 access 最多再存活其剩余寿命（≤10 分钟），为已接受的取舍。
- **[ACC-26]** 匿名可达面（skipPaths 前缀匹配）：商品/Feed/类目/店铺/.cms 浏览、`/auth/captcha|sms-code|login/*|refresh|forgot-password|reset-password`、`/admin`（走员工链）、物流 webhook（靠报文签名，未配密钥一律 403 不 fail-open）、actuator 与 OpenAPI 文档。购物车/下单等买家写接口不豁免，需登录。非法（非规范）路径统一 400「非法请求路径」，不给绕过前缀判断留缝。
- **[ACC-27]** 买家/卖家共享会话（轻量单点登录）：web 与 seller 共用同一账号与同一 `refresh_token` cookie，生产配 `shop.auth.refresh-cookie-domain`（如 `.example.com`）后登录一处另一处自动登录；本地留空不共享。admin 不纳入共享。共享只解决身份不解决权限——卖家侧能操作什么完全由 X-Shop-Id + 成员关系在服务端裁决。

## 五、员工（Staff）账号

- **[ACC-29]** 平台员工是独立于买/卖家的第二套账号体系（`account.staff`）：登录凭证 = 工号 + 密码，不走手机验证码；员工不能自助注册，由管理员创建（员工管理 CRUD 即 P2 尚未实现）。工号全局唯一（varchar(50)，唯一索引 `uk_staff_employee_no`），密码 BCrypt 必填。
- **[ACC-30]** 员工登录失败对外统一「工号或密码错误」（工号不存在与密码错误不区分）；`StaffStatus` 非 ACTIVE → 403 + code `STAFF_DISABLED`。员工登录入口 `/admin/auth/login`，refresh 与 C 端复用同一套轮换/重放检测机制（RefreshTokenStore），但员工侧不采集 UA/IP 设备元数据，设备名固定「管理端」。
- **[ACC-31]** 员工 `me` 出参含岗位与有效权限码列表：禁用员工或未知/为空岗位一律给空权限集（如实呈现，拦截由判权层负责）；SUPER_ADMIN 展示时把通配符展开为全量具体码。

## 六、验证码规则（短信 OTP）

- **[ACC-32]** 短信验证码为 6 位数字（SecureRandom），有效期 5 分钟；Redis 只存 HMAC-SHA256(pepper, "phone:code") 摘要。登录码与重置密码码是同一套机制，仅 key 前缀与短信文案不同（重置码带「重置密码验证码: 」前缀）。
- **[ACC-33]** 发送频控四层：单 IP 10 条/分钟（429 `SMS_RATE_LIMIT`）→ 单 IP 每日不同手机号数上限默认 30（可配 `shop.auth.sms-ip-distinct-phones-max`，只限"新号码"，已见号码复发不受影响）→ 单手机号 60 秒重发冷却（429 `SMS_RATE_LIMIT`）→ 单手机号每日 20 条上限（429 `SMS_DAILY_LIMIT`）。短信发送被限流时明示 429（与密码登录被限流的静默策略相反，因该信息无枚举价值）。
- **[ACC-34]** 校验规则：同一验证码至多尝试 5 次，错满 5 次即烧码（后续输入走 `SMS_CODE_EXPIRED`）；前 4 次错误不烧码只计数（手滑友好），重发即重置尝试计数；校验成功立即消费（一次性）；无哈希（未发/过期）报 400 `SMS_CODE_EXPIRED`，码不符报 400 `SMS_CODE_INVALID`。校验接口不另设限流（猜测空间数学封顶 10⁶×5 次）。
- **[ACC-35]** 发码前置人机验证：`POST /auth/sms-code` 必须先通过图形验证码（防线顺序：人机验证 → 频控 → OTP）。图形验证码 4 位字符（字符集剔除 0/O/1/I/L 等混淆字符），答案 SHA-256 摘要存 Redis 5 分钟；校验无论成败都消费该 captchaId（防重放）；缺失 → 400 `CAPTCHA_REQUIRED`，过期 → `CAPTCHA_EXPIRED`，错误 → `CAPTCHA_INVALID`（大小写不敏感，前端据此刷新重输）。
- **[ACC-36]** 开发环境固定短信码 `666666`：仅当显式配置 `shop.auth.sms-channel=dev` 才装配 DevSmsChannel（matchIfMissing=false），生产漏配真实通道直接启动失败，不会静默留后门。dev 固定码同样清尝试计数并放行。

## 七、密码与资料

- **[ACC-37]** 密码策略：至少 8 位、UTF-8 字节数 ≤72（BCrypt 硬限制）、不能与手机号相同、不在硬编码常见弱密码黑名单（14 条，小写比较）；BCrypt cost 12。错误码不带独立 code，统一 400 文案。
- **[ACC-38]** 设置/修改密码：首次设置（passwordHash 为 NULL）不要求旧密码；已有密码必须提供正确的 currentPassword（401「当前密码错误」）；改密后全端吊销（见 ACC-24）。重置密码走短信码体系（非长 token）：先本地校验强度再消费一次性验证码。
- **[ACC-39]** 个人资料：昵称 trim 后非空且 ≤30 字（400）；avatarKey 为对象存储 key ≤255，null=不改、空串=清空；手机号在 `me`/资料出参一律脱敏为 `138****8000` 形态。头像上传走一次性 ticket 直传对象存储。
- **[ACC-40]** 手机号值对象：账号侧入参 7–20 字符 trim 直存（不做大陆格式强校验）；业务强校验处（邀请成员）用大陆手机号正则 `^1[3-9]\d{9}$`；地址联系人电话允许 `^[0-9+\-]{5,20}$`（可代收/座机）。归一化去空格/连字符/括号/点号。日志一律脱敏。

## 八、权限判定（RBAC / 判权拦截器）

- **[ACC-41]** 判权入口 = `@RequirePermission` 注解（方法级覆盖类级），value 为 ANY 语义（持有任一码即通过）；通配码 `*` 恒通过，只出现在解析层，注解上永远写具体码。权限码契约 SCREAMING_SNAKE_CASE，只增不改名不删除。
- **[ACC-42]** 受保护命名空间 `/admin/**` 与 `/seller/**` 默认拒绝：handler 缺 `@RequirePermission` → 403 `PERMISSION_DENIED`「接口未配置权限」；唯一豁免是 `/admin/auth/**` 自服务端点（登录/刷新/me/登出，只吃认证）。另有启动自检 AdminEndpointGuardTest 把漏标炸在开发期（双保险）。非法路径不进判权。
- **[ACC-43]** 判权按主体域解析：PermissionResolver 链取第一个非 null 结果——员工域（StaffContext 有值）实时查库解析岗位权限集；卖家域（ShopMemberContext 有值，由 ShopMembershipFilter 装载）OWNER → 通配 `*` 全通过，MEMBER → 被授予码集（null 当空集）。上下文不属于任何受保护域（无人认领）→ 空集 fail-close。判权每请求实时查库不做缓存：禁用/收权下一请求即生效。
- **[ACC-44]** 平台岗位 → 权限映射（枚举硬编码，改映射=改代码发版）：`SUPER_ADMIN` → 通配全通过；`REVIEWER` → `SHOP_REVIEW`；`OPS` → `CMS_MANAGE + CATEGORY_MANAGE + LOGISTICS_MANAGE`。库中未知/null role 一律空权限（fail-close）。`STAFF_MANAGE` 码已定义但无任何端点消费（仅 SUPER_ADMIN 语义预留，消费端属 P2 未实现）。
- **[ACC-45]** 全量权限码 10 个：admin 域 5（SHOP_REVIEW / CMS_MANAGE / CATEGORY_MANAGE / STAFF_MANAGE / LOGISTICS_MANAGE）+ seller 域 5（PRODUCT_MANAGE / ORDER_FULFILL / ADDRESS_MANAGE / SHIPPING_MANAGE / COUPON_MANAGE）。全部是 MANAGE 型合并码（读随写权），拆分读写的触发器=第一个「能看不能改」岗位出现。卖家侧实际注解：订单/售后/物流发货 → ORDER_FULFILL，商品 → PRODUCT_MANAGE，商家地址 → ADDRESS_MANAGE，运费模板 → SHIPPING_MANAGE，优惠券 → COUPON_MANAGE。
- **[ACC-46]** 店铺成员管理（邀请/改权/移除/列表）不走权限码，按「店主角色」裁决（`/shops/**` 不在判权命名空间内，service 层 requireOwner/requireActiveMember）；文档口径：`MEMBER_MANAGE`/`SHOP_MANAGE` 为 OWNER 固有，刻意不建权限码常量。

## 九、地址簿（买家收货地址）

- **[ACC-47]** 买家地址全部需登录（`/user/addresses`），仅本人可见——不存在或不属于当前用户一律 404「地址不存在」，不泄露他人数据存在性。列表排序：默认地址置顶，其余按创建时间倒序。
- **[ACC-48]** 每个买家至多一个默认地址：设默认（新增/编辑/设默认端点）先清本人其他默认，部分唯一索引 `uk_addresses_default`（is_default=TRUE 且未删）兜底并发；允许「无默认地址」状态——删除默认地址不自动顶替，另有显式取消默认端点（DELETE /{id}/default）。
- **[ACC-49]** 地址删除是软删（deletedAt 逻辑删除，查询自动过滤，且不把 deletedAt 序列化出 HTTP 边界）。地址独立于订单：下单结算时按 ID 跨 schema 只读（快照归 order）。
- **[ACC-50]** 地址字段校验：收件人 ≤30、电话 `^[0-9+\-]{5,20}$`（可代收≠账号手机号）、行政区划码 6 位数字且必须是 RegionRegistry 合法国标码（「行政区划代码无效」）、省/市/区各 ≤30 必填、详址 ≤120、标签 ≤20。前端 zod 镜像同样规则（不复刻默认唯一性等业务规则）。
- **[ACC-51]** 地址标签：内置枚举 HOME/WORK/SCHOOL/PARENTS/FRIEND（未指定默认 HOME），其余非空字符串视为用户自定义文案原样入库（前端自定义标签限 4 字）；前端按已知 code 渲染图标，未知值按纯文本展示。
- **[ACC-52]** 智能粘贴：一段非结构化收货文本可解析为结构化字段（第三方分词库 + RegionRegistry 区划名→国标码映射），解析不入库；收件人清洗尾部标点杂讯；收件人/手机号可能解析失败，由前端回填让用户确认。
- **[ACC-53]** 买家地址条数无上限：后端 create 不做数量校验（查询未发现任何条数闸门）。

## 十、地址簿（商家发货/退货地址）

- **[ACC-54]** 商家地址归 shop 模块（`shop.merchant_addresses`，表迁自 merchant_address schema），授权 = `ADDRESS_MANAGE` 权限码 + 成员身份（X-Shop-Id 上下文），shopId 前端不传；越店访问一律 404。单表模型：一条地址 = 地址本体 + 「默认发货」「默认退货」两个布尔，一条地址可同时承担两者；面单寄件人 = companyName（公司名称）。
- **[ACC-55]** 每店默认发货/默认退货各至多一个：设默认先清本店同类默认，部分唯一索引（未删且为默认的行）兜底并发；列表排序默认发货/默认退货置顶、其余按更新时间倒序；删除/取消默认不静默顶替，允许该店暂时无默认。
- **[ACC-56]** 商家地址字段：联系人 ≤30、电话 `^[0-9+\-]{5,20}$`、区划码 6 位国标校验、省/市必填、区/县可空（直辖市/直筒子市）、详址 ≤120、邮编可空 6 位数字、公司名 ≤60、备注 ≤200；默认标记 null 时新增视为 false、编辑保持原值。地址有 ACTIVE/DISABLED 状态维度（停用不参与快照解析，软删归 deletedAt）；api 快照解析只认「未删 + ACTIVE」。

## 全局会话与鉴权行为（横切）

- **[ACC-61]** 前端会话（三端共用 auth-kit）：access token 只存内存（auth-kit 闭包变量），不落 localStorage；refresh token 走 httpOnly cookie——cookie 安全属性见 ACC-21，买家/卖家共享会话见 ACC-27。启动时 `bootstrapAuth()` 用 refresh cookie 静默刷新一次裁决登录态：单例 Promise（多处 await 只发一次请求），refresh cookie 有效 → 换 accessToken 并裁决 authed，失败 → clear 裁决 guest；登录态三值 unknown/authed/guest 经 `useSyncExternalStore` 订阅广播，tokenStore 写入即 authed、清除即 guest。
- **[ACC-62]** 401 自动续期重发：SDK 响应拦截器收到 401 且非 refresh 端点自身时，用原生 fetch POST 各自前缀下的 refresh 端点（C 端默认 `auth/refresh`，admin 装配时传自己的），成功则写入 tokenStore 并重建重发原请求（用户无感）；refresh 失败/响应无 accessToken → 原始 401 正常冒泡。刷新失败不弹提示、不清态由消费方按 401 自行处理。
- **[ACC-63]** 设备 ID：首次 `crypto.randomUUID()` 生成并持久化 localStorage（默认键 `shop_device_id`，各端可换键隔离会话——admin 用独立键隔离），随 refresh 上报支撑多端设备列表与按设备吊销。
- **[ACC-64]** 未登录访问受保护路由：客户端导航 `beforeLoad: requireAuth()` 先 await bootstrap 裁决，未登录拉起全局登录 Dialog 并 redirect 首页（web）；SSR 首屏不裁决登录态（cookie 只在浏览器端刷），由客户端守卫（`_protected` 布局 gate）兜底。

## 错误码 → 前端行为

- **[ACC-65]** Token 类错误：`TOKEN_EXPIRED`（401，access token 过期——买家 10 分钟 / 员工 8 小时）→ 前端静默 refresh 续期，用户无感；`INVALID_TOKEN`（401，未携带/格式错/类型错/受众错/签名失败）→ 清用户状态回未登录；`REFRESH_TOKEN_REUSED`（410，重放超宽限期）→ 后端同步吊销该主体所有设备会话，前端呈现「所有设备已下线」。
- **[ACC-66]** `USER_DISABLED` / `STAFF_DISABLED`（403）：登录与鉴权时账号状态非 ACTIVE 即抛，前端展示后端 detail「账号已被禁用」；`PERMISSION_DENIED`（403）：已认证主体缺权限码（PermissionInterceptor 判权失败），前端按 403/无权限呈现，不引导重新登录。
- **[ACC-67]** 短信码错误的前端行为：`SMS_CODE_INVALID`/`SMS_CODE_EXPIRED` 使验证码输入框标红（invalid 态），用户重新输入即清错；发码按钮成功后本地起 60s 倒计时（「Ns 后重发」），倒计时/手机号合法/图形码 4 位三者齐备才可发码。
- **[ACC-68]** 图形验证码错误的前端行为：前端（共享 LoginForm）对三类图形验证码错误（`CAPTCHA_REQUIRED`/`CAPTCHA_EXPIRED`/`CAPTCHA_INVALID`，后端规则见 ACC-35）统一处理：标红输入框、刷新验证码图、清空重输；重输时只清除验证码类错误。

## 十一、已定案未实现（文档已写、代码没有）

- **[ACC-57]** 员工管理 CRUD（创建员工/分配岗位/禁用，即 `STAFF_MANAGE` 消费端，含自指禁令与末位保护）——permission-codes.md 明确标注 P2 未做；代码确无任何端点使用 STAFF_MANAGE，员工只能手工写库。
- **[ACC-58]** admin 前端导航消费 me 出参 permission 字段——文档 P2 未做。
- **[ACC-59]** auth.md §5 边界声明中仍属"故意不做"且代码确未实现：泄露密码库比对（黑名单仅硬编码 14 条占位）、短信异步化+双通道、登录风控（异地提醒/设备指纹）、Redis 故障降级、密码哈希升级检测（登录时重写旧 cost）、CSRF Token（现靠 SameSite=Lax）、access 主动登出限制（access 过期时点登出会 401，refresh cookie 等自然过期）、跨标签页登录态同步（多标签页输家显示未登录，属前端已知边界）。
- **[ACC-60]** 店铺「注销/禁用」操作端点不存在：`ShopStatus.DISABLED` 与 ACTIVE⇄DISABLED 转换在状态机注释中定义，但 shop 模块没有任何封禁/解禁/注销店铺的 service 方法或端点（封禁目前只能改库）；被拒店铺也无重新提交审核的通道。
- **[ACC-69]** DISABLED（封号）状态只有枚举与校验闸门，无禁用/启用管理端点——执行动作无产品化通道。

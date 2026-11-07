/**
 * 服务端错误码常量：<b>本文件由 `scripts/contracts/error-codes-codegen.mjs` 从 `contracts/error-codes.yaml` 生成，
 * 不要手改。</b>与 `common.ErrorCodes`（Java 那份）逐常量对应，两边相等由生成保证；
 * 「注册表 ⇄ 两份 `error.json`」与「注册表 ⇄ 抛码站点状态码」由 `ErrorCodeVocabularyTest` 核对。
 * 定义原则（只有前端无法仅凭 HTTP status 区分时才加）与判据见 {@code contracts/error-codes.yaml}。
 *
 * 前端自己判定的失败（断网 / 超时 / 取消 / 响应不合契约）**不在这份词表里**，
 * 住同目录的 `client-failure.ts`——那份词表的每个码都对得上一个 Java 常量与一处抛出点，
 * 掺进前端独有的码就需要一份豁免清单来让核对通过。
 */
export const ErrorCodes = {
    // 验证码（短信 / 图形）
    /**
     * 429 — 同一 IP 或手机号频繁请求验证码
     * 前端：按码分支：提示失败文案，并同样起 60s 重发倒计时（共享 LoginForm 的发码分支：发码成功、或失败命中此码，都进倒计时）
     */
    SMS_RATE_LIMIT: "SMS_RATE_LIMIT",
    /**
     * 429 — 同一手机号当日发送量超日限（20 条）
     * 前端：不按码分支：429 经全局错误通道 toast 展示 catalog「今日验证码已达上限」
     */
    SMS_DAILY_LIMIT: "SMS_DAILY_LIMIT",
    /**
     * 400 — 登录或重置密码的验证码超时，或输错满 5 次被当场作废
     * 前端：按码分支：提示「验证码已失效，请重新获取」，由用户手动重新发码；无自动重取流程
     */
    SMS_CODE_EXPIRED: "SMS_CODE_EXPIRED",
    /**
     * 400 — 登录或重置密码的验证码比对不通过
     * 前端：按码分支：输入框标红，提示「验证码错误」
     */
    SMS_CODE_INVALID: "SMS_CODE_INVALID",
    /**
     * 400 — 发码请求未携带 captchaId / captchaCode
     * 前端：按码分支：提示「请先完成图形验证码」，刷新验证码图
     */
    CAPTCHA_REQUIRED: "CAPTCHA_REQUIRED",
    /**
     * 400 — 图形验证码超时（5 分钟）或已被消费
     * 前端：按码分支：提示「图形验证码已过期」，自动刷新验证码图并让用户重输
     */
    CAPTCHA_EXPIRED: "CAPTCHA_EXPIRED",
    /**
     * 400 — 图形验证码比对不通过（输错或大小写不符）
     * 前端：按码分支：输入框标红，提示「图形验证码错误」，刷新验证码图
     */
    CAPTCHA_INVALID: "CAPTCHA_INVALID",

    // 令牌与会话
    /**
     * 401 — JWT access token 超过有效期
     * 前端：按码分支：只有带 TOKEN_EXPIRED 或 INVALID_TOKEN 的 401 才进「刷新 → 重放」（sdk-client 的 isTokenVerdict），其余 401 直接冒泡；刷不动才降级为未登录
     */
    TOKEN_EXPIRED: "TOKEN_EXPIRED",
    /**
     * 401 — 未携带 token、格式无效、类型/受众错误或签名校验失败
     * 前端：按码分支：与 TOKEN_EXPIRED 同一格（同进刷新重放）——两者在客户端动作上仍无可分辨，分开只为诊断
     */
    INVALID_TOKEN: "INVALID_TOKEN",
    /**
     * 410 — Refresh token 被重放，该主体全部设备会话已吊销
     * 前端：按码分支：refresh 拦截器命中此码时 tokenStore.clear() 清登录态，410 原样冒泡由全局通道 toast 展示 catalog「所有设备已下线」
     */
    REFRESH_TOKEN_REUSED: "REFRESH_TOKEN_REUSED",

    // 账号与权限
    /**
     * 403 — 买家状态非 ACTIVE
     * 前端：不按码分支：toast 展示 catalog「账号已被禁用，如需恢复请联系平台客服」；下单被拦时无额外动作
     */
    USER_DISABLED: "USER_DISABLED",
    /**
     * 403 — 平台员工状态非 ACTIVE
     * 前端：不按码分支：toast 展示 catalog「员工账号已被禁用，请联系平台管理员」
     */
    STAFF_DISABLED: "STAFF_DISABLED",
    /**
     * 403 — 已认证主体缺少接口所需权限码
     * 前端：不按码分支：与其它 403 同一条通道（toast 展示 catalog「没有执行该操作的权限」）；「无权限页」并没有实现，也不引导登录
     */
    PERMISSION_DENIED: "PERMISSION_DENIED",
    /**
     * 409 — 手机号已被注册过
     * 前端：按码分支：注册页把手机号输入框标红，提示「这个手机号已经注册过了」，并给一个「去登录」的链接
     */
    PHONE_ALREADY_REGISTERED: "PHONE_ALREADY_REGISTERED",
    /**
     * 409 — 登录名已被使用
     * 前端：按码分支：注册页把登录名输入框标红，提示「这个登录名已被使用，请换一个」
     */
    LOGIN_NAME_TAKEN: "LOGIN_NAME_TAKEN",

    // 交易
    /**
     * 409 — 预览后商品被抢空，条件扣减库存影响行数为 0
     * 前端：不按码分支：不点名具体 SKU，toast 展示 catalog「商品库存不足」，用户自行改数量/移除商品后重新结算
     */
    INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
    /**
     * 409 — 落单时价格已变（商品、数量、地址、规则版本任一变了）
     * 前端：按码分支：结算页弹「价格已变化」并展示新报价，用户确认后才重新提交；绝不静默用新价
     */
    PRICE_CHANGED: "PRICE_CHANGED",
    /**
     * 409 — 报价单已过期或已被用掉
     * 前端：按码分支：与 PRICE_CHANGED 同一格（都是「重新算一次再确认」），文案换成「报价已过期」
     */
    QUOTE_EXPIRED: "QUOTE_EXPIRED",
    /**
     * 409 — 算价时店铺没有启用中的运费模板（seller.shipping_template 无 active 行）
     * 前端：按码分支：结算页把这家店标成「暂不支持配送」并提示移出该店商品，不弹通用错误
     */
    SHIPPING_TEMPLATE_MISSING: "SHIPPING_TEMPLATE_MISSING",

    // 履约
    /**
     * 409 — 同一个运单号已经挂在别的包裹上
     * 前端：按码分支：把运单号输入框标红，提示「这个运单号已经用过了」，让商家核对是不是手误录了两遍
     */
    TRACKING_NO_REUSED: "TRACKING_NO_REUSED",

    // 物流
    /**
     * 403 — 轨迹推送验签不过（签名不符 / 时间戳过窗 / 密钥未配置）
     * 前端：不按码分支——这条码只走承运商→服务器的渠道链路，三端前端都不消费它
     */
    LOGISTICS_BAD_SIGNATURE: "LOGISTICS_BAD_SIGNATURE",

    // 运营配置
    /**
     * 409 — 配置已归档，不能再改（运费模板、促销规则共用）
     * 前端：按码分支：把这条配置标成「已归档」并刷新列表，不重试
     */
    CONFIG_ARCHIVED: "CONFIG_ARCHIVED",

    // 幂等
    /**
     * 409 — 带同一 Idempotency-Key 的请求还在处理中
     * 前端：按码分支：延时后原样重试（同键 + 同 Idempotency-Key），不弹通用错误——稍后重试会拿到首个请求的结果
     * 只包资金类写操作（pay / 商家确认退款 / 挂账退款），出口在 infra 的 Idempotency.execute
     */
    IDEMPOTENCY_IN_PROGRESS: "IDEMPOTENCY_IN_PROGRESS",

    // 类目挂载闸门
    /**
     * 400 — 商品只能挂载到叶子类目（三级）
     * 前端：不按码分支：toast 显示 catalog「请选择三级类目」；发品/编辑页类选择器引导改选三级类目
     */
    CATEGORY_NOT_LEAF: "CATEGORY_NOT_LEAF",
    /**
     * 400 — 目标类目或父链任一祖先禁用
     * 前端：不按码分支：toast 显示 catalog「该类目或其上级类目已禁用，请另选类目」；引导改选启用类目
     */
    CATEGORY_DISABLED: "CATEGORY_DISABLED",
    /**
     * 400 — 类目要求选品牌，但请求没给
     * 前端：不按码分支：品牌选择器标红，提示「该类目必须选择品牌」
     */
    BRAND_REQUIRED: "BRAND_REQUIRED",
    /**
     * 400 — 类目不允许选品牌，但请求给了
     * 前端：不按码分支：品牌选择器置灰并提示「该类目不允许选择品牌」
     */
    BRAND_FORBIDDEN: "BRAND_FORBIDDEN",
    /**
     * 400 — brandId 非空，但品牌不存在或未通过平台审核
     * 前端：不按码分支：品牌选择器标红，提示「品牌不可用」
     * 抛出点在 catalog 的 CatalogPublishService.checkBrandPolicy / SellerProductEditService.brandName；品牌状态由 /api/admin/brands 维护
     */
    BRAND_NOT_AVAILABLE: "BRAND_NOT_AVAILABLE",

    // 标准品运营
    /**
     * 400 — 合并两个分属不同类目的标准品
     * 前端：不按码分支：toast 提示「只能合并同类目的标准品」
     * 抛出点在 catalog 的 StandardProductService.merge；跨类目合并会把两个不相干的比价组并成一个
     */
    STANDARD_CATEGORY_MISMATCH: "STANDARD_CATEGORY_MISMATCH",

    // 类目配置闸门
    /**
     * 400 — 类目配置不完整，不能转 active
     * 前端：不按码分支：toast 显示「类目配置未配齐，请补齐属性模板与识别键」
     */
    CATEGORY_CONFIG_INCOMPLETE: "CATEGORY_CONFIG_INCOMPLETE",
    /**
     * 400 — 类目层级超过三层
     * 前端：不按码分支：新增按钮在三级类目上置灰，服务端兜底
     */
    CATEGORY_LEVEL_EXCEEDED: "CATEGORY_LEVEL_EXCEEDED",
    /**
     * 409 — 类目 code 已存在
     * 前端：按码分支：code 输入框标红，提示「这个类目编码已被占用」
     */
    CATEGORY_CODE_TAKEN: "CATEGORY_CODE_TAKEN",
    /**
     * 409 — 属性 code 在该类目下已存在
     * 前端：按码分支：属性 code 输入框标红
     */
    ATTRIBUTE_CODE_TAKEN: "ATTRIBUTE_CODE_TAKEN",
    /**
     * 400 — 识别属性必须是枚举或数字
     * 前端：不按码分支：属性表单里 is_identity 勾选时把 value_type 限制在 enum / number
     */
    IDENTITY_ATTRIBUTE_NEEDS_DOMAIN: "IDENTITY_ATTRIBUTE_NEEDS_DOMAIN",

    // 规格编辑闸门
    /**
     * 409 — 同一 SPU 下两个 SKU 规格组合相同
     * 前端：按码分支：读 errors 的 field 标红规格选择区，提示「规格组合重复」
     */
    DUPLICATE_SKU_SPEC: "DUPLICATE_SKU_SPEC",
    // 地址条数闸门
    /**
     * 400 — 买家新增收货地址时未删地址已达上限
     * 前端：不按码分支：toast 显示 catalog（两种语言同一句式），上限数字由 params.limit 填——后端把 20 改成 30 时这句跟着变，前端零改动；参数缺失时退回按 locale 的兜底，不印裸槽位
     */
    ADDRESS_LIMIT_EXCEEDED: "ADDRESS_LIMIT_EXCEEDED",
    // 内容合规
    /**
     * 400 — 公开文本命中违禁词（COM-01）
     * 前端：按码分支：读 errors 的 field/value 就地定位到出问题的字段（标题/卖点）并标红，命中词嵌进当前语种的那句（卖家端 product.publish.forbiddenWordHit）。拿不到字段级明细时才退成全局 toast
     */
    FORBIDDEN_WORD_HIT: "FORBIDDEN_WORD_HIT",

    // 评价
    /**
     * 400 — 评价窗口已关闭：完结 + 15 天后不可再评
     * 前端：按码分支：提示并刷新待评价列表；不重试
     */
    REVIEW_WINDOW_EXPIRED: "REVIEW_WINDOW_EXPIRED",
    /**
     * 409 — 一行一评：该行已 published（含并发双击输掉 CAS）
     * 前端：按码分支：提示「已评价过」，跳转我的评价；不重试
     */
    REVIEW_ALREADY_REVIEWED: "REVIEW_ALREADY_REVIEWED",
    /**
     * 409 — 追评已提交 / 评价未发布 / 已过 90 天窗口
     * 前端：按码分支：提示；不重试
     */
    REVIEW_ALREADY_APPENDED: "REVIEW_ALREADY_APPENDED",
    /**
     * 409 — 商家回复：已回复过，或评价非 published（hidden 行不可回复）
     * 前端：按码分支：提示并刷新列表；不重试
     */
    REVIEW_ALREADY_REPLIED: "REVIEW_ALREADY_REPLIED",
    /**
     * 409 — 已全额退款的行不可评
     * 前端：按码分支：提示并从待评价列表移除；不重试
     */
    REVIEW_LINE_REFUNDED: "REVIEW_LINE_REFUNDED",

    // 购物车
    /**
     * 400 — 加购时该 SKU 当前不可售：下架 / 停售 / 已删
     * 前端：按码分支：toast 展示 catalog「商品已下架或停售」，稍后刷新页面；不重试。并入（merge）不走本码——失效商品照收进车、列表页置灰
     */
    CART_SKU_NOT_SELLABLE: "CART_SKU_NOT_SELLABLE",
    /**
     * 400 — 加购新增条目种类时车内种类数已达上限
     * 前端：不按码分支：toast 显示 catalog「购物车最多存放 120 种商品」，上限数字由 params.limit 填；参数缺失时退回按 locale 的兜底
     */
    CART_FULL: "CART_FULL",

    // 收藏
    /**
     * 400 — 收藏新增一个尚未收藏的商品时，收藏数已超上限
     * 前端：不按码分支：toast 显示 catalog「收藏夹最多存放 500 件商品」，上限数字由 params.limit 填
     * 重复收藏同一个商品是幂等命中，不占新坑，不受它拦；抛出点在 cart 的 FavoriteService.add
     */
    FAVORITE_FULL: "FAVORITE_FULL",
} as const

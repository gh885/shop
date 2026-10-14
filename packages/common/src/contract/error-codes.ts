/**
 * 服务端错误码常量：<b>本文件由 `scripts/contracts/error-codes-codegen.mjs` 从 `contracts/error-codes.yaml` 生成，
 * 不要手改。</b>与 `common.ErrorCodes`（Java 那份）逐常量对应，两边相等由生成保证；
 * 「注册表 ⇄ 两份 `error.json`」与「注册表 ⇄ 抛码站点状态码」由 `ErrorCodeVocabularyTest` 核对。
 * 定义原则（只有前端无法仅凭 HTTP status 区分时才加）与判据见 docs/error-codes.md。
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
     * 403 — 子账号还没验过本人手机号就来登口令
     * 前端：按码分支：卖家端登录页切到子账号激活步骤（填本人手机号 + 验证码），不走「登录失败」提示
     */
    SUBACCOUNT_NOT_ACTIVATED: "SUBACCOUNT_NOT_ACTIVATED",
    /**
     * 403 — 已认证主体缺少接口所需权限码
     * 前端：不按码分支：与其它 403 同一条通道（toast 展示 catalog「没有执行该操作的权限」）；「无权限页」并没有实现，也不引导登录
     */
    PERMISSION_DENIED: "PERMISSION_DENIED",

    // 店铺
    /**
     * 400 — 店名已被全平台任一店铺占用
     * 前端：不按码分支：开店/改名表单的 zod 只管长度，撞名由全局通道 toast catalog「店名已被使用，请换一个」；字段不标红（后端这一发不带 errors）
     */
    SHOP_NAME_TAKEN: "SHOP_NAME_TAKEN",
    /**
     * 400 — 一人一店：已持有 OWNER 成员记录
     * 前端：不按码分支：toast 展示 catalog「每人最多开 1 家店铺」；开店入口没有据此置灰
     */
    SHOP_LIMIT_EXCEEDED: "SHOP_LIMIT_EXCEEDED",

    // 交易
    /**
     * 409 — 预览后商品被抢空，条件扣减库存影响行数为 0
     * 前端：不按码分支：不点名具体 SKU，toast 展示 catalog「商品库存不足」，用户自行改数量/移除商品后重新结算
     */
    INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
    /**
     * 409 — 同一用户重复领取同一张券
     * 前端：按码分支：按钮置为「已领取」并提示，不引导重试
     */
    COUPON_ALREADY_CLAIMED: "COUPON_ALREADY_CLAIMED",
    /**
     * 409 — 该订单最新一张售后单已是 REFUNDED，V1 禁止二次退款
     * 前端：不按码分支：toast 展示 catalog「该订单已退款」（终态，非可恢复冲突，不引导重试）
     */
    AFTER_SALE_ALREADY_REFUNDED: "AFTER_SALE_ALREADY_REFUNDED",

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

    // 地址条数闸门
    /**
     * 400 — 买家新增收货地址时未删地址已达上限
     * 前端：不按码分支：toast 显示 catalog（两种语言同一句式），上限数字由 params.limit 填——后端把 20 改成 30 时这句跟着变，前端零改动；参数缺失时退回按 locale 的兜底，不印裸槽位
     */
    ADDRESS_LIMIT_EXCEEDED: "ADDRESS_LIMIT_EXCEEDED",
    /**
     * 400 — 商家本店未删地址已达上限
     * 前端：不按码分支：toast 显示 catalog（上限数字由 params.limit 填，与买家端同一条通道）；参数缺失时退回按 locale 的兜底
     */
    MERCHANT_ADDRESS_LIMIT_EXCEEDED: "MERCHANT_ADDRESS_LIMIT_EXCEEDED",

    // 运营位
    /**
     * 400 — banner 失效时间不晚于生效时间
     * 前端：不按码分支：两个输入框标红发生在提交前的 zod（banner/form.ts 的 refine），能漏到后端这一发就是 toast catalog「结束时间必须晚于开始时间」
     */
    BANNER_TIME_RANGE_INVALID: "BANNER_TIME_RANGE_INVALID",

    // 内容合规
    /**
     * 400 — 公开文本命中违禁词（COM-01）
     * 前端：按码分支：读 errors 的 field/value 就地定位到出问题的字段（标题/卖点）并标红，命中词嵌进当前语种的那句（卖家端 product.publish.forbiddenWordHit）。拿不到字段级明细时才退成全局 toast
     */
    FORBIDDEN_WORD_HIT: "FORBIDDEN_WORD_HIT",
} as const

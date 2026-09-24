package com.shop.platform.common;

/**
 * 错误码常量：全后端唯一的 code 定义处，抛出点只引用这里的常量，不再各抄一遍字面量。
 *
 * <p>唯一真相源仍是 {@code docs/error-codes.md}（定义原则：只有前端无法仅凭 HTTP status 区分时才加 code）。
 * 本类是那份表的 Java 侧镜像，顺序与表一致；三边等式（Java 常量 ⇄ 文档 Code 列 ⇄
 * {@code packages/common/src/error-codes.ts}）连同「文档每一行宣称的前端落点是否真存在」由
 * {@code ErrorCodeVocabularyTest} 核对（无库、不起 Spring、纯文本 + 反射）。
 *
 * <p>为什么值得收成常量：41 处抛出点此前各写一遍字符串，而 code 拼错是<b>无声</b>的——HTTP 状态照旧、
 * detail 照旧、接口测试若只断状态码也照旧绿，只有前端那条按 code 分支的逻辑静静地永不命中，
 * 表现为「偶尔提示不精准」。同一个码最多被抄了 6 遍（{@link #INVALID_TOKEN}），改一次的代价就是漏五次的收益。
 *
 * <p>值一个字符都没改：code 会经 {@code GlobalExceptionHandler} 写进 RFC 9457 响应的 {@code code} 属性，
 * 属于对外可观测行为（但不进 {@code openapi/api-docs.json}，所以不需要 {@code pnpm gen:sdk}）。
 */
public final class ErrorCodes {

    // —— 验证码（短信 / 图形）——

    /** 同一 IP 或手机号频繁请求验证码（429） */
    public static final String SMS_RATE_LIMIT = "SMS_RATE_LIMIT";

    /** 同一手机号当日发送量超日限（429） */
    public static final String SMS_DAILY_LIMIT = "SMS_DAILY_LIMIT";

    /** 登录或重置密码的验证码超时，或输错满 5 次被当场作废（400） */
    public static final String SMS_CODE_EXPIRED = "SMS_CODE_EXPIRED";

    /** 登录或重置密码的验证码比对不通过（400） */
    public static final String SMS_CODE_INVALID = "SMS_CODE_INVALID";

    /** 发码请求未携带 captchaId / captchaCode（400） */
    public static final String CAPTCHA_REQUIRED = "CAPTCHA_REQUIRED";

    /** 图形验证码超时或已被消费（400） */
    public static final String CAPTCHA_EXPIRED = "CAPTCHA_EXPIRED";

    /** 图形验证码比对不通过（400） */
    public static final String CAPTCHA_INVALID = "CAPTCHA_INVALID";

    // —— 令牌与会话 ——

    /** JWT access token 超过有效期（401，前端静默续期的触发条件之一） */
    public static final String TOKEN_EXPIRED = "TOKEN_EXPIRED";

    /** 未携带 token、格式无效、类型/受众错误或签名校验失败（401） */
    public static final String INVALID_TOKEN = "INVALID_TOKEN";

    /** Refresh token 被重放，该主体全部设备会话已吊销（410） */
    public static final String REFRESH_TOKEN_REUSED = "REFRESH_TOKEN_REUSED";

    // —— 账号与权限 ——

    /** 买家状态非 ACTIVE（403） */
    public static final String USER_DISABLED = "USER_DISABLED";

    /** 平台员工状态非 ACTIVE（403） */
    public static final String STAFF_DISABLED = "STAFF_DISABLED";

    /** 已认证主体缺少接口所需权限码（403） */
    public static final String PERMISSION_DENIED = "PERMISSION_DENIED";

    // —— 店铺 ——

    /** 店名已被全平台任一店铺占用（400） */
    public static final String SHOP_NAME_TAKEN = "SHOP_NAME_TAKEN";

    /** 一人一店：已持有 OWNER 成员记录（400） */
    public static final String SHOP_LIMIT_EXCEEDED = "SHOP_LIMIT_EXCEEDED";

    // —— 交易 ——

    /** 预览后商品被抢空，条件扣减影响行数为 0（409） */
    public static final String INSUFFICIENT_STOCK = "INSUFFICIENT_STOCK";

    /** 同一用户重复领取同一张券（409） */
    public static final String COUPON_ALREADY_CLAIMED = "COUPON_ALREADY_CLAIMED";

    /** 该订单最新一张售后单已是 REFUNDED，V1 禁止二次退款（409） */
    public static final String AFTER_SALE_ALREADY_REFUNDED = "AFTER_SALE_ALREADY_REFUNDED";

    // —— 类目挂载闸门 ——

    /** 商品只能挂载到叶子类目（三级）（400） */
    public static final String CATEGORY_NOT_LEAF = "CATEGORY_NOT_LEAF";

    /** 目标类目或父链任一祖先禁用（400） */
    public static final String CATEGORY_DISABLED = "CATEGORY_DISABLED";

    // —— 地址条数闸门 ——

    /** 买家未删地址已达上限（400） */
    public static final String ADDRESS_LIMIT_EXCEEDED = "ADDRESS_LIMIT_EXCEEDED";

    /** 商家本店未删地址已达上限（400） */
    public static final String MERCHANT_ADDRESS_LIMIT_EXCEEDED = "MERCHANT_ADDRESS_LIMIT_EXCEEDED";

    // —— 运营位 ——

    /** banner 失效时间不晚于生效时间（含与库中原窗口合并后的两端）（400） */
    public static final String BANNER_TIME_RANGE_INVALID = "BANNER_TIME_RANGE_INVALID";

    private ErrorCodes() {}
}

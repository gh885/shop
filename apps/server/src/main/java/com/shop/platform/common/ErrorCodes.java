package com.shop.platform.common;

/**
 * 错误码常量：全后端唯一的 code 定义处，抛出点只引用这里的常量，不再各抄一遍字面量。
 *
 * <p><b>本文件由 {@code node scripts/contracts/error-codes-codegen.mjs} 从 {@code contracts/error-codes.yaml}
 * 生成，不要手改</b>——手改的那一次会在下一个人跑 {@code pnpm errors:gen} 时静默消失。
 * 加一个码或改一句说明都改那份注册表（一张码一条卡：group / code / status / behavior / trigger / notes），
 * 顺序 = 数组顺序；{@code --check} 把生成物与注册表核回来（按语义比，不按字节：排版归 spotless 管）。
 *
 * <p>定义原则（判据与普查口径见 {@code contracts/error-codes.yaml} 与本文件头）：只有前端无法仅凭 HTTP status 区分时才加 code。
 * 三边等式（Java 常量 ⇄ 注册表 ⇄ {@code packages/common/src/contract/error-codes.ts}）由生成保证，
 * 剩下两边由 {@code ErrorCodeVocabularyTest} 核对（无库、不起 Spring、纯文本 + 反射）：注册表的码集合 ⇄
 * 两份 {@code error.json}（每码每语言恰一条非空），且每处抛码站点由工厂推出的状态码 ⇄ 注册表 status 列。
 *
 * <p>为什么值得收成常量：41 处抛出点此前各写一遍字符串，而 code 拼错是<b>无声</b>的——HTTP 状态照旧、
 * detail 照旧、接口测试若只断状态码也照旧绿，只有前端那条按 code 分支的逻辑静静地永不命中，
 * 表现为「偶尔提示不精准」。同一个码最多被抄了 6 遍（{@link #INVALID_TOKEN}），改一次的代价就是漏五次的收益。
 *
 * <p>值一个字符都没改：code 会经 {@code GlobalExceptionHandler} 写进 RFC 9457 响应的 {@code code} 属性，
 * 属于对外可观测行为（但不进 {@code openapi/api-docs.json}，所以不需要 {@code pnpm sdk:gen}）。
 * 前端自己判定的失败（断网 / 超时 / 取消 / 响应不合契约）不在本类，住
 * {@code packages/common/src/contract/client-failure.ts}。
 */
public final class ErrorCodes {

    // —— 验证码（短信 / 图形） ——

    /**
     * 同一 IP 或手机号频繁请求验证码（HTTP 429）
     * <p>前端：按码分支：提示失败文案，并同样起 60s 重发倒计时（共享 LoginForm 的发码分支：发码成功、或失败命中此码，都进倒计时）
     */
    public static final String SMS_RATE_LIMIT = "SMS_RATE_LIMIT";

    /**
     * 同一手机号当日发送量超日限（20 条）（HTTP 429）
     * <p>前端：不按码分支：429 经全局错误通道 toast 展示 catalog「今日验证码已达上限」
     */
    public static final String SMS_DAILY_LIMIT = "SMS_DAILY_LIMIT";

    /**
     * 登录或重置密码的验证码超时，或输错满 5 次被当场作废（HTTP 400）
     * <p>前端：按码分支：提示「验证码已失效，请重新获取」，由用户手动重新发码；无自动重取流程
     * <p>计数上限 5 次（SmsCodeService）：第 5 次输错当场焚码，但当次响应仍是 SMS_CODE_INVALID；之后再输才因无哈希报本码。重新发码会清尝试计数。
     */
    public static final String SMS_CODE_EXPIRED = "SMS_CODE_EXPIRED";

    /**
     * 登录或重置密码的验证码比对不通过（HTTP 400）
     * <p>前端：按码分支：输入框标红，提示「验证码错误」
     */
    public static final String SMS_CODE_INVALID = "SMS_CODE_INVALID";

    /**
     * 发码请求未携带 captchaId / captchaCode（HTTP 400）
     * <p>前端：按码分支：提示「请先完成图形验证码」，刷新验证码图
     * <p>两字段在 DTO 里必填，缺失或空白在 422 就被拦住、到不了这里；本码是带的 captchaId 在服务端查不到答案（/auth/sms-code、/auth/forgot-password）。
     */
    public static final String CAPTCHA_REQUIRED = "CAPTCHA_REQUIRED";

    /**
     * 图形验证码超时（5 分钟）或已被消费（HTTP 400）
     * <p>前端：按码分支：提示「图形验证码已过期」，自动刷新验证码图并让用户重输
     */
    public static final String CAPTCHA_EXPIRED = "CAPTCHA_EXPIRED";

    /**
     * 图形验证码比对不通过（输错或大小写不符）（HTTP 400）
     * <p>前端：按码分支：输入框标红，提示「图形验证码错误」，刷新验证码图
     */
    public static final String CAPTCHA_INVALID = "CAPTCHA_INVALID";

    // —— 令牌与会话 ——

    /**
     * JWT access token 超过有效期（HTTP 401）
     * <p>前端：按码分支：只有带 TOKEN_EXPIRED 或 INVALID_TOKEN 的 401 才进「刷新 → 重放」（sdk-client 的 isTokenVerdict），其余 401 直接冒泡；刷不动才降级为未登录
     * <p>买家 10 分钟 / 员工 8 小时（application.yml）。前端静默续期的触发条件之一。
     */
    public static final String TOKEN_EXPIRED = "TOKEN_EXPIRED";

    /**
     * 未携带 token、格式无效、类型/受众错误或签名校验失败（HTTP 401）
     * <p>前端：按码分支：与 TOKEN_EXPIRED 同一格（同进刷新重放）——两者在客户端动作上仍无可分辨，分开只为诊断
     * <p>「未携带 token」也归这个码：否则请求抢在 bootstrapAuth 之前发出时，客户端无从判断「该刷一次」，只能放弃。
     */
    public static final String INVALID_TOKEN = "INVALID_TOKEN";

    /**
     * Refresh token 被重放，该主体全部设备会话已吊销（HTTP 410）
     * <p>前端：按码分支：refresh 拦截器命中此码时 tokenStore.clear() 清登录态，410 原样冒泡由全局通道 toast 展示 catalog「所有设备已下线」
     * <p>15s 并发宽限期（RefreshTokenStore）：已消费的 token 在宽限期内再被消费判为多标签页竞争，返回 401 且无 code——那一发不是本码，前端别按重放处理。
     */
    public static final String REFRESH_TOKEN_REUSED = "REFRESH_TOKEN_REUSED";

    // —— 账号与权限 ——

    /**
     * 买家状态非 ACTIVE（HTTP 403）
     * <p>前端：不按码分支：toast 展示 catalog「账号已被禁用，如需恢复请联系平台客服」；下单被拦时无额外动作
     * <p>登录/刷新，及下单闸门 OrderService.create 经 account::api 查状态。
     */
    public static final String USER_DISABLED = "USER_DISABLED";

    /**
     * 平台员工状态非 ACTIVE（HTTP 403）
     * <p>前端：不按码分支：toast 展示 catalog「员工账号已被禁用，请联系平台管理员」
     * <p>平台员工登录时（StaffService.login）。
     */
    public static final String STAFF_DISABLED = "STAFF_DISABLED";

    /**
     * 子账号还没验过本人手机号就来登口令（HTTP 403）
     * <p>前端：按码分支：卖家端登录页切到子账号激活步骤（填本人手机号 + 验证码），不走「登录失败」提示
     * <p>SubaccountService.login。激活步骤里「登录名或手机号不正确」是另一个码位（400，无 code）——那一发不区分「登录名不存在」与「号码不对」，防这个匿名端点被当成登录名枚举器。
     */
    public static final String SUBACCOUNT_NOT_ACTIVATED = "SUBACCOUNT_NOT_ACTIVATED";

    /**
     * 已认证主体缺少接口所需权限码（HTTP 403）
     * <p>前端：不按码分支：与其它 403 同一条通道（toast 展示 catalog「没有执行该操作的权限」）；「无权限页」并没有实现，也不引导登录
     * <p>PermissionInterceptor 判权失败。
     */
    public static final String PERMISSION_DENIED = "PERMISSION_DENIED";

    // —— 店铺 ——

    /**
     * 店名已被全平台任一店铺占用（HTTP 400）
     * <p>前端：不按码分支：开店/改名表单的 zod 只管长度，撞名由全局通道 toast catalog「店名已被使用，请换一个」；字段不标红（后端这一发不带 errors）
     * <p>ShopService.createShop 预检；并发撞 uk_shops_name 唯一索引兜成同一 400，不看店铺状态。
     */
    public static final String SHOP_NAME_TAKEN = "SHOP_NAME_TAKEN";

    /**
     * 一人一店：已持有 OWNER 成员记录（HTTP 400）
     * <p>前端：不按码分支：toast 展示 catalog「每人最多开 1 家店铺」；开店入口没有据此置灰
     * <p>shop.shop_members 里已 >=1 条 OWNER；被拒/被封店铺仍计数，子账号同闸。
     */
    public static final String SHOP_LIMIT_EXCEEDED = "SHOP_LIMIT_EXCEEDED";

    // —— 交易 ——

    /**
     * 预览后商品被抢空，条件扣减库存影响行数为 0（HTTP 409）
     * <p>前端：不按码分支：不点名具体 SKU，toast 展示 catalog「商品库存不足」，用户自行改数量/移除商品后重新结算
     */
    public static final String INSUFFICIENT_STOCK = "INSUFFICIENT_STOCK";

    /**
     * 同一用户重复领取同一张券（HTTP 409）
     * <p>前端：按码分支：按钮置为「已领取」并提示，不引导重试
     * <p>每人每模板限领 1 张，唯一索引兜底。
     */
    public static final String COUPON_ALREADY_CLAIMED = "COUPON_ALREADY_CLAIMED";

    // —— 类目挂载闸门 ——

    /**
     * 商品只能挂载到叶子类目（三级）（HTTP 400）
     * <p>前端：不按码分支：toast 显示 catalog「请选择三级类目」；发品/编辑页类选择器引导改选三级类目
     * <p>创建商品或草稿改挂类目时，目标类目 level != 3（CategoryService.requireMountableCategory）。
     */
    public static final String CATEGORY_NOT_LEAF = "CATEGORY_NOT_LEAF";

    /**
     * 目标类目或父链任一祖先禁用（HTTP 400）
     * <p>前端：不按码分支：toast 显示 catalog「该类目或其上级类目已禁用，请另选类目」；引导改选启用类目
     * <p>与公开树「父级不可见整支剪掉」同口径。
     */
    public static final String CATEGORY_DISABLED = "CATEGORY_DISABLED";

    // —— 规格编辑闸门 ——

    /**
     * 某规格条目的 valueIds 与 customValues 都为空（HTTP 400）
     * <p>前端：不按码分支：toast 显示 catalog「请为该规格至少选择一个取值，或填写自定义取值」
     * <p>SkuService.resolveSelections 逐条判（原 SpecSelectionRequest 的 @AssertTrue 升格为码：跨字段「至少其一」约束 rule 词表表达不了，且这句话独一份，归 code 不归 rule）。
     */
    public static final String SPEC_SELECTION_EMPTY = "SPEC_SELECTION_EMPTY";

    // —— 地址条数闸门 ——

    /**
     * 买家新增收货地址时未删地址已达上限（HTTP 400）
     * <p>前端：不按码分支：toast 显示 catalog（两种语言同一句式），上限数字由 params.limit 填——后端把 20 改成 30 时这句跟着变，前端零改动；参数缺失时退回按 locale 的兜底，不印裸槽位
     * <p>上限 20 条（AddressService.create；软删不占名额）。数字走参数通道，不写死进文案。
     */
    public static final String ADDRESS_LIMIT_EXCEEDED = "ADDRESS_LIMIT_EXCEEDED";

    /**
     * 商家本店未删地址已达上限（HTTP 400）
     * <p>前端：不按码分支：toast 显示 catalog（上限数字由 params.limit 填，与买家端同一条通道）；参数缺失时退回按 locale 的兜底
     * <p>上限 200 条（MerchantAddressService.create）。
     */
    public static final String MERCHANT_ADDRESS_LIMIT_EXCEEDED = "MERCHANT_ADDRESS_LIMIT_EXCEEDED";

    // —— 运营位 ——

    /**
     * banner 失效时间不晚于生效时间（HTTP 400）
     * <p>前端：不按码分支：两个输入框标红发生在提交前的 zod（banner/form.ts 的 refine），能漏到后端这一发就是 toast catalog「结束时间必须晚于开始时间」
     * <p>含 update 时与库中原窗口合并后的两端（ContentService.createBanner / updateBanner）。
     */
    public static final String BANNER_TIME_RANGE_INVALID = "BANNER_TIME_RANGE_INVALID";

    // —— 内容合规 ——

    /**
     * 公开文本命中违禁词（COM-01）（HTTP 400）
     * <p>前端：按码分支：读 errors 的 field/value 就地定位到出问题的字段（标题/卖点）并标红，命中词嵌进当前语种的那句（卖家端 product.publish.forbiddenWordHit）。拿不到字段级明细时才退成全局 toast
     * <p>状态码 400 不足以让前端定位到哪个字段该标红，所以这个码有真实消费方：apps/seller/src/product/forbidden-word.ts，而不是只弹一个全局 toast。出口在 ProductService.ensurePublishable 与 updateBasic（非草稿改标题或卖点）；评价与售后凭证文本 P2 复用同一出口。
     */
    public static final String FORBIDDEN_WORD_HIT = "FORBIDDEN_WORD_HIT";

    private ErrorCodes() {}
}

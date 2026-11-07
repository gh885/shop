package com.shop.platform.common;

/**
 * 错误码常量：全后端唯一的 code 定义处，抛出点只引用这里的常量，不再各抄一遍字面量。
 *
 * <p><b>本文件的来源是 {@code contracts/error-codes.yaml}。</b>主分支由 codegen 脚本从注册表生成；重写期那套脚本
 * 没恢复，改由 {@code ErrorCodeVocabularyTest} 解析注册表做双向对拍——加一个码或删一个码，只改一边就是红灯。
 * 加码时改那份注册表（一张码一条卡：group / code / status / behavior / trigger / notes），再同步这里。
 *
 * <p>定义原则（判据与普查口径见 {@code contracts/error-codes.yaml} 与本文件头）：只有前端无法仅凭 HTTP status 区分时才加 code。
 * 三边等式（Java 常量 ⇄ 注册表 ⇄ {@code packages/common/src/contract/error-codes.ts}）里，
 * 注册表 ⇄ 本文件由 {@code ErrorCodeVocabularyTest} 核对（无库、不起 Spring、纯文本 + 反射），
 * 注册表 ⇄ TS 那份目前靠两边都从同一注册表生成的历史一致性，等前端重建时补对拍。
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
     * 已认证主体缺少接口所需权限码（HTTP 403）
     * <p>前端：不按码分支：与其它 403 同一条通道（toast 展示 catalog「没有执行该操作的权限」）；「无权限页」并没有实现，也不引导登录
     * <p>PermissionInterceptor 判权失败。
     */
    public static final String PERMISSION_DENIED = "PERMISSION_DENIED";

    /**
     * 手机号已被注册过（HTTP 409）
     * <p>前端：按码分支：注册页把手机号输入框标红，提示「这个手机号已经注册过了」，并给一个「去登录」的链接
     * <p>与登录失败刻意不同口径：登录不区分「没这个号」和「密码不对」（匿名接口区分等于送一个手机号枚举器），
     * 注册必须区分，否则用户不知道自己该换号还是该去登录。
     */
    public static final String PHONE_ALREADY_REGISTERED = "PHONE_ALREADY_REGISTERED";

    /**
     * 登录名已被使用（HTTP 409）
     * <p>前端：按码分支：注册页把登录名输入框标红，提示「这个登录名已被使用，请换一个」
     * <p>与买家注册的 PHONE_ALREADY_REGISTERED 同一口径：匿名接口的冲突必须可区分，否则用户不知道该换号还是去登录。
     */
    public static final String LOGIN_NAME_TAKEN = "LOGIN_NAME_TAKEN";

    // —— 交易 ——

    /**
     * 预览后商品被抢空，条件扣减库存影响行数为 0（HTTP 409）
     * <p>前端：不按码分支：不点名具体 SKU，toast 展示 catalog「商品库存不足」，用户自行改数量/移除商品后重新结算
     */
    public static final String INSUFFICIENT_STOCK = "INSUFFICIENT_STOCK";

    /**
     * 落单时价格已变（HTTP 409）
     * <p>前端：按码分支：结算页弹「价格已变化」并展示新报价，用户确认后才重新提交；绝不静默用新价
     * <p>触发是 fingerprint 对不上：商品、数量、地址、规则版本任一变了。结算页显示 99、扣款 109 是投诉里最难解释的一类。
     */
    public static final String PRICE_CHANGED = "PRICE_CHANGED";

    /**
     * 报价单已过期或已被用掉（HTTP 409）
     * <p>前端：按码分支：与 PRICE_CHANGED 同一格（都是「重新算一次再确认」），文案换成「报价已过期」
     * <p>与 PRICE_CHANGED 分开是因为原因不同：一个是价变了，一个是这张报价没了。查问题时差别很大。
     */
    public static final String QUOTE_EXPIRED = "QUOTE_EXPIRED";

    /**
     * 店铺没有启用中的运费模板（HTTP 409）
     * <p>前端：按码分支：结算页把这家店标成「暂不支持配送」并提示移出该店商品，不弹通用错误
     * <p>买家没做错任何事，所以不是 400——那是「请求参数错」。选 409 是因为「当前状态不允许这次算价」，
     * 而且运营能据此告警去补配置。出口在 {@code QuoteCalculator.computeShipping}。
     */
    public static final String SHIPPING_TEMPLATE_MISSING = "SHIPPING_TEMPLATE_MISSING";

    // —— 履约 ——

    /**
     * 同一个运单号已经挂在别的包裹上（HTTP 409）
     * <p>前端：按码分支：把运单号输入框标红，提示「这个运单号已经用过了」，让商家核对是不是手误录了两遍
     * <p>撞 {@code uq_package_tracking}。这条拦的是重复录入——不拦的话，买家会收到两个一样的包裹，
     * 而账上两笔都算已发货。
     */
    public static final String TRACKING_NO_REUSED = "TRACKING_NO_REUSED";

    // —— 物流 ——

    /**
     * 轨迹推送验签不过（HTTP 403）
     * <p>前端：不按码分支——这条码只走承运商→服务器的渠道链路，三端前端都不消费它
     * <p>三种原因同一个码：签名不符、时间戳过窗（±5 分钟）、密钥未配置（fail closed）。
     * detail 不带具体原因，那是给攻击者的提示；签名错是攻击或配置错，重投救不了，
     * 所以不像支付回调那样回「请重试」。出口在 logistics 的 {@code TraceIngestService.ingest}。
     */
    public static final String LOGISTICS_BAD_SIGNATURE = "LOGISTICS_BAD_SIGNATURE";

    // —— 类目挂载闸门 ——

    /**
     * 商品只能挂载到叶子类目（三级）（HTTP 400）
     * <p>前端：不按码分支：toast 显示 catalog「请选择三级类目」；发品/编辑页类选择器引导改选三级类目
     * <p>创建商品或草稿改挂类目时，目标类目 level != 3（CatalogPublishService.requireCategory）。
     */
    public static final String CATEGORY_NOT_LEAF = "CATEGORY_NOT_LEAF";

    /**
     * 目标类目或父链任一祖先禁用（HTTP 400）
     * <p>前端：不按码分支：toast 显示 catalog「该类目或其上级类目已禁用，请另选类目」；引导改选启用类目
     * <p>与公开树「父级不可见整支剪掉」同口径。
     */
    public static final String CATEGORY_DISABLED = "CATEGORY_DISABLED";

    /**
     * 类目要求选品牌，但请求没给（HTTP 400）
     * <p>前端：不按码分支：品牌选择器标红，提示「该类目必须选择品牌」
     * <p>类目 brand_policy = required 且 brandId 为空（CatalogPublishService.checkBrandPolicy）。
     */
    public static final String BRAND_REQUIRED = "BRAND_REQUIRED";

    /**
     * 类目不允许选品牌，但请求给了（HTTP 400）
     * <p>前端：不按码分支：品牌选择器置灰并提示「该类目不允许选择品牌」
     * <p>类目 brand_policy = forbidden 且 brandId 非空。
     */
    public static final String BRAND_FORBIDDEN = "BRAND_FORBIDDEN";

    /**
     * 品牌不存在或未通过平台审核（HTTP 400）
     * <p>前端：不按码分支：品牌选择器标红，提示「品牌不可用」
     * <p>发布/编辑时 brandId 非空但 catalog.brand 不存在或 status != approved。
     */
    public static final String BRAND_NOT_AVAILABLE = "BRAND_NOT_AVAILABLE";

    /**
     * 合并两个不同类目的标准品（HTTP 400）
     * <p>前端：不按码分支：toast 提示「只能合并同类目的标准品」
     * <p>StandardProductService.merge；跨类目合并会把两个不相干的比价组并成一个。
     */
    public static final String STANDARD_CATEGORY_MISMATCH = "STANDARD_CATEGORY_MISMATCH";

    /**
     * 同一 SPU 下两个 SKU 规格组合相同（HTTP 409）
     * <p>前端：按码分支：读 errors 的 field 标红规格选择区，提示「规格组合重复」
     * <p>服务端按 attributeId 排序拼 spec_key 后去重（CatalogPublishService.createDraft）；
     * 并发窗口由 uq_sku_spec 兜底。
     */
    public static final String DUPLICATE_SKU_SPEC = "DUPLICATE_SKU_SPEC";

    // —— 类目配置闸门 ——

    /**
     * 类目配置不完整，不能转 active（HTTP 400）
     * <p>前端：不按码分支：toast 显示「类目配置未配齐，请补齐属性模板与识别键」
     * <p>缺属性模板、识别键为空、或 brand_policy 与属性模板冲突（CatalogConfigService.activate）。
     */
    public static final String CATEGORY_CONFIG_INCOMPLETE = "CATEGORY_CONFIG_INCOMPLETE";

    /**
     * 类目层级超过三层（HTTP 400）
     * <p>前端：不按码分支：新增按钮在三级类目上置灰，服务端兜底
     * <p>类目深度定死三层（CatalogConfigService.create）。
     */
    public static final String CATEGORY_LEVEL_EXCEEDED = "CATEGORY_LEVEL_EXCEEDED";

    /**
     * 类目 code 已存在（HTTP 409）
     * <p>前端：按码分支：code 输入框标红，提示「这个类目编码已被占用」
     * <p>code 对外稳定且不可变，ERP 和开放平台拿它对接（uq_category_code）。
     */
    public static final String CATEGORY_CODE_TAKEN = "CATEGORY_CODE_TAKEN";

    /**
     * 属性 code 在该类目下已存在（HTTP 409）
     * <p>前端：按码分支：属性 code 输入框标红
     * <p>uq_attribute_code (category_id, code)。
     */
    public static final String ATTRIBUTE_CODE_TAKEN = "ATTRIBUTE_CODE_TAKEN";

    /**
     * 识别属性必须是枚举或数字（HTTP 400）
     * <p>前端：不按码分支：属性表单里 is_identity 勾选时把 value_type 限制在 enum / number
     * <p>自由文本进参数哈希，同款归并直接失效（product-model.md §2.2.5）。
     */
    public static final String IDENTITY_ATTRIBUTE_NEEDS_DOMAIN = "IDENTITY_ATTRIBUTE_NEEDS_DOMAIN";

    // —— 地址条数闸门 ——

    /**
     * 买家新增收货地址时未删地址已达上限（HTTP 400）
     * <p>前端：不按码分支：toast 显示 catalog（两种语言同一句式），上限数字由 params.limit 填——后端把 20 改成 30 时这句跟着变，前端零改动；参数缺失时退回按 locale 的兜底，不印裸槽位
     * <p>上限 20 条（AddressService.create；软删不占名额）。数字走参数通道，不写死进文案。
     */
    public static final String ADDRESS_LIMIT_EXCEEDED = "ADDRESS_LIMIT_EXCEEDED";

    // —— 内容合规 ——

    /**
     * 公开文本命中违禁词（COM-01）（HTTP 400）
     * <p>前端：按码分支：读 errors 的 field/value 就地定位到出问题的字段（标题/卖点）并标红，命中词嵌进当前语种的那句（卖家端 product.publish.forbiddenWordHit）。拿不到字段级明细时才退成全局 toast
     * <p>状态码 400 不足以让前端定位到哪个字段该标红，所以这个码有真实消费方：apps/seller/src/product/forbidden-word.ts，而不是只弹一个全局 toast。出口在 ProductService.ensurePublishable 与 updateBasic（非草稿改标题或卖点）；评价与售后凭证文本 P2 复用同一出口。
     */
    public static final String FORBIDDEN_WORD_HIT = "FORBIDDEN_WORD_HIT";

    // —— 评价 ——

    /**
     * 评价窗口已关闭：完结 + 15 天后不可再评（HTTP 400）
     * <p>前端：按码分支：提示「评价窗口已关闭」并刷新待评价列表，把过期行移出；不重试
     * <p>过期自然关闭，不做默认好评（京东口径）——没有真实使用体验的分只会稀释评分的可信度。
     */
    public static final String REVIEW_WINDOW_EXPIRED = "REVIEW_WINDOW_EXPIRED";

    /**
     * 一行一评：该行已 published，含并发双击输掉 CAS（HTTP 409）
     * <p>前端：按码分支：提示「这个商品你已经评价过了」，跳转到我的评价；不重试
     */
    public static final String REVIEW_ALREADY_REVIEWED = "REVIEW_ALREADY_REVIEWED";

    /**
     * 追评已提交或评价尚未发布或已过 90 天窗口（HTTP 409）
     * <p>前端：按码分支：提示「追评已提交或已过追评窗口」；不重试
     */
    public static final String REVIEW_ALREADY_APPENDED = "REVIEW_ALREADY_APPENDED";

    /**
     * 商家回复：已回复过，或评价非 published（hidden 行不可回复）（HTTP 409）
     * <p>前端：按码分支：提示「已回复过，或该评价当前不可回复」，刷新评价列表；不重试
     */
    public static final String REVIEW_ALREADY_REPLIED = "REVIEW_ALREADY_REPLIED";

    /**
     * 已全额退款的行不可评——钱货两清的单没有使用体验可言（HTTP 409）
     * <p>前端：按码分支：提示「已全额退款的商品不能评价」，从待评价列表移除该行；不重试
     * <p>评后退款不追溯是已知边界（等 trade 的退款事件）。
     */
    public static final String REVIEW_LINE_REFUNDED = "REVIEW_LINE_REFUNDED";

    // —— 运营配置 ——

    /**
     * 配置已归档，不能再改（HTTP 409）
     * <p>前端：按码分支：把这条配置标成「已归档」并刷新列表，提示「已归档的配置不能再改，需要调整请新建一条」；不重试
     * <p>单看 409 分不出「归档了」和「名字重复」：前者该刷新列表，后者该标红输入框。运费模板与促销规则共用这一发。
     */
    public static final String CONFIG_ARCHIVED = "CONFIG_ARCHIVED";

    // —— 幂等 ——

    /**
     * 带同一 Idempotency-Key 的请求正在处理中（HTTP 409）
     * <p>前端：按码分支：延时后原样重试（同键 + 同 Idempotency-Key），不是弹通用错误——稍后重试会拿到首个请求的结果
     * <p>只包资金类写操作（pay / 商家确认退款 / 挂账退款）。出口在 infra 的 Idempotency.execute。
     */
    public static final String IDEMPOTENCY_IN_PROGRESS = "IDEMPOTENCY_IN_PROGRESS";

    // —— 购物车 ——

    /**
     * 加购时该 SKU 当前不可售：下架 / 停售 / 已删（HTTP 400）
     * <p>前端：按码分支：toast 展示 catalog「商品已下架或停售」，稍后刷新页面；不重试
     * <p>并入（merge）不走本码——失效商品照收进车、列表页置灰，加购闸门只拦「现在就想买」。
     * 唯一抛出点在 cart 的 CartService.add。
     */
    public static final String CART_SKU_NOT_SELLABLE = "CART_SKU_NOT_SELLABLE";

    /**
     * 加购新增条目种类时车内种类数已达上限（HTTP 400）
     * <p>前端：不按码分支：400 经全局错误通道 toast 展示 catalog「购物车最多存放 120 种商品」
     * <p>同 SKU 累加不新增种类，不受它拦。上限走 params 通道传 limit，后端改数时前端文案零改动。
     */
    public static final String CART_FULL = "CART_FULL";

    /**
     * 收藏新增一件尚未收藏的商品时，收藏数已超上限（HTTP 400）
     * <p>前端：不按码分支：400 经全局错误通道 toast 展示 catalog「收藏夹最多存放 500 件商品」
     * <p>重复收藏同一个商品是幂等命中，不占新坑，不受它拦。上限走 params 通道传 limit，后端改数时前端文案零改动。
     */
    public static final String FAVORITE_FULL = "FAVORITE_FULL";

    private ErrorCodes() {}
}

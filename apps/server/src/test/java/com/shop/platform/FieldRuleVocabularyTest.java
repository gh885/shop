package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.account.dto.AccountFieldRules;
import com.shop.platform.account.dto.AddressParseRequest;
import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.dto.ConfirmDeletionRequest;
import com.shop.platform.account.dto.LoginRequest;
import com.shop.platform.account.dto.PasswordLoginRequest;
import com.shop.platform.account.dto.RefreshRequest;
import com.shop.platform.account.dto.ResetPasswordRequest;
import com.shop.platform.account.dto.SetPasswordRequest;
import com.shop.platform.account.dto.SmsCodeRequest;
import com.shop.platform.account.dto.SmsLoginRequest;
import com.shop.platform.account.dto.UpdateProfileRequest;
import com.shop.platform.aftersale.dto.ApplyAfterSaleRequest;
import com.shop.platform.aftersale.dto.RejectAfterSaleRequest;
import com.shop.platform.aftersale.dto.ReturnGoodsRequest;
import com.shop.platform.audit.dto.AuditFieldRules;
import com.shop.platform.cart.dto.AddCartItemRequest;
import com.shop.platform.cart.dto.UpdateCartItemRequest;
import com.shop.platform.cms.dto.BannerRequest;
import com.shop.platform.cms.dto.CmsFieldRules;
import com.shop.platform.cms.dto.NavRequest;
import com.shop.platform.cms.dto.RecommendTabRequest;
import com.shop.platform.common.AddressFieldRules;
import com.shop.platform.common.NoteFieldRules;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.Quantities;
import com.shop.platform.common.TrackingFieldRules;
import com.shop.platform.coupon.dto.CouponFieldRules;
import com.shop.platform.coupon.dto.CreateCouponTemplateRequest;
import com.shop.platform.logistics.dto.CreateShipmentRequest;
import com.shop.platform.logistics.dto.ResolveIssueRequest;
import com.shop.platform.logistics.dto.TrackingNodeRequest;
import com.shop.platform.order.dto.CancelOrderRequest;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.product.dto.CategoryAttrRequest;
import com.shop.platform.product.dto.CategoryAttrValueRequest;
import com.shop.platform.product.dto.CategoryFieldRules;
import com.shop.platform.product.dto.CreateCategoryRequest;
import com.shop.platform.product.dto.CreateProductRequest;
import com.shop.platform.product.dto.ProductFieldRules;
import com.shop.platform.product.dto.ProductQuery;
import com.shop.platform.product.dto.SkuUpdateItem;
import com.shop.platform.product.dto.SpecSelectionRequest;
import com.shop.platform.product.dto.UpdateCategoryRequest;
import com.shop.platform.product.dto.UpdateProductRequest;
import com.shop.platform.product.dto.UpdateSpecsRequest;
import com.shop.platform.product.model.ParamItem;
import com.shop.platform.product.service.CategoryService;
import com.shop.platform.recommend.dto.FeedQuery;
import com.shop.platform.shop.dto.CreateShopRequest;
import com.shop.platform.shop.dto.MerchantAddressRequest;
import com.shop.platform.shop.dto.RejectRequest;
import com.shop.platform.shop.dto.ShippingTemplateRequest;
import com.shop.platform.shop.dto.ShopFieldRules;
import com.shop.platform.testsupport.SourceScanner;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.lang.annotation.Annotation;
import java.lang.reflect.AnnotatedParameterizedType;
import java.lang.reflect.AnnotatedType;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.IntSupplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * 入站字段的<b>数字</b>词表门禁：一个上限只有一个定义处，且这四处真相源仍然是同一个数。
 *
 * <p>同一个数字在这个仓库里最多同时住在四个地方，彼此隔着一层构建产物：
 * <ol>
 *   <li><b>Java 具名常量</b>（{@link Quantities} / {@link AddressFieldRules} / {@link AccountFieldRules}
 *       / {@link TrackingFieldRules}）——注解元素值必须是编译期常量，所以词表只能写成常量；
 *   <li><b>编译进字节码的注解值</b>——本类用反射读它，读的是真值而不是源码；
 *   <li><b>已发布契约</b> {@code openapi/api-docs.json}——springdoc 把 {@code maxLength / maxItems / maximum /
 *       pattern} 原样导出，前端 SDK 与 zod 校验照着它编译；
 *   <li><b>库上那一格</b>——{@code VARCHAR(n)} 列宽与 {@code CHECK (quantity BETWEEN 1 AND n)} 上界，
 *       以及前端表单自己抄的一份（{@code packages/common/src/address.ts}、{@code tracking.ts}）。
 * </ol>
 *
 * <p><b>为什么值得单独立一道门禁</b>：这四边今天全靠人肉对齐，而漂移是无声的——常量改了数字，契约那一格
 * 直到下次 {@code pnpm gen:sdk} 才会露馅；DTO 放宽到 50 而某张表的投影列还是 32，也不会有任何测试变红，
 * 只会在用户填了一个正常长度的值时落一个 500（{@code aftersale.tickets.return_logistics_company} 正是这么错的，
 * 由 V66 修掉）。前端那句「与后端 @Size 对齐」的散文注释同样不构成依据：注释不会报错。
 *
 * <p><b>与 {@code ApiDocsContractTest} 的分工</b>：那道闸门比对"运行中的 springdoc 输出 vs 契约文件"，覆盖面大得多，
 * 但需要起完整应用上下文（含库）。本类不连库、不起 Spring，只守数字这一小片，
 * 因此也是没有本地数据源时唯一还能跑的契约核对。两者互补：那条管"整份契约没变"，这条管"这四个数还是同一个数、
 * 且只有一个定义处"。改数字是有意的接口变更时，先跑 {@code pnpm gen:sdk} 再改词表，两边一起红才是正常流程。
 *
 * <p>方向刻意不对称：入站上限<b>允许比列宽更紧</b>（昵称走 {@link AccountFieldRules#NICKNAME_MAX}，
 * 而 {@code account.users.nickname} 那一格更宽——
 * 早一步在 400 挡住比让脏值撞列宽好），但不允许更松（越过列宽就是 500）。DB 兜底那一格
 * （件数 CHECK）则要求<b>相等</b>：入口比 DB 宽时，超出的件数会被 {@code LEAST} 静默改写而不是被拒。
 *
 * <p><b>第五边：前端</b>。这一族原本只核 Java 常量 ⇄ 注解 ⇄ 契约 ⇄ 迁移，前端那一边的核对是一份手写的
 * 镜像清单——清单只证明「登记过的都对」，不证明「没有漏登记的」。本轮就是这么露馅的：
 * {@code MAX_CART_QUANTITY = 999}、{@code PDP_MAX_QUANTITY = 99}、{@code COUPON_MAX_TOTAL = 1_000_000}
 * 三个从 Java 手抄过来的数既不在清单里，也不被「扫裸字面量」那条看见（{@link #INLINE_BOUND} 只认
 * {@code maxLength={N}} 与 {@code .max(N)} 那几种写法，起了名字的抄它看不见）。现在
 * {@code 前端数值边界只许登记成三种对边之一} 从源码扫出全部具名边界，要求它与
 * {@link #APP_MIRRORS}（对契约）∪ {@link #JAVA_TWINS}（对 Java 常量）∪ {@link #POLICY_NUMBERS}
 * （登记在案的无对边策略，必须写理由）<b>双向相等</b>：新增不登记就红，删掉或改名而不销登记也红。
 */
class FieldRuleVocabularyTest {

    private static final Path MAIN_JAVA = Path.of("src", "main", "java");
    private static final Path MIGRATIONS = Path.of("src", "main", "resources", "db", "migration");
    private static final Path REPO_ROOT = Path.of("..", "..");
    private static final Path TS_COMMON = REPO_ROOT.resolve(Path.of("packages", "common", "src"));
    private static final Path COMMITTED_SPEC = REPO_ROOT.resolve(Path.of("openapi", "api-docs.json"));

    /** 必须声明在 {@link #DB} 之前：静态初始化按源码顺序跑，回放迁移的过滤器要用到它 */
    private static final Pattern MIGRATION_NAME = Pattern.compile("^V(\\d+)__.+\\.sql$");

    /**
     * JSX 的 {@code maxLength={200}}、对象字面量的 {@code maxLength: 200}，和 zod 的 {@code .max(200, "…")}：
     * 三种裸写法都算。
     *
     * <p>最后一种是本轮补的：卖家端地址表单里 {@code maxLength: NOTE_MAX} 与 {@code .max(200, "备注最长 200 字")}
     * 并排写在同一个文件中——只扫 {@code maxLength} 会漏掉真正拦提交的那一格，于是「owner 已就位、校验仍写死」
     * 可以长期存在而无人看见。跨行链式写法用 DOTALL 一起收（当前代码里还没有链到下一行的 {@code .max(}）。
     */
    private static final Pattern INLINE_BOUND =
            Pattern.compile("maxLength\\s*(?:=\\{|:)\\s*\\d|(?s)\\.max\\(\\s*\\d{2,}\\s*[,)]");

    /**
     * 前端把数字边界写成具名常量的名字形状：{@code *_MAX} / {@code MAX_*} / {@code *_MIN} / {@code *_LIMIT}
     * / {@code *_DIGITS} / {@code *_COUNT} / {@code *_SIZE} / {@code *_LENGTH}。
     *
     * <p>{@link #INLINE_BOUND} 只拦「数字直接写在校验调用上」那三种写法，<b>看不见</b>
     * {@code export const MAX_CART_QUANTITY = 999} 这种「先起个名字再抄一遍」的形态——本轮就是被这三个数
     * （车 999、详情页 99、券发行量 100 万）证明的洞：名字看着像 owner，值却是手抄的，契约改了它不跟着改。
     * 于是这里把这类名字全数扫出来，要求每一个都登记成三张表之一，见
     * {@code 前端数值边界只许登记成三种对边之一}。
     */
    private static final Pattern BOUND_NAME = Pattern.compile("(^|_)(MAX|MIN|LIMIT|DIGITS|COUNT|SIZE|LENGTH)(_|$)");

    /** 名字带单位的量的是展示与传输策略（px / MB / 秒），契约里没有可比的那一边，不进 census */
    private static final Pattern BOUND_UNIT_SUFFIX =
            Pattern.compile("(PIXELS?|WIDTH|HEIGHT|PX|REM|MB|KB|GB|MS|SECONDS?|MINUTES?|HOURS?|DAYS?|AGE)$");

    /** {@code const NAME[: number] = 123[_456]}，容忍 {@code as const}；右值必须是裸整数，算式不算 */
    private static final Pattern BOUND_DECL = Pattern.compile(
            "^[ \\t]*(?:export[ \\t]+)?const[ \\t]+([A-Z][A-Z0-9_]*)"
                    + "[ \\t]*(?::[ \\t]*number)?[ \\t]*=[ \\t]*([0-9][0-9_]*)"
                    + "[ \\t]*(?:as[ \\t]+const)?[ \\t]*(?:[,;)]|$)",
            Pattern.MULTILINE);

    /** census 扫的六个 TS 根，与 {@link #INLINE_BOUND} 那条同一把尺子 */
    private static final List<String> TS_ROOTS = List.of(
            "apps/web/src",
            "apps/seller/src",
            "apps/admin/src",
            "packages/common/src",
            "packages/app-kit/src",
            "packages/ui-web/src");

    /**
     * Java 侧把数字直接写进校验注解的形态：{@code @Size} / {@code @Min} / {@code @Max} 的边界，
     * 以及 {@code @Pattern} 的形状（正则里的位数同样是这个数字规则）。
     */
    private static final Pattern NUMERIC_VALIDATION =
            Pattern.compile("@(Size|Min|Max|Pattern|DecimalMin|DecimalMax)\\(([^)]*)\\)");

    /**
     * 允许在校验注解上直接写数字的类——<b>今天为空</b>，这是刻意的：owner 是纯常量类，它们的数字不在注解里，
     * 而所有<b>用</b>数字的地方都只许引用它们。留这一个口子是为了不必把某个类改造成 owner 也能登记例外
     * （加进来要在 {@code docs/business-rules/crosscut.md} 写明为什么）。
     */
    private static final Set<String> RULE_OWNERS = Set.of();

    private static final ObjectMapper MAPPER = JsonMapper.builder().build();
    private static final JsonNode SPEC = readSpec();
    private static final Map<String, Integer> DB = dbNumbers();

    /**
     * 一条数字规则：某个 DTO 组件上的某个上限，它的词表名字、契约里对应的键、以及它最终落进的库上的格子。
     *
     * @param ownerToken 词表常量的具名写法，用于源码侧「不许退回字面量」那一条
     * @param columns    {@code schema.table.column}；该键在迁移里的值即列宽或 CHECK 上界，可为空
     */
    private record Rule(
            Class<?> dto, String component, int ownerValue, String ownerToken, String contractKey, String... columns) {

        String schema() {
            return dto.getSimpleName();
        }

        @Override
        public String toString() {
            return schema() + "." + component + " " + contractKey;
        }
    }

    private static final List<Rule> RULES = List.of(
            // —— 地址：买家收货与商家寄退同一份，列宽即上限
            new Rule(
                    AddressRequest.class,
                    "receiverName",
                    AddressFieldRules.NAME_MAX,
                    "AddressFieldRules.NAME_MAX",
                    "maxLength",
                    "account.addresses.receiver_name"),
            new Rule(
                    AddressRequest.class,
                    "province",
                    AddressFieldRules.NAME_MAX,
                    "AddressFieldRules.NAME_MAX",
                    "maxLength",
                    "account.addresses.province"),
            new Rule(
                    AddressRequest.class,
                    "city",
                    AddressFieldRules.NAME_MAX,
                    "AddressFieldRules.NAME_MAX",
                    "maxLength",
                    "account.addresses.city"),
            new Rule(
                    AddressRequest.class,
                    "district",
                    AddressFieldRules.NAME_MAX,
                    "AddressFieldRules.NAME_MAX",
                    "maxLength",
                    "account.addresses.district"),
            new Rule(
                    AddressRequest.class,
                    "detail",
                    AddressFieldRules.DETAIL_MAX,
                    "AddressFieldRules.DETAIL_MAX",
                    "maxLength",
                    "account.addresses.detail"),
            new Rule(
                    AddressRequest.class,
                    "label",
                    AddressFieldRules.LABEL_MAX,
                    "AddressFieldRules.LABEL_MAX",
                    "maxLength",
                    "account.addresses.label"),
            new Rule(
                    MerchantAddressRequest.class,
                    "contactName",
                    AddressFieldRules.NAME_MAX,
                    "AddressFieldRules.NAME_MAX",
                    "maxLength",
                    "shop.addresses.contact_name"),
            new Rule(
                    MerchantAddressRequest.class,
                    "province",
                    AddressFieldRules.NAME_MAX,
                    "AddressFieldRules.NAME_MAX",
                    "maxLength",
                    "shop.addresses.province"),
            new Rule(
                    MerchantAddressRequest.class,
                    "district",
                    AddressFieldRules.NAME_MAX,
                    "AddressFieldRules.NAME_MAX",
                    "maxLength",
                    "shop.addresses.district"),
            new Rule(
                    MerchantAddressRequest.class,
                    "detail",
                    AddressFieldRules.DETAIL_MAX,
                    "AddressFieldRules.DETAIL_MAX",
                    "maxLength",
                    "shop.addresses.detail"),
            // —— 账号：一个数被四个登录/改密入口共用
            new Rule(
                    PasswordLoginRequest.class,
                    "phone",
                    AccountFieldRules.PHONE_MAX,
                    "AccountFieldRules.PHONE_MAX",
                    "maxLength",
                    "account.users.phone"),
            new Rule(
                    PasswordLoginRequest.class,
                    "phone",
                    AccountFieldRules.PHONE_MIN,
                    "AccountFieldRules.PHONE_MIN",
                    "minLength",
                    "account.users.phone"),
            new Rule(
                    SmsLoginRequest.class,
                    "code",
                    AccountFieldRules.SMS_CODE_LENGTH,
                    "AccountFieldRules.SMS_CODE_LENGTH",
                    "maxLength"),
            new Rule(
                    SmsLoginRequest.class,
                    "code",
                    AccountFieldRules.SMS_CODE_LENGTH,
                    "AccountFieldRules.SMS_CODE_LENGTH",
                    "minLength"),
            new Rule(
                    ResetPasswordRequest.class,
                    "newPassword",
                    AccountFieldRules.PASSWORD_MIN,
                    "AccountFieldRules.PASSWORD_MIN",
                    "minLength"),
            new Rule(
                    ResetPasswordRequest.class,
                    "newPassword",
                    AccountFieldRules.PASSWORD_MAX,
                    "AccountFieldRules.PASSWORD_MAX",
                    "maxLength"),
            new Rule(
                    LoginRequest.class,
                    "password",
                    AccountFieldRules.PASSWORD_MIN,
                    "AccountFieldRules.PASSWORD_MIN",
                    "minLength"),
            new Rule(
                    SetPasswordRequest.class,
                    "currentPassword",
                    AccountFieldRules.PASSWORD_MAX,
                    "AccountFieldRules.PASSWORD_MAX",
                    "maxLength"),
            new Rule(
                    LoginRequest.class,
                    "deviceId",
                    AccountFieldRules.DEVICE_ID_MAX,
                    "AccountFieldRules.DEVICE_ID_MAX",
                    "maxLength"),
            new Rule(
                    RefreshRequest.class,
                    "deviceId",
                    AccountFieldRules.DEVICE_ID_MAX,
                    "AccountFieldRules.DEVICE_ID_MAX",
                    "maxLength"),
            new Rule(
                    UpdateProfileRequest.class,
                    "nickname",
                    AccountFieldRules.NICKNAME_MAX,
                    "AccountFieldRules.NICKNAME_MAX",
                    "maxLength",
                    "account.users.nickname"),
            // —— 交易数量：入口门与 DB 兜底同一数
            new Rule(
                    OrderLineRequest.class,
                    "quantity",
                    Quantities.LINE_QUANTITY_MAX,
                    "Quantities.LINE_QUANTITY_MAX",
                    "maximum",
                    "cart.items.quantity",
                    "orders.items.quantity"),
            new Rule(
                    AddCartItemRequest.class,
                    "quantity",
                    Quantities.LINE_QUANTITY_MAX,
                    "Quantities.LINE_QUANTITY_MAX",
                    "maximum",
                    "cart.items.quantity"),
            new Rule(
                    UpdateCartItemRequest.class,
                    "quantity",
                    Quantities.LINE_QUANTITY_MAX,
                    "Quantities.LINE_QUANTITY_MAX",
                    "maximum",
                    "cart.items.quantity"),
            new Rule(
                    CreateOrderRequest.class,
                    "lines",
                    Quantities.ORDER_LINES_MAX,
                    "Quantities.ORDER_LINES_MAX",
                    "maxItems"),
            new Rule(
                    PreviewOrderRequest.class,
                    "lines",
                    Quantities.ORDER_LINES_MAX,
                    "Quantities.ORDER_LINES_MAX",
                    "maxItems"),
            new Rule(
                    PreviewOrderRequest.class,
                    "userCouponIds",
                    Quantities.COUPONS_PER_CHECKOUT_MAX,
                    "Quantities.COUPONS_PER_CHECKOUT_MAX",
                    "maxItems"),
            // —— 商品：创建与编辑同一份，卖家端两处表单再镜像一次（镜像见 APP_MIRRORS）
            new Rule(
                    CreateProductRequest.class,
                    "name",
                    ProductFieldRules.NAME_MAX,
                    "ProductFieldRules.NAME_MAX",
                    "maxLength",
                    "product.products.name"),
            new Rule(
                    UpdateProductRequest.class,
                    "name",
                    ProductFieldRules.NAME_MAX,
                    "ProductFieldRules.NAME_MAX",
                    "maxLength",
                    "product.products.name"),
            // —— 运单：卖家发货与买家回寄两条路径，同一批列
            new Rule(
                    CreateShipmentRequest.class,
                    "carrierCode",
                    TrackingFieldRules.CARRIER_CODE_MAX,
                    "TrackingFieldRules.CARRIER_CODE_MAX",
                    "maxLength",
                    "logistics.carriers.code"),
            new Rule(
                    CreateShipmentRequest.class,
                    "trackingNo",
                    TrackingFieldRules.TRACKING_NO_MAX,
                    "TrackingFieldRules.TRACKING_NO_MAX",
                    "maxLength",
                    "logistics.shipments.tracking_no",
                    "orders.orders.tracking_no"),
            new Rule(
                    ReturnGoodsRequest.class,
                    "carrierCode",
                    TrackingFieldRules.CARRIER_CODE_MAX,
                    "TrackingFieldRules.CARRIER_CODE_MAX",
                    "maxLength",
                    "logistics.carriers.code"),
            new Rule(
                    ReturnGoodsRequest.class,
                    "logisticsCompany",
                    TrackingFieldRules.CARRIER_NAME_MAX,
                    "TrackingFieldRules.CARRIER_NAME_MAX",
                    "maxLength",
                    "logistics.shipments.carrier_name",
                    "aftersale.tickets.return_logistics_company"),
            new Rule(
                    ReturnGoodsRequest.class,
                    "trackingNo",
                    TrackingFieldRules.TRACKING_NO_MAX,
                    "TrackingFieldRules.TRACKING_NO_MAX",
                    "maxLength",
                    "aftersale.tickets.return_tracking_no"),
            // —— 一段人写的说明：七个入口同一个数，落点各是一列 VARCHAR(200)
            new Rule(
                    AddressParseRequest.class,
                    "text",
                    AddressFieldRules.PARSE_TEXT_MAX,
                    "AddressFieldRules.PARSE_TEXT_MAX",
                    "maxLength"),
            new Rule(
                    ApplyAfterSaleRequest.class,
                    "reason",
                    NoteFieldRules.FREE_TEXT_MAX,
                    "NoteFieldRules.FREE_TEXT_MAX",
                    "maxLength",
                    "aftersale.tickets.reason"),
            new Rule(
                    RejectAfterSaleRequest.class,
                    "reason",
                    NoteFieldRules.FREE_TEXT_MAX,
                    "NoteFieldRules.FREE_TEXT_MAX",
                    "maxLength",
                    "aftersale.ticket_events.note"),
            new Rule(
                    CancelOrderRequest.class,
                    "reason",
                    NoteFieldRules.FREE_TEXT_MAX,
                    "NoteFieldRules.FREE_TEXT_MAX",
                    "maxLength",
                    "orders.orders.cancel_reason"),
            new Rule(
                    CreateOrderRequest.class,
                    "buyerMessage",
                    NoteFieldRules.FREE_TEXT_MAX,
                    "NoteFieldRules.FREE_TEXT_MAX",
                    "maxLength",
                    "orders.orders.buyer_message"),
            new Rule(
                    ResolveIssueRequest.class,
                    "note",
                    NoteFieldRules.FREE_TEXT_MAX,
                    "NoteFieldRules.FREE_TEXT_MAX",
                    "maxLength",
                    "logistics.shipment_issues.detail"),
            new Rule(
                    MerchantAddressRequest.class,
                    "note",
                    NoteFieldRules.FREE_TEXT_MAX,
                    "NoteFieldRules.FREE_TEXT_MAX",
                    "maxLength",
                    "shop.addresses.note"),
            new Rule(
                    TrackingNodeRequest.class,
                    "description",
                    NoteFieldRules.FREE_TEXT_MAX,
                    "NoteFieldRules.FREE_TEXT_MAX",
                    "maxLength",
                    "logistics.tracking_nodes.description"),
            // —— 首页内容：三个运营表单共用一份长度口径
            new Rule(
                    BannerRequest.class,
                    "slot",
                    CmsFieldRules.KEY_MAX,
                    "CmsFieldRules.KEY_MAX",
                    "maxLength",
                    "cms.banners.slot"),
            new Rule(
                    BannerRequest.class,
                    "title",
                    CmsFieldRules.TITLE_MAX,
                    "CmsFieldRules.TITLE_MAX",
                    "maxLength",
                    "cms.banners.title"),
            new Rule(
                    BannerRequest.class,
                    "subtitle",
                    CmsFieldRules.SUBTITLE_MAX,
                    "CmsFieldRules.SUBTITLE_MAX",
                    "maxLength",
                    "cms.banners.subtitle"),
            new Rule(
                    NavRequest.class,
                    "navKey",
                    CmsFieldRules.KEY_MAX,
                    "CmsFieldRules.KEY_MAX",
                    "maxLength",
                    "cms.nav_entries.nav_key"),
            new Rule(
                    NavRequest.class,
                    "title",
                    CmsFieldRules.TITLE_MAX,
                    "CmsFieldRules.TITLE_MAX",
                    "maxLength",
                    "cms.nav_entries.title"),
            new Rule(
                    NavRequest.class,
                    "iconKey",
                    CmsFieldRules.KEY_MAX,
                    "CmsFieldRules.KEY_MAX",
                    "maxLength",
                    "cms.nav_entries.icon_key"),
            new Rule(
                    NavRequest.class, "subs", CmsFieldRules.SUB_GROUPS_MAX, "CmsFieldRules.SUB_GROUPS_MAX", "maxItems"),
            new Rule(
                    RecommendTabRequest.class,
                    "name",
                    CmsFieldRules.TAB_NAME_MAX,
                    "CmsFieldRules.TAB_NAME_MAX",
                    "maxLength",
                    "cms.recommend_tabs.name"),
            // —— 跳转与外链：三个 target 同宽，banner 的 imageUrl/link 另成一档（概念不同，见 CmsFieldRules）
            new Rule(
                    BannerRequest.class,
                    "target",
                    CmsFieldRules.TARGET_MAX,
                    "CmsFieldRules.TARGET_MAX",
                    "maxLength",
                    "cms.banners.target"),
            new Rule(
                    NavRequest.class,
                    "target",
                    CmsFieldRules.TARGET_MAX,
                    "CmsFieldRules.TARGET_MAX",
                    "maxLength",
                    "cms.nav_entries.target"),
            new Rule(
                    RecommendTabRequest.class,
                    "target",
                    CmsFieldRules.TARGET_MAX,
                    "CmsFieldRules.TARGET_MAX",
                    "maxLength",
                    "cms.recommend_tabs.target"),
            new Rule(
                    BannerRequest.class,
                    "imageUrl",
                    CmsFieldRules.URL_MAX,
                    "CmsFieldRules.URL_MAX",
                    "maxLength",
                    "cms.banners.image_url"),
            new Rule(
                    BannerRequest.class,
                    "link",
                    CmsFieldRules.URL_MAX,
                    "CmsFieldRules.URL_MAX",
                    "maxLength",
                    "cms.banners.link"),
            // —— 券名：只有这一个入口用它，但文案把同一个数抄了第二遍，所以也归词表管
            new Rule(
                    CreateCouponTemplateRequest.class,
                    "name",
                    CouponFieldRules.NAME_MAX,
                    "CouponFieldRules.NAME_MAX",
                    "maxLength",
                    "coupon.coupon_templates.name"),
            // —— 券发行总量：库上那道 CHECK 只管 >0，上界只存在于入口这一侧，所以没有列可对
            new Rule(
                    CreateCouponTemplateRequest.class,
                    "totalQuantity",
                    CouponFieldRules.TOTAL_QUANTITY_MAX,
                    "CouponFieldRules.TOTAL_QUANTITY_MAX",
                    "maximum"),
            // —— 账号：工号是登录账号（唯一索引），图形码那一格只有容量档
            new Rule(
                    LoginRequest.class,
                    "employeeNo",
                    AccountFieldRules.EMPLOYEE_NO_MAX,
                    "AccountFieldRules.EMPLOYEE_NO_MAX",
                    "maxLength",
                    "account.staff.employee_no"),
            new Rule(
                    SmsCodeRequest.class,
                    "captchaCode",
                    AccountFieldRules.CAPTCHA_CODE_MAX,
                    "AccountFieldRules.CAPTCHA_CODE_MAX",
                    "maxLength"),
            // 这两格曾是 owner 之外仅存的「带数字的入站注解」：一个撞在 200 上、一个撞在 255 上
            new Rule(
                    RefreshRequest.class,
                    "refreshToken",
                    AccountFieldRules.REFRESH_TOKEN_MAX,
                    "AccountFieldRules.REFRESH_TOKEN_MAX",
                    "maxLength"),
            new Rule(
                    UpdateProfileRequest.class,
                    "avatarKey",
                    AccountFieldRules.AVATAR_KEY_MAX,
                    "AccountFieldRules.AVATAR_KEY_MAX",
                    "maxLength",
                    "account.users.avatar_key"),
            // —— 运单：补录节点的「发生地」是手打的一句网点名，落点是它自己那一列
            new Rule(
                    TrackingNodeRequest.class,
                    "location",
                    TrackingFieldRules.LOCATION_MAX,
                    "TrackingFieldRules.LOCATION_MAX",
                    "maxLength",
                    "logistics.tracking_nodes.location"),
            // —— 类目与它的属性模板：运营两个弹窗，条目落各自那一列
            new Rule(
                    CreateCategoryRequest.class,
                    "name",
                    CategoryFieldRules.NAME_MAX,
                    "CategoryFieldRules.NAME_MAX",
                    "maxLength",
                    "product.categories.name"),
            new Rule(
                    CreateCategoryRequest.class,
                    "iconUrl",
                    CategoryFieldRules.ICON_MAX,
                    "CategoryFieldRules.ICON_MAX",
                    "maxLength",
                    "product.categories.icon_url"),
            new Rule(
                    UpdateCategoryRequest.class,
                    "name",
                    CategoryFieldRules.NAME_MAX,
                    "CategoryFieldRules.NAME_MAX",
                    "maxLength",
                    "product.categories.name"),
            new Rule(
                    UpdateCategoryRequest.class,
                    "iconUrl",
                    CategoryFieldRules.ICON_MAX,
                    "CategoryFieldRules.ICON_MAX",
                    "maxLength",
                    "product.categories.icon_url"),
            new Rule(
                    CategoryAttrRequest.class,
                    "name",
                    CategoryFieldRules.ATTR_NAME_MAX,
                    "CategoryFieldRules.ATTR_NAME_MAX",
                    "maxLength",
                    "product.category_attrs.name"),
            new Rule(
                    CategoryAttrValueRequest.class,
                    "value",
                    CategoryFieldRules.ATTR_VALUE_MAX,
                    "CategoryFieldRules.ATTR_VALUE_MAX",
                    "maxLength",
                    "product.category_attr_values.value"),
            // 这一格是全部门禁里唯一由「ADD COLUMN IF NOT EXISTS」加出来的列：扫描器漏了那段写法它就静默不存在
            new Rule(
                    CategoryAttrValueRequest.class,
                    "image",
                    CategoryFieldRules.ATTR_VALUE_IMAGE_MAX,
                    "CategoryFieldRules.ATTR_VALUE_IMAGE_MAX",
                    "maxLength",
                    "product.category_attr_values.image"),
            // —— 商品：图片那一格三个入口（主图 + 两个数组的条目）同一个数
            new Rule(
                    CreateProductRequest.class,
                    "mainImage",
                    ProductFieldRules.IMAGE_KEY_MAX,
                    "ProductFieldRules.IMAGE_KEY_MAX",
                    "maxLength",
                    "product.products.main_image"),
            new Rule(
                    CreateProductRequest.class,
                    "images",
                    ProductFieldRules.IMAGE_KEY_MAX,
                    "ProductFieldRules.IMAGE_KEY_MAX",
                    "itemsMaxLength",
                    "product.products.main_image"),
            new Rule(
                    CreateProductRequest.class,
                    "detailImages",
                    ProductFieldRules.IMAGE_KEY_MAX,
                    "ProductFieldRules.IMAGE_KEY_MAX",
                    "itemsMaxLength"),
            new Rule(
                    UpdateProductRequest.class,
                    "mainImage",
                    ProductFieldRules.IMAGE_KEY_MAX,
                    "ProductFieldRules.IMAGE_KEY_MAX",
                    "maxLength",
                    "product.products.main_image"),
            new Rule(
                    UpdateProductRequest.class,
                    "images",
                    ProductFieldRules.IMAGE_KEY_MAX,
                    "ProductFieldRules.IMAGE_KEY_MAX",
                    "itemsMaxLength"),
            new Rule(
                    UpdateProductRequest.class,
                    "detailImages",
                    ProductFieldRules.IMAGE_KEY_MAX,
                    "ProductFieldRules.IMAGE_KEY_MAX",
                    "itemsMaxLength"),
            // —— SKU 批量更新：三个数各落 skus 的三列
            new Rule(
                    SkuUpdateItem.class,
                    "name",
                    ProductFieldRules.SKU_NAME_MAX,
                    "ProductFieldRules.SKU_NAME_MAX",
                    "maxLength",
                    "product.skus.name"),
            new Rule(
                    SkuUpdateItem.class,
                    "image",
                    ProductFieldRules.IMAGE_KEY_MAX,
                    "ProductFieldRules.IMAGE_KEY_MAX",
                    "maxLength",
                    "product.skus.image"),
            new Rule(
                    SkuUpdateItem.class,
                    "skuCode",
                    ProductFieldRules.SKU_CODE_MAX,
                    "ProductFieldRules.SKU_CODE_MAX",
                    "maxLength",
                    "product.skus.sku_code"),
            // —— 规格选择：条目上限是「一个维度展开多宽」，自填值最终建档进 attr_values 那一列
            new Rule(
                    SpecSelectionRequest.class,
                    "valueIds",
                    ProductFieldRules.SPEC_VALUES_MAX,
                    "ProductFieldRules.SPEC_VALUES_MAX",
                    "maxItems"),
            new Rule(
                    SpecSelectionRequest.class,
                    "customValues",
                    ProductFieldRules.SPEC_VALUES_MAX,
                    "ProductFieldRules.SPEC_VALUES_MAX",
                    "maxItems"),
            new Rule(
                    SpecSelectionRequest.class,
                    "customValues",
                    CategoryFieldRules.ATTR_VALUE_MAX,
                    "CategoryFieldRules.ATTR_VALUE_MAX",
                    "itemsMaxLength",
                    "product.category_attr_values.value"),
            new Rule(
                    UpdateSpecsRequest.class,
                    "specs",
                    ProductFieldRules.SPECS_MAX,
                    "ProductFieldRules.SPECS_MAX",
                    "maxItems"),
            // —— 参数条目：JSONB 里的形状，没有列宽可对（数字是产品口径，见 ProductFieldRules）
            new Rule(
                    ParamItem.class,
                    "name",
                    ProductFieldRules.PARAM_NAME_MAX,
                    "ProductFieldRules.PARAM_NAME_MAX",
                    "maxLength"),
            new Rule(
                    ParamItem.class,
                    "value",
                    ProductFieldRules.PARAM_VALUE_MAX,
                    "ProductFieldRules.PARAM_VALUE_MAX",
                    "maxLength"),
            // —— 搜索关键词：上限的权威出处是<b>被搜</b>那一列，不是「给关键词留多少」
            new Rule(
                    ProductQuery.class,
                    "keyword",
                    ProductFieldRules.KEYWORD_MAX,
                    "ProductFieldRules.KEYWORD_MAX",
                    "maxLength",
                    "product.products.name"),
            // —— 店铺：开店两格、审核备注一格
            new Rule(
                    CreateShopRequest.class,
                    "name",
                    ShopFieldRules.NAME_MAX,
                    "ShopFieldRules.NAME_MAX",
                    "maxLength",
                    "shop.shops.name"),
            new Rule(
                    CreateShopRequest.class,
                    "logoKey",
                    ShopFieldRules.LOGO_KEY_MAX,
                    "ShopFieldRules.LOGO_KEY_MAX",
                    "maxLength",
                    "shop.shops.logo_key"),
            new Rule(
                    RejectRequest.class,
                    "reason",
                    ShopFieldRules.REVIEW_REASON_MAX,
                    "ShopFieldRules.REVIEW_REASON_MAX",
                    "maxLength",
                    "shop.shop_reviews.reason"),
            // —— 商家地址：邮编的位数与它的形状是同一个数（见 ShopFieldRules.POSTAL_CODE_DIGITS）
            new Rule(
                    MerchantAddressRequest.class,
                    "postalCode",
                    ShopFieldRules.POSTAL_CODE_DIGITS,
                    "ShopFieldRules.POSTAL_CODE_DIGITS",
                    "maxLength",
                    "shop.addresses.postal_code"),
            new Rule(
                    MerchantAddressRequest.class,
                    "companyName",
                    ShopFieldRules.COMPANY_NAME_MAX,
                    "ShopFieldRules.COMPANY_NAME_MAX",
                    "maxLength",
                    "shop.addresses.company_name"),
            // —— 运费模板：两个列表条数是防刷闸门，模板本身存 JSONB
            new Rule(
                    ShippingTemplateRequest.class,
                    "regionRules",
                    ShopFieldRules.REGION_RULES_MAX,
                    "ShopFieldRules.REGION_RULES_MAX",
                    "maxItems"),
            new Rule(
                    ShippingTemplateRequest.class,
                    "excludedRegions",
                    ShopFieldRules.EXCLUDED_REGIONS_MAX,
                    "ShopFieldRules.EXCLUDED_REGIONS_MAX",
                    "maxItems"),
            // —— 分页与 feed：一次最多要几条，只对入口，不对库
            new Rule(PageParams.class, "size", PageParams.SIZE_MAX, "PageParams.SIZE_MAX", "maximum"),
            new Rule(FeedQuery.class, "size", FeedQuery.SIZE_MAX, "FeedQuery.SIZE_MAX", "maximum"));

    /**
     * app 侧镜像：前端某个<b>具名常量</b>声明的数，镜像的是契约里的哪一格。
     *
     * <p>方向口径与 Java 侧一致且同样刻意不对称：只许<b>等于或严于</b>契约。严于契约是产品决定，必须写明理由；
     * 没登记就红，登记了却比契约松也红——比契约松的那几个字符不是「多写几个字」，是提交必 400。
     *
     * @param stricterReason 允许比契约短的理由；空串＝必须与契约那一格相等
     */
    private record Mirror(
            String file, String constant, String schema, String component, String contractKey, String stricterReason) {
        @Override
        public String toString() {
            return file + " " + constant + " ↔ " + schema + "." + component;
        }
    }

    private static final List<Mirror> APP_MIRRORS = List.of(
            new Mirror(
                    "packages/common/src/address.ts",
                    "ADDRESS_PARSE_TEXT_MAX",
                    "AddressParseRequest",
                    "text",
                    "maxLength",
                    ""),
            new Mirror(
                    "packages/common/src/address.ts",
                    "POSTAL_CODE_MAX",
                    "MerchantAddressRequest",
                    "postalCode",
                    "maxLength",
                    ""),
            new Mirror(
                    "packages/common/src/address.ts",
                    "COMPANY_NAME_MAX",
                    "MerchantAddressRequest",
                    "companyName",
                    "maxLength",
                    ""),
            new Mirror(
                    "packages/common/src/address.ts", "ADDRESS_LABEL_MAX", "AddressRequest", "label", "maxLength", ""),
            new Mirror(
                    "apps/web/src/address/address-form.ts",
                    "CUSTOM_LABEL_MAX",
                    "AddressRequest",
                    "label",
                    "maxLength",
                    "自定义标签是卡片上的一个 chip，四个字画不出「公司前台」这类常用写法就没人用；内置枚举走下拉，这一格只收短语"),
            new Mirror("apps/admin/src/cms/constants.ts", "CMS_TARGET_MAX", "NavRequest", "target", "maxLength", ""),
            new Mirror("apps/admin/src/cms/constants.ts", "CMS_URL_MAX", "BannerRequest", "imageUrl", "maxLength", ""),
            new Mirror(
                    "packages/common/src/note-fields.ts", "NOTE_MAX", "CancelOrderRequest", "reason", "maxLength", ""),
            new Mirror(
                    "apps/web/src/order/CancelOrderDialog.tsx",
                    "NOTE_MAX_LENGTH",
                    "CancelOrderRequest",
                    "reason",
                    "maxLength",
                    "刻意留 20 字余量：对话框里那句「（选填，会在订单备注中原样展示）」不计入字数，短一点比贴边好"),
            new Mirror(
                    "packages/common/src/coupon.ts",
                    "COUPON_NAME_MAX",
                    "CreateCouponTemplateRequest",
                    "name",
                    "maxLength",
                    ""),
            new Mirror("apps/admin/src/cms/constants.ts", "CMS_TITLE_MAX", "NavRequest", "title", "maxLength", ""),
            new Mirror(
                    "apps/admin/src/cms/constants.ts",
                    "CMS_SUBTITLE_MAX",
                    "BannerRequest",
                    "subtitle",
                    "maxLength",
                    ""),
            new Mirror(
                    "apps/admin/src/cms/constants.ts",
                    "CMS_TAB_NAME_MAX",
                    "RecommendTabRequest",
                    "name",
                    "maxLength",
                    ""),
            new Mirror("apps/admin/src/cms/constants.ts", "CMS_KEY_MAX", "NavRequest", "navKey", "maxLength", ""),
            new Mirror("apps/admin/src/cms/constants.ts", "CMS_SUB_GROUPS_MAX", "NavRequest", "subs", "maxItems", ""),
            new Mirror(
                    "apps/seller/src/product/constants.ts",
                    "SKU_CODE_MAX",
                    "SkuUpdateItem",
                    "skuCode",
                    "maxLength",
                    ""),
            new Mirror(
                    "packages/common/src/product-fields.ts",
                    "SPEC_VALUES_MAX",
                    "SpecSelectionRequest",
                    "valueIds",
                    "maxItems",
                    ""),
            new Mirror(
                    "packages/common/src/product-fields.ts",
                    "SPEC_VALUE_MAX",
                    "SpecSelectionRequest",
                    "customValues",
                    "itemsMaxLength",
                    ""),
            new Mirror(
                    "apps/seller/src/shop/constants.ts", "SHOP_NAME_MAX", "CreateShopRequest", "name", "maxLength", ""),
            new Mirror(
                    "packages/app-kit/src/login-schema.ts",
                    "NICKNAME_MAX",
                    "UpdateProfileRequest",
                    "nickname",
                    "maxLength",
                    ""),
            new Mirror(
                    "packages/app-kit/src/login-schema.ts",
                    "CAPTCHA_CODE_DIGITS",
                    "SmsCodeRequest",
                    "captchaCode",
                    "maxLength",
                    "这一格是图形码上印了几个字符，契约那 10 位是给换更长码留的容量"),
            // —— 交易数量的前端预判：Java 侧的 owner 是 common.Quantities，但镜像对的是契约那一格（同一层的其它数字都从它走）
            new Mirror(
                    "apps/web/src/cart/cart.ts", "MAX_CART_QUANTITY", "AddCartItemRequest", "quantity", "maximum", ""),
            new Mirror(
                    "apps/web/src/products/detail/constants.ts",
                    "PDP_MAX_QUANTITY",
                    "AddCartItemRequest",
                    "quantity",
                    "maximum",
                    "PRD-72 写明了两个数不是一条约束：详情页未选全规格时步进器给的是展示上界（防一格灌进离谱数字），"
                            + "服务端硬闸门仍是 1..999，选全规格后收紧为 min(数量, 该 SKU 可用库存)。刻意不对齐成一个。"),
            new Mirror(
                    "apps/seller/src/coupon/form.ts",
                    "COUPON_MAX_TOTAL",
                    "CreateCouponTemplateRequest",
                    "totalQuantity",
                    "maximum",
                    ""),
            new Mirror(
                    "apps/web/src/home/queries.ts",
                    "FEED_PAGE_SIZE",
                    "FeedQuery",
                    "size",
                    "maximum",
                    "一屏 24 条是版式决定（六列四行），契约的 48 是接口一次能给的容量；前端刻意少要，但不得多要"),
            new Mirror(
                    "apps/web/src/search/search.ts",
                    "SEARCH_PAGE_SIZE",
                    "PageParams",
                    "size",
                    "maximum",
                    "搜索页一页 24 条与首页 feed 同值（都是一屏六列四行的版式），契约的 100 是所有分页接口的公共上界；" + "搜索结果卡片更窄、一页看更多行数更少，故刻意少要，但不得多要"),
            new Mirror(
                    "apps/web/src/coupon/coupon.ts",
                    "COUPON_PAGE_SIZE",
                    "PageParams",
                    "size",
                    "maximum",
                    "券包一页 10 条与分页控件共用一个数（两个数就两套总页数），契约的 100 是所有分页接口的公共上界"),
            new Mirror(
                    "apps/web/src/reviews/constants.ts",
                    "REVIEW_PAGE_SIZE",
                    "PageParams",
                    "size",
                    "maximum",
                    "商详评价区一页 10 条：评价是「看前几条 + 翻页」的列表，读完一屏就该翻页；100 是公共上界"),
            new Mirror(
                    "apps/admin/src/audit/constants.ts",
                    "AUDIT_PAGE_SIZE",
                    "PageParams",
                    "size",
                    "maximum",
                    "审计一页 20 条：查账习惯是按时间倒着翻，页大一点更贴近；100 是公共上界"),
            new Mirror(
                    "apps/admin/src/shop-ops/constants.ts",
                    "SHOP_OPS_PAGE_SIZE",
                    "PageParams",
                    "size",
                    "maximum",
                    "店铺治理一页 20 条，与审核队列同档（两个页面看的是同一批人，页大小不该不一样）；100 是公共上界"),
            new Mirror(
                    "apps/seller/src/coupon/form.ts",
                    "VALID_DAYS_MIN",
                    "CreateCouponTemplateRequest",
                    "validDays",
                    "minimum",
                    ""),
            new Mirror(
                    "apps/seller/src/coupon/form.ts",
                    "VALID_DAYS_MAX",
                    "CreateCouponTemplateRequest",
                    "validDays",
                    "maximum",
                    ""));

    /**
     * 前端数值边界的第二种对边：与某个 Java 词表常量同值（该格<b>没有</b>对应的契约数字，或 Java 才是唯一出处）。
     *
     * <p>{@code javaValue} 用 lambda 而不是「类名 + 字段名」的字符串，是为了让编译期就吃掉拼错——反射取字段的
     * 写法在这里只会把一个不存在的规则登记成一条无声跳过的断言。
     *
     * <p>它同时是 {@code 前端数值边界只许登记成三种对边之一} 的登记表：过去这一族的核对散在两条测试里逐条手写，
     * 扫不到也补不上，本轮改成表驱动。
     *
     * @param javaRule 对边那一格的具名写法，只用于失败信息
     */
    private record Twin(String file, String constant, String javaRule, IntSupplier javaValue) {

        @Override
        public String toString() {
            return file + " " + constant + " ↔ " + javaRule;
        }
    }

    private static final List<Twin> JAVA_TWINS = List.of(
            new Twin(
                    "packages/common/src/address.ts",
                    "ADDRESS_NAME_MAX",
                    "AddressFieldRules.NAME_MAX",
                    () -> AddressFieldRules.NAME_MAX),
            new Twin(
                    "packages/common/src/address.ts",
                    "ADDRESS_DETAIL_MAX",
                    "AddressFieldRules.DETAIL_MAX",
                    () -> AddressFieldRules.DETAIL_MAX),
            new Twin(
                    "packages/common/src/address.ts",
                    "CONTACT_PHONE_MAX",
                    "PhoneNumber.CONTACT_PATTERN 的 {5,20} 上界",
                    // 输入框的 maxLength 拿不到正则，只能另起一个名字，但数得从同一条规则来
                    () -> boundOf(PhoneNumber.CONTACT_PATTERN, false)),
            new Twin(
                    "packages/common/src/tracking.ts",
                    "CARRIER_NAME_MAX",
                    "TrackingFieldRules.CARRIER_NAME_MAX",
                    () -> TrackingFieldRules.CARRIER_NAME_MAX),
            new Twin(
                    "packages/common/src/tracking.ts",
                    "TRACKING_NO_MAX",
                    "TrackingFieldRules.TRACKING_NO_MAX",
                    () -> TrackingFieldRules.TRACKING_NO_MAX),
            new Twin(
                    "packages/common/src/product-fields.ts",
                    "PRODUCT_NAME_MAX",
                    "ProductFieldRules.NAME_MAX",
                    () -> ProductFieldRules.NAME_MAX),
            new Twin(
                    "packages/common/src/product-fields.ts",
                    "SELL_POINT_MIN",
                    "ProductFieldRules.SELL_POINT_PATTERN 的 {10,30} 下界",
                    // 卖点的 10 与 30 在 Java 侧只以正则存在，所以从正则里取数，而不是两边各写一遍字面量
                    () -> boundOf(ProductFieldRules.SELL_POINT_PATTERN, true)),
            new Twin(
                    "packages/common/src/product-fields.ts",
                    "SELL_POINT_MAX",
                    "ProductFieldRules.SELL_POINT_PATTERN 的 {10,30} 上界",
                    () -> boundOf(ProductFieldRules.SELL_POINT_PATTERN, false)),
            new Twin(
                    "packages/app-kit/src/login-schema.ts",
                    "SMS_CODE_DIGITS",
                    "AccountFieldRules.SMS_CODE_LENGTH",
                    () -> AccountFieldRules.SMS_CODE_LENGTH),
            new Twin(
                    "packages/app-kit/src/login-schema.ts",
                    "PASSWORD_MIN",
                    "AccountFieldRules.PASSWORD_MIN",
                    () -> AccountFieldRules.PASSWORD_MIN),
            new Twin(
                    "packages/app-kit/src/login-schema.ts",
                    "NICKNAME_MAX",
                    "AccountFieldRules.NICKNAME_MAX",
                    () -> AccountFieldRules.NICKNAME_MAX),
            new Twin(
                    "apps/admin/src/account/staff-form.ts",
                    "EMPLOYEE_NO_MAX",
                    "AccountFieldRules.EMPLOYEE_NO_MAX",
                    () -> AccountFieldRules.EMPLOYEE_NO_MAX),
            new Twin(
                    "apps/admin/src/account/staff-form.ts",
                    "DISPLAY_NAME_MAX",
                    "AccountFieldRules.DISPLAY_NAME_MAX",
                    () -> AccountFieldRules.DISPLAY_NAME_MAX),
            new Twin(
                    "apps/admin/src/account/staff-form.ts",
                    "PASSWORD_MAX",
                    "AccountFieldRules.PASSWORD_MAX",
                    () -> AccountFieldRules.PASSWORD_MAX),
            // 「一段人写的说明」这一档（200）：评价文字/追评/卖家回复是三个新入口，与既有七个入口同概念，
            // 因此直接引用前端那一边的 owner（note-fields.ts 的 NOTE_MAX，它就是本档的镜像）。
            // 此处曾经登记 CONTENT_MAX/APPEND_MAX/REPLY_MAX 三条：同名同值的本地常量仍是第二份实现，
            // 契约放宽时它们谁也不会跟着改，登记得再全也只是把漂移记进表里而已。
            new Twin(
                    "apps/admin/src/audit/constants.ts",
                    "AUDIT_ACTION_MAX",
                    "AuditFieldRules.ACTION_MAX",
                    () -> AuditFieldRules.ACTION_MAX),
            new Twin(
                    "apps/admin/src/audit/constants.ts",
                    "AUDIT_TARGET_ID_MAX",
                    "AuditFieldRules.TARGET_ID_MAX",
                    () -> AuditFieldRules.TARGET_ID_MAX),
            new Twin(
                    "apps/admin/src/audit/constants.ts",
                    "AUDIT_TARGET_TYPE_MAX",
                    "AuditFieldRules.TARGET_TYPE_MAX",
                    () -> AuditFieldRules.TARGET_TYPE_MAX),
            // 类目层级上限：Java 侧那一格是 CategoryService 的 private 常量，既不进反射也不进契约
            // （level 由 parentId 推导，不是入参），所以比对走源码文本而不是取常量值
            new Twin(
                    "apps/admin/src/category/constants.ts",
                    "CATEGORY_MAX_LEVEL",
                    "CategoryService.MAX_LEVEL",
                    () -> javaSourceConst(CategoryService.class, "MAX_LEVEL")),
            new Twin(
                    "apps/admin/src/shop-ops/constants.ts",
                    "SHOP_KEYWORD_MAX",
                    "ShopFieldRules.NAME_MAX",
                    () -> ShopFieldRules.NAME_MAX),
            new Twin(
                    "apps/admin/src/shop-ops/constants.ts",
                    "SHOP_STATUS_MAX",
                    "shop.shop_reviews/shop.shops status 列宽（V8 的 VARCHAR(20) 之上的枚举名上限 32）",
                    () -> AuditFieldRules.TARGET_TYPE_MAX));

    /**
     * 第三种对边：压根没有对边。值是这一处的产品或传输策略，写清楚<b>为什么</b>没有第二处比它。
     *
     * <p>这一格不许空着：census 逼着每个新边界要么找到契约/Java 的另一边，要么在这儿登记「它就是我这一处的事」。
     * 空理由等于没登记。
     */
    private record Policy(String file, String constant, String reason) {

        @Override
        public String toString() {
            return file + " " + constant;
        }
    }

    private static final List<Policy> POLICY_NUMBERS = List.of(
            new Policy(
                    "apps/web/src/home/Feed.tsx", "MAX_AUTO_PAGES", "自动加载封顶页数：8 页约 192 张卡之后换成「继续加载」按钮，防止一次浏览把接口与内存拉满"),
            new Policy(
                    "apps/web/src/logistics/TrackingTimeline.tsx",
                    "DEFAULT_COLLAPSED_COUNT",
                    "时间线收起态保留几个节点，纯展示，服务端不读它"),
            new Policy(
                    "packages/common/src/sdk-client.ts",
                    "RETRY_LIMIT",
                    "传输策略（GEN-35：幂等 GET 遇 408/429/5xx 重试 2 次），不是入参边界"),
            new Policy(
                    "apps/admin/src/audit/constants.ts",
                    "EXPORT_ROW_LIMIT",
                    "单次导出的行数上限：导出在前端拼 CSV，这个数管「别把标签页卡死」；" + "真要导十万行应改走后端导出任务，那才是另一种形状（生成/下载/过期）"),
            new Policy(
                    "packages/ui-web/src/components/phone-field.tsx",
                    "MAINLAND_MOBILE_DIGITS",
                    "固定 +86 的手机号输入框位数上限：只收号码本体，与 app-kit 的 PHONE_DIGITS（登录手机号）同档；"
                            + "库上的宽松档 7..20 是「联系电话」那条规则（允许座机与分隔符），不是这个约束"),
            new Policy(
                    "packages/ui-web/src/components/reui/data-grid/data-grid-scroll-area.tsx",
                    "MIN_THUMB_SIZE",
                    "reui DataGrid 滚动条滑块的最小尺寸：纯 CSS 呈现，服务端与契约都不读它"),
            new Policy(
                    "packages/ui-web/src/components/reui/data-grid/data-grid-scroll-area.tsx",
                    "FALLBACK_SCROLLBAR_SIZE",
                    "读不到真实滚动条尺寸时的兜底值（自定义滚动条尚未布局完成的瞬间）：纯 CSS 呈现，无对边"),
            new Policy(
                    "packages/app-kit/src/login-schema.ts",
                    "PHONE_DIGITS",
                    "登录那一格只收大陆手机号，11 位与自家正则的位数由 shared-vocabulary.test.ts 的 digits==span 钉住；"
                            + "Java 侧的 7..20 是联系电话那条，不是同一个约束（电话允许座机与分隔符）"),
            new Policy(
                    "packages/common/src/monitoring/core.ts",
                    "BREADCRUMB_LIMIT",
                    "错误现场面包屑的环形缓冲条数：纯前端遥测的内存上限，接收端与契约都不读它；" + "定这个数只为「别为一条错误把整段导航历史带进 payload」"),
            new Policy(
                    "packages/common/src/monitoring/transport.ts",
                    "MAX_BATCH",
                    "一次 beacon 最多打包的事件条数：传输策略，与后端接口无关，只为单请求别超浏览器 URL/POST 体积的稳妥区间"));

    @Test
    void 注解里的数字等于词表常量() {
        assertThat(RULES).as("登记表空了说明本类已失效").isNotEmpty();
        for (Rule rule : RULES) {
            assertThat(annotationNumber(rule))
                    .as("%s：注解实际值与词表常量不再相同（有人把数字写回了字面量，或改了常量却没同步契约）", rule)
                    .isEqualTo(rule.ownerValue());
        }
    }

    @Test
    void 词表常量等于已发布契约的那一格() {
        for (Rule rule : RULES) {
            assertThat(contractNumber(rule))
                    .as("%s：契约里那一格与词表常量不符——数字属于接口，改了要先跑 pnpm gen:sdk", rule)
                    .isEqualTo(rule.ownerValue());
        }
    }

    @Test
    void 入站上限不越过库上那一格() {
        List<Rule> withColumn =
                RULES.stream().filter(r -> r.columns().length > 0).toList();
        assertThat(withColumn).as("没有任何规则登记落库列，列名多半写错了").isNotEmpty();
        // 一次跑完再报：登记表里落库列名写错往往是一批（搬家、改名），逐条失败会让人修一条跑一次
        List<String> drifted = new ArrayList<>();
        for (Rule rule : withColumn) {
            for (String column : rule.columns()) {
                Integer bound = DB.get(column);
                if (bound == null) {
                    drifted.add(rule + " → 迁移里找不到 " + column + " 这一格的宽度/约束（列改名或登记写错）");
                    continue;
                }
                // 入口比列宽紧是允许的（早点 400），比列宽松则是 500
                if (rule.ownerValue() > bound) {
                    drifted.add(rule + " → 入站上限越过 " + column + " 的那一格（列宽 " + bound + "），超出部分会撞库而不是撞校验");
                }
            }
        }
        assertThat(drifted).as("入站上限与库上那一格对不上").isEmpty();
    }

    @Test
    void DB兜底的那几格与入口门是同一个数() {
        // 件数是唯一一处「DB 也当闸门」的：cart 用 LEAST 封顶而不是拒绝，入口比 DB 宽就会静默改写用户输入
        assertThat(DB)
                .as("cart.items / orders.items 的 quantity CHECK 上界")
                .containsEntry("cart.items.quantity", Quantities.LINE_QUANTITY_MAX)
                .containsEntry("orders.items.quantity", Quantities.LINE_QUANTITY_MAX);
    }

    @Test
    void 购物车条目数与下单行数同值是刻意的() {
        // 全选必须能一次下完：两者一旦不等，界面上能勾的数量提交必 400
        assertThat(Quantities.ORDER_LINES_MAX).isEqualTo(Quantities.CART_ITEMS_MAX);
    }

    @Test
    void 前端表单词表与Java同一份数字() throws IOException {
        assertThat(JAVA_TWINS).as("Java 同值那一族的登记表空了说明本条已失效").isNotEmpty();
        for (Twin twin : JAVA_TWINS) {
            assertThat(tsNumber(twin.file(), twin.constant()))
                    .as("%s：前端抄的这份数字与 Java 侧那条不再是同一个数", twin)
                    .isEqualTo(twin.javaValue().getAsInt());
        }
        // 承运商 code 不镜像到前端：它不是用户输入（两端从字典选），抄一份没人读的常量就是孤儿
    }

    @Test
    void 提示语两边逐字节相同() throws IOException {
        // 后端把上限拼进了 message，所以这句话本身也是规则的一部分：改数字必然改文案，两边各写一遍就各改一遍
        assertThat(tsString("product-fields.ts", "PRODUCT_NAME_MESSAGE"))
                .as("标题超限提示：卖家端与 Java 不同句，就是同一违规两种报错")
                .isEqualTo(ProductFieldRules.NAME_MESSAGE);
        assertThat(tsString("product-fields.ts", "SELL_POINT_MESSAGE")).isEqualTo(ProductFieldRules.SELL_POINT_MESSAGE);
        assertThat(tsString("coupon.ts", "COUPON_NAME_MESSAGE"))
                .as("券名超限提示：卖家表单与 Java 不同句，就是同一条违规两种报错")
                .isEqualTo(CouponFieldRules.NAME_MESSAGE);
    }

    @Test
    void app侧镜像只许等于或严于契约() throws IOException {
        assertThat(APP_MIRRORS).as("镜像表空了说明本条已失效").isNotEmpty();
        for (Mirror mirror : APP_MIRRORS) {
            int appValue = tsNumber(mirror.file(), mirror.constant());
            int bound = contractBound(mirror.schema(), mirror.component(), mirror.contractKey());
            if (mirror.stricterReason().isEmpty()) {
                assertThat(appValue)
                        .as("%s：前端 owner 与契约那一格不再同值（比契约松=提交必 400，比契约紧=没登记理由的悄悄缩水）", mirror)
                        .isEqualTo(bound);
            } else {
                assertThat(appValue)
                        .as("%s：登记过「刻意严于契约」，但现在已经不严了（%s）", mirror, mirror.stricterReason())
                        .isLessThanOrEqualTo(bound);
            }
        }
    }

    /**
     * PRD-72 那句「两个数不是同一个约束、不要对齐成一个」此前只是散文，这里钉成不等式。
     *
     * <p>方向只有一个会出错：有人看见 99 与 999 不相等，以为是漏对齐，把展示上界提到 999（或把闸门降到 99）。
     * 前者让详情页一格能灌进离谱数字，后者让服务端少卖一档——相等就是那条产品决定被改没了。
     */
    @Test
    void 详情页的展示上界必须严于服务端闸门() throws IOException {
        assertThat(tsNumber("apps/web/src/products/detail/constants.ts", "PDP_MAX_QUANTITY"))
                .as("详情页步进器的展示上界（未选全规格时）与服务端硬闸门 AddCartItemRequest.quantity.maximum")
                .isLessThan(contractBound("AddCartItemRequest", "quantity", "maximum"));
    }

    @Test
    void app里不许有裸的字数上限字面量() throws IOException {
        // 镜像必须是指向 owner 的具名引用：写成 maxLength={200} 就没人知道它是契约的哪一格，改了契约也不会红
        List<String> inline;
        try (Stream<Path> walk = TS_ROOTS.stream()
                .filter(p -> Files.isDirectory(REPO_ROOT.resolve(p)))
                .flatMap(p -> streamOf(p))) {
            inline = walk.filter(
                            p -> p.toString().endsWith(".ts") || p.toString().endsWith(".tsx"))
                    .filter(p -> {
                        try {
                            String code = SourceScanner.withoutComments(SourceScanner.read(p));
                            return INLINE_BOUND.matcher(code).find();
                        } catch (IOException e) {
                            throw new IllegalStateException(e);
                        }
                    })
                    .map(p -> REPO_ROOT.relativize(p.normalize()).toString().replace('\\', '/'))
                    .toList();
        }
        assertThat(inline).as("这些文件里还有裸的字数上限（换成 owner 的具名常量）").isEmpty();
    }

    /**
     * 前端每一个具名的数值边界都必须有一个对边：契约那一格（{@link #APP_MIRRORS}）、某个 Java 词表常量
     * （{@link #JAVA_TWINS}），或登记在案的「这就是我这一处的策略」（{@link #POLICY_NUMBERS}）。
     *
     * <p><b>为什么是等式而不是清单</b>：清单只证明「登记过的都对」，不证明「没有漏登记的就没事」——
     * 本轮的三个漏网数（车 999、详情页 99、券发行量 100 万）正是这么漏的：它们的名字长得像 owner，
     * 值却是从 Java 手抄过来的，而 {@link #INLINE_BOUND} 那种「扫裸字面量」的写法看不见起了名字的抄。
     * 现在 census 从源码扫出全部具名边界，两向都必须与三张表的并集相等：
     * 新增一个不登记就红，删掉或改名而不销登记也红（清单会自己烂掉这件事同样得红）。
     */
    @Test
    void 前端数值边界只许登记成三种对边之一() throws IOException {
        Map<String, String> found = new TreeMap<>();
        Map<String, String> skippedByUnit = new TreeMap<>();
        try (Stream<Path> walk = TS_ROOTS.stream()
                .filter(p -> Files.isDirectory(REPO_ROOT.resolve(p)))
                .flatMap(p -> streamOf(p))) {
            walk.filter(p -> p.toString().endsWith(".ts") || p.toString().endsWith(".tsx"))
                    .filter(p -> !p.getFileName().toString().matches(".+\\.(test|spec|gen)\\.[cm]?[jt]sx?"))
                    .forEach(p -> {
                        try {
                            String code = SourceScanner.withoutComments(SourceScanner.read(p));
                            String rel = REPO_ROOT
                                    .relativize(p.normalize())
                                    .toString()
                                    .replace('\\', '/');
                            Matcher m = BOUND_DECL.matcher(code);
                            while (m.find()) {
                                String name = m.group(1);
                                if (!BOUND_NAME.matcher(name).find()) {
                                    continue;
                                }
                                String key = rel + " " + name;
                                if (BOUND_UNIT_SUFFIX.matcher(name).find()) {
                                    skippedByUnit.put(key, m.group(2));
                                } else {
                                    found.put(key, m.group(2));
                                }
                            }
                        } catch (IOException e) {
                            throw new IllegalStateException(e);
                        }
                    });
        }
        assertThat(found).as("一个具名数值边界都没扫到 = census 的扫描器或路径已失效").hasSizeGreaterThan(30);

        Set<String> registered = new TreeSet<>();
        APP_MIRRORS.forEach(mirror -> registered.add(mirror.file() + " " + mirror.constant()));
        JAVA_TWINS.forEach(twin -> registered.add(twin.file() + " " + twin.constant()));
        POLICY_NUMBERS.forEach(policy -> registered.add(policy.file() + " " + policy.constant()));

        Set<String> unregistered = new TreeSet<>(found.keySet());
        unregistered.removeAll(registered);
        Set<String> stale = new TreeSet<>(registered);
        stale.removeAll(found.keySet());

        assertThat(unregistered)
                .as("这些前端数值边界没有对边：给它找一个契约镜像或 Java 同值，实在没有就登记成策略并写明理由")
                .isEmpty();
        assertThat(stale).as("登记过的前端边界在源码里已经扫不到了（改名、删掉，或把裸整数换成了算式）").isEmpty();
        for (Policy policy : POLICY_NUMBERS) {
            assertThat(policy.reason().trim())
                    .as("%s：登记成「没有对边」却不写为什么，这张表就成了免检通道", policy)
                    .isNotEmpty();
        }
        // 尺子的另一侧：带单位的确实被放行了（放行规则失效时，本类会在没人改前端的情况下突然要求登记一堆 px 与秒）
        assertThat(skippedByUnit.keySet())
                .as("名字带单位的策略数字。MAX_SIZE_MB 这一格同时是注释扫描器的回归样本：它写在 "
                        + "const ACCEPT_IMAGE = \"image/*\" 的下一行，把串里的星号当注释结尾就看不见它了")
                .contains("packages/ui-web/src/components/image-upload.tsx MAX_SIZE_MB");
    }

    @Test
    void 报错文案里的数字就是它约束的那个数() {
        for (Rule rule : RULES) {
            String message = annotationMessage(rule);
            if (message == null || message.isBlank()) {
                continue;
            }
            List<Integer> bounds = annotationBounds(rule);
            Matcher digits = Pattern.compile("\\d+").matcher(message);
            while (digits.find()) {
                int quoted = Integer.parseInt(digits.group());
                assertThat(bounds)
                        .as("%s：message 里写着 %d，可它约束的上限是 %s——改了一边忘另一边的经典形态", rule, quoted, bounds)
                        .contains(quoted);
            }
        }
    }

    @Test
    void 入站注解里的数字字面量只许住在owner里() throws IOException {
        List<Path> sources;
        try (Stream<Path> walk = Files.walk(MAIN_JAVA)) {
            sources = walk.filter(p -> p.toString().endsWith(".java")).sorted().toList();
        }
        assertThat(sources).as("主源码一个 java 文件都没扫到 = 路径或 working dir 变了，本条会假绿").isNotEmpty();
        List<String> citations = new ArrayList<>();
        List<String> offenders = new ArrayList<>();
        for (Path source : sources) {
            String code = SourceScanner.withoutComments(SourceScanner.read(source));
            if (code.contains("NoteFieldRules.FREE_TEXT_MAX")) {
                citations.add(MAIN_JAVA.relativize(source).toString().replace('\\', '/'));
            }
            if (RULE_OWNERS.contains(source.getFileName().toString())) {
                continue;
            }
            Matcher annotation = NUMERIC_VALIDATION.matcher(code);
            while (annotation.find()) {
                Matcher number = Pattern.compile("\\d+").matcher(annotation.group(2));
                boolean onlySemantics = true;
                while (number.find()) {
                    if (!"0".equals(number.group()) && !"1".equals(number.group())) {
                        onlySemantics = false;
                        break;
                    }
                }
                // 0 与 1 不是容量档，是「不为负」与「非空」这两句语义；给它们造名字等于把语义换成一个可漂移的数
                if (!onlySemantics) {
                    offenders.add(
                            source.getFileName() + " → " + annotation.group().strip());
                }
            }
        }
        assertThat(citations).as("引用字数预算 owner 的入口数：一个概念散回七个字面量就是本条要挡的").hasSizeGreaterThanOrEqualTo(7);
        assertThat(offenders)
                .as("入站校验注解里写进了数字字面量：一个上限只许有一个定义处。漏了这一格就会长成「DTO 放宽了，契约、列宽、"
                        + "前端镜像各留一份旧数」——此前本类只能核对已登记的约 40 条，登记面之外的字面量看不见")
                .isEmpty();
    }

    @Test
    void 号码与验证码形状各只有一份() throws IOException {
        // 契约导出的是注解里那个字符串，逐字节比（JSON 转义已由解析器还原）
        assertThat(patternOf(ConfirmDeletionRequest.class, "code"))
                .as("注销验证码的形状")
                .isEqualTo(AccountFieldRules.SMS_CODE_PATTERN);
        assertThat(contractPattern(ConfirmDeletionRequest.class, "code"))
                .as("契约里注销验证码那一格")
                .isEqualTo(AccountFieldRules.SMS_CODE_PATTERN);
        for (Class<?> dto : List.of(AddressRequest.class, MerchantAddressRequest.class)) {
            String component = "phone";
            assertThat(patternOf(dto, component))
                    .as("%s 的联系电话形状", dto.getSimpleName())
                    .isEqualTo(PhoneNumber.CONTACT_PATTERN);
            assertThat(contractPattern(dto, component))
                    .as("%s 的联系电话在契约里那一格", dto.getSimpleName())
                    .isEqualTo(PhoneNumber.CONTACT_PATTERN);
        }
        // 卖点：Java 侧只有这一条正则（Size(min) 会判死「清空」），所以 10/30 这两个数的唯一出处是它
        for (Class<?> dto : List.of(CreateProductRequest.class, UpdateProductRequest.class)) {
            assertThat(patternOf(dto, "subtitle"))
                    .as("%s 的卖点形状", dto.getSimpleName())
                    .isEqualTo(ProductFieldRules.SELL_POINT_PATTERN);
            assertThat(contractPattern(dto, "subtitle"))
                    .as("%s 的卖点在契约里那一格", dto.getSimpleName())
                    .isEqualTo(ProductFieldRules.SELL_POINT_PATTERN);
        }
        // 联系电话的形状在前端也只许有一份，且与 Java 逐字节同串（它那个 maxLength 的数走 JAVA_TWINS 那条）
        assertThat(tsString("address.ts", "CONTACT_PHONE_PATTERN"))
                .as("packages/common/src/address.ts 里那份联系电话正则")
                .isEqualTo(PhoneNumber.CONTACT_PATTERN);
    }

    @Test
    void 词表以常量出现而不退回字面量() throws IOException {
        for (Rule rule : RULES) {
            Path source = MAIN_JAVA.resolve(rule.dto().getName().replace('.', '/') + ".java");
            assertThat(source).as("找不到 DTO 源码").exists();
            String code =
                    SourceScanner.withoutComments(SourceScanner.read(source)).replaceAll("\\s+", " ");
            // 上限常量必须紧邻它所约束的那个组件：注解与字段之间隔着多少写法都不算，隔出一个字面量才算漂移
            // （窗口给到 120 是因为 message 也引用同一个常量时，注解本身就有这么长）
            Matcher cited = Pattern.compile(
                            Pattern.quote(rule.ownerToken()) + "[\\s\\S]{0,120}?\\b" + rule.component() + "\\b")
                    .matcher(code);
            assertThat(cited.find())
                    .as("%s：注解里没有就近引用 %s（要么退回字面量了，要么组件改了名）", rule, rule.ownerToken())
                    .isTrue();
        }
    }

    @Test
    void 门禁自己没空转() {
        assertThat(SPEC.path("components").path("schemas").size())
                .as("契约文件没读到几何时，比对就是假绿")
                .isGreaterThan(100);
        assertThat(DB).as("迁移里一个列宽/约束数字都没扫到 = 扫描器或路径失效").hasSizeGreaterThan(80);
        // 这一格只能由「ADD COLUMN IF NOT EXISTS 列名 VARCHAR(n)」那种写法进来：扫描器漏掉那段写法时它是无声的
        // ——那一格只是不在表里，于是「不许越过列宽」那条断言对它整体失明。钉住它，等于钉住扫描器本身。
        assertThat(DB)
                .as("V36 后加的规格值配图列没进这张表 = 回放迁移的扫描器又对某种写法失明了")
                .containsEntry("product.category_attr_values.image", CategoryFieldRules.ATTR_VALUE_IMAGE_MAX);
        // 每条登记都还指得着东西：反射、契约、源码三边都要能取到值
        for (Rule rule : RULES) {
            annotationNumber(rule);
            contractNumber(rule);
        }
    }

    @Test
    void 邮编的位数与形状不许各说一半() {
        // 同一个组件上两条规则各写一遍同一个数：@Size(max = 6) 与 ^\d{6}$。
        // 改了正则忘改长度，就是「输入框能敲 7 位、提交必 400」的成因（前端那条同族规则见 shared-vocabulary）。
        assertThat(patternOf(MerchantAddressRequest.class, "postalCode"))
                .as("注解里的形状就是 owner 拼出来的那一条")
                .isEqualTo(ShopFieldRules.POSTAL_CODE_PATTERN);
        assertThat(contractPattern(MerchantAddressRequest.class, "postalCode"))
                .as("契约里邮编那一格的形状")
                .isEqualTo(ShopFieldRules.POSTAL_CODE_PATTERN);
        assertThat(annotationNumber(ruleOf(MerchantAddressRequest.class, "postalCode", "maxLength")))
                .as("输入框拦的位数与形状放行的位数不再是同一个数")
                .isEqualTo(digitsOf(patternOf(MerchantAddressRequest.class, "postalCode")));
    }

    /** 读编译进字节码的注解值——不是源码文本，反射取到的就是 springdoc 看到的同一个数 */
    private static int annotationNumber(Rule rule) {
        Field field = field(rule.dto(), rule.component());
        return switch (rule.contractKey()) {
            case "maxLength", "maxItems" -> size(field, rule).max();
            case "itemsMaxLength" -> itemSize(field, rule).max();
            case "minLength" -> size(field, rule).min();
            case "maximum" ->
                (int) require(field.getAnnotation(Max.class), Max.class, rule).value();
            default -> throw new IllegalStateException("登记表里的契约键不认识：" + rule);
        };
    }

    private static Size size(Field field, Rule rule) {
        return require(field.getAnnotation(Size.class), Size.class, rule);
    }

    /**
     * 数组<b>条目</b>上的上限：{@code List<@Size(max = 255) String>} 的注解挂在泛型参数上，字段本身没有。
     *
     * <p>这一格非读不可：图片数组的条目上限与主图那一格是同一个数，只看字段上的注解会漏掉三个入口里的两个，
     * 于是「主图收紧、图集没跟」在契约上是看得见的、在门禁里是看不见的。
     */
    private static Size itemSize(Field field, Rule rule) {
        AnnotatedType generic = field.getAnnotatedType();
        assertThat(generic instanceof AnnotatedParameterizedType)
                .as("%s：字段不是带泛型参数的容器，条目上限无处可取", rule)
                .isTrue();
        AnnotatedType element = ((AnnotatedParameterizedType) generic).getAnnotatedActualTypeArguments()[0];
        return require(element.getAnnotation(Size.class), Size.class, rule);
    }

    /** 注解上那句 message（默认占位串原样返回，其中不含数字，比对自会跳过） */
    private static String annotationMessage(Rule rule) {
        Field field = field(rule.dto(), rule.component());
        return switch (rule.contractKey()) {
            case "maxLength", "minLength", "maxItems" -> size(field, rule).message();
            case "itemsMaxLength" -> itemSize(field, rule).message();
            case "maximum" ->
                require(field.getAnnotation(Max.class), Max.class, rule).message();
            default -> "";
        };
    }

    /** 这条注解真正允许的两个边界：message 里出现的数字只能是其中之一，否则文案与闸门各说各话 */
    private static List<Integer> annotationBounds(Rule rule) {
        Field field = field(rule.dto(), rule.component());
        return switch (rule.contractKey()) {
            case "maxLength", "minLength", "maxItems" -> {
                Size size = size(field, rule);
                yield List.of(size.min(), size.max());
            }
            case "itemsMaxLength" -> List.of(itemSize(field, rule).max());
            case "maximum" ->
                List.of((int)
                        require(field.getAnnotation(Max.class), Max.class, rule).value());
            default -> List.of();
        };
    }

    /** 目录流：镜像扫描按仓库根算路径，找不到目录就当没有（各 app 的 src 都在，缺了由非空断言接住） */
    private static Stream<Path> streamOf(String repoPath) {
        try {
            return Files.walk(REPO_ROOT.resolve(repoPath));
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static <A extends Annotation> A require(A found, Class<A> type, Rule rule) {
        assertThat(found)
                .as("%s：组件上没有 @%s，登记表或 DTO 变了", rule, type.getSimpleName())
                .isNotNull();
        return found;
    }

    private static Field field(Class<?> dto, String component) {
        try {
            // record 组件上的注解会传播到同名字段，反射字段比 RecordComponent 更直白
            return dto.getDeclaredField(component);
        } catch (NoSuchFieldException e) {
            throw new AssertionError(dto.getSimpleName() + " 没有组件 " + component + "（词表登记表已过期）", e);
        }
    }

    private static int contractNumber(Rule rule) {
        return contractBound(rule.schema(), rule.component(), rule.contractKey());
    }

    /** 按 (DTO, 组件, 契约键) 取回登记项：比对「同一组件上的两条规则」时要的就是那一条，不是又造一份数 */
    private static Rule ruleOf(Class<?> dto, String component, String contractKey) {
        return RULES.stream()
                .filter(r -> r.dto() == dto
                        && r.component().equals(component)
                        && r.contractKey().equals(contractKey))
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "登记表里没有 " + dto.getSimpleName() + "." + component + "." + contractKey + "，比对不能空转"));
    }

    /**
     * 从定长正则里取位数（{@code ^\d{6}$} → 6）。
     *
     * <p>取不到、或那是个区间量词，都直接抛而不是回一个默认值：回默认值会让这条门禁在形状变复杂后<b>悄悄失效</b>，
     * 而那正是本类要挡的东西。
     */
    private static int digitsOf(String pattern) {
        Matcher span = Pattern.compile("\\{(\\d+)(?:,(\\d+))?}").matcher(pattern);
        assertThat(span.find()).as("正则里没有位数边界：%s", pattern).isTrue();
        assertThat(span.group(2)).as("位数不是定长，单个常量表达不了，本门禁不猜：%s", pattern).isNull();
        return Integer.parseInt(span.group(1));
    }

    private static int contractBound(String schema, String component, String contractKey) {
        JsonNode bound = "itemsMaxLength".equals(contractKey)
                ? contractProperty(schema, component).path("items").path("maxLength")
                : contractProperty(schema, component).path(contractKey);
        assertThat(bound.isNumber())
                .as("契约里没有 %s.%s.%s（字段改名、注解去掉了上限，或契约没重新导出）", schema, component, contractKey)
                .isTrue();
        return bound.asInt();
    }

    private static String contractPattern(Class<?> dto, String component) {
        return contractProperty(dto.getSimpleName(), component).path("pattern").asString("");
    }

    private static JsonNode contractProperty(String schema, String component) {
        JsonNode property = SPEC.path("components")
                .path("schemas")
                .path(schema)
                .path("properties")
                .path(component);
        assertThat(property.isObject()).as("契约里没有 %s.%s 这一格", schema, component).isTrue();
        return property;
    }

    private static JsonNode readSpec() {
        try {
            assertThat(COMMITTED_SPEC)
                    .as("找不到 %s（本测试假定 working dir = apps/server）", COMMITTED_SPEC.toAbsolutePath())
                    .exists();
            return MAPPER.readTree(Files.readString(COMMITTED_SPEC, StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new IllegalStateException("读取 openapi/api-docs.json 失败", e);
        }
    }

    private static String patternOf(Class<?> dto, String component) {
        return field(dto, component)
                .getAnnotation(jakarta.validation.constraints.Pattern.class)
                .regexp();
    }

    /** 前端词表就住在 TS 源码里，正则取出它自己声明的那个数（不 import、不跑 node） */
    private static int tsNumber(String file, String constant) throws IOException {
        // 容忍分节符与类型标注：`const COUPON_MAX_TOTAL = 1_000_000` 与 `= 999 as const` 都是同一个数，
        // 早先这里只认 `= (\d+)`，于是写成分节形式的边界会从所有比对里无声漏掉
        Matcher m = Pattern.compile("(?:export )?const " + constant + "\\s*(?::\\s*number)?\\s*=\\s*([0-9][0-9_]*)\\b")
                .matcher(tsSource(file));
        assertThat(m.find()).as("%s 里没声明 %s", file, constant).isTrue();
        return Integer.parseInt(m.group(1).replace("_", ""));
    }

    /**
     * 取出 TS 侧字符串常量的<b>求值结果</b>：字符串直接去转义，模板串里的 {@code ${X}} 按同文件声明的数字代入。
     *
     * <p>为什么要代入而不是禁止模板串：后端那句提示本身就是 {@code "商品标题最长 " + NAME_MAX + " 字"}，
     * 前端照抄成 {@code `商品标题最长 ${PRODUCT_NAME_MAX} 字`} 才是「同一规则一份文案」；
     * 这里若退化成比源码文本，就等于要求两边各写一遍 30 —— 而那正是本类要消灭的东西。
     */
    private static String tsString(String file, String constant) throws IOException {
        String source = tsSource(file);
        Matcher m = Pattern.compile("export const " + constant + " = (\"(?:[^\"\\\\]|\\\\.)*\"|`(?:[^`\\\\]|\\\\.)*`)")
                .matcher(source);
        assertThat(m.find())
                .as("%s 里没把 %s 声明成字符串常量（改成算式或删掉了，两边就不再可比）", file, constant)
                .isTrue();
        String literal = m.group(1);
        String value = unescapeTs(literal.substring(1, literal.length() - 1));
        Matcher interp = Pattern.compile("\\$\\{(\\w+)}").matcher(value);
        StringBuilder out = new StringBuilder();
        while (interp.find()) {
            // 只支持代入同文件里的数字常量：文案里嵌的正是那个上限
            interp.appendReplacement(out, String.valueOf(tsNumber(file, interp.group(1))));
        }
        interp.appendTail(out);
        return out.toString();
    }

    /** TS 文件路径：带 {@code /} 的按仓库根算，裸文件名按 packages/common/src 算 */
    private static String tsSource(String file) throws IOException {
        Path path = file.contains("/") ? REPO_ROOT.resolve(file) : TS_COMMON.resolve(file);
        assertThat(path).as("找不到前端词表文件 %s", path.toAbsolutePath()).exists();
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    /** 按 TS 的转义语义还原：{@code \\d} → {@code \d}，未知转义丢反斜杠（{@code \-} → {@code -}） */
    private static String unescapeTs(String value) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c != '\\' || i + 1 == value.length()) {
                out.append(c);
                continue;
            }
            char next = value.charAt(++i);
            out.append(
                    switch (next) {
                        case 'n' -> "\n";
                        case 't' -> "\t";
                        default -> String.valueOf(next);
                    });
        }
        return out.toString();
    }

    /** 从 Java 侧 {@code @Pattern} 的 {@code {a,b}} 取位数边界：正则只写一遍，边界从它身上取 */
    private static int boundOf(String javaPattern, boolean min) {
        Matcher m = Pattern.compile("\\{(\\d+),(\\d+)}").matcher(javaPattern);
        assertThat(m.find()).as("正则里没有 {a,b} 位数边界：%s", javaPattern).isTrue();
        return Integer.parseInt(min ? m.group(1) : m.group(2));
    }

    /**
     * 读 Java 侧<b>对外不可见</b>的那个数字：直接从源码文本里取 {@code static final int NAME = n;}。
     *
     * <p>为什么不走反射：{@code CategoryService.MAX_LEVEL} 是 private 的（只有那个服务自己读），而它也不在
     * 契约里出现（level 由 parentId 推导，不是入参）——于是这一格既没有可读的公开常量，也没有可比的那一边，
     * 但前端仍然必须镜像它（界面上「还能不能再挂子级」就是从这一格来的）。反射取 private 字段要 setAccessible，
     * 测试模块默认不给；源码文本是这个数字除「前端各写一份字面量」之外唯一的核对方式。
     *
     * <p>取不到就抛而不是回默认值：常量改名或被换成算式时，回默认值会让这条门禁<b>悄悄变成永真</b>。
     */
    private static int javaSourceConst(Class<?> owner, String constant) {
        Path source = MAIN_JAVA.resolve(owner.getName().replace('.', '/') + ".java");
        assertThat(source).as("找不到 Java 侧常量所在文件 %s", source.toAbsolutePath()).exists();
        String code;
        try {
            code = SourceScanner.withoutComments(SourceScanner.read(source));
        } catch (IOException e) {
            throw new IllegalStateException("读取 " + source + " 失败", e);
        }
        Matcher m = Pattern.compile("static final int " + constant + "\\s*=\\s*(\\d+)\\s*;")
                .matcher(code);
        assertThat(m.find())
                .as("%s 里没有 `static final int %s = <裸整数>;`（改名或换成算式了，前端那份镜像就没人钉了）", owner.getSimpleName(), constant)
                .isTrue();
        return Integer.parseInt(m.group(1));
    }

    /**
     * 按版本号回放全部迁移，得到「当前库里这一格的数字」：{@code VARCHAR(n)} 列宽或
     * {@code CHECK (col BETWEEN a AND b)} 的上界，同一个键空间；后写的 {@code ALTER COLUMN ... TYPE} 覆盖先前的定义。
     */
    private static Map<String, Integer> dbNumbers() {
        Map<String, Integer> numbers = new LinkedHashMap<>();
        Pattern createTable = Pattern.compile("^CREATE TABLE IF NOT EXISTS (\\w+\\.\\w+)");
        Pattern alterTable = Pattern.compile("^ALTER TABLE (\\w+\\.\\w+)");
        Pattern varchar = Pattern.compile("^(\\w+)\\s+VARCHAR\\((\\d+)\\)");
        Pattern widen = Pattern.compile("ALTER COLUMN (\\w+) TYPE VARCHAR\\((\\d+)\\)");
        /**
         * 后加的列也带宽度。{@code IF NOT EXISTS} 那一段曾经漏掉，而漏法是无声的：正则只认
         * {@code ADD COLUMN 列名 VARCHAR(n)}，于是全部「后加的列」（V36 的 {@code category_attr_values.image}
         * 等 19 处）不进这张表，「入站上限不越过库上那一格」对那些格子整体失明——包括被人引用最多的一批。
         */
        Pattern addColumn = Pattern.compile("ADD COLUMN (?:IF NOT EXISTS )?(\\w+)\\s+VARCHAR\\((\\d+)\\)");
        Pattern between = Pattern.compile("CHECK \\((\\w+) BETWEEN \\d+ AND (\\d+)\\)");
        Pattern moveTable = Pattern.compile("^ALTER TABLE (\\w+\\.(\\w+)) SET SCHEMA (\\w+)");
        Pattern renameSchema = Pattern.compile("^ALTER SCHEMA (\\w+) RENAME TO (\\w+)");
        Pattern renameColumn = Pattern.compile("^ALTER TABLE (\\w+\\.\\w+) RENAME COLUMN (\\w+) TO (\\w+)");
        String table = null;
        boolean inCreate = false;
        try {
            List<Path> files;
            try (Stream<Path> listed = Files.list(MIGRATIONS)) {
                files = listed.filter(p -> MIGRATION_NAME
                                .matcher(p.getFileName().toString())
                                .matches())
                        .sorted(Comparator.comparingInt(FieldRuleVocabularyTest::migrationVersion))
                        .toList();
            }
            assertThat(files).as("迁移目录 %s 没扫到文件", MIGRATIONS.toAbsolutePath()).isNotEmpty();
            for (Path file : files) {
                for (String raw : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                    String line = raw.strip();
                    Matcher created = createTable.matcher(line);
                    if (created.find()) {
                        table = created.group(1);
                        inCreate = true;
                        continue;
                    }
                    if (line.startsWith(")")
                            || line.startsWith("COMMENT")
                            || line.startsWith("CREATE INDEX")
                            || line.startsWith("CREATE UNIQUE")
                            || line.startsWith("INSERT")
                            || line.startsWith("UPDATE")
                            || line.startsWith("DELETE")
                            || line.startsWith("DROP")) {
                        inCreate = false;
                        continue;
                    }
                    // 搬家与改名：不改键名，登记在词表里的那些「落点」就会停在旧库结构上——列宽还是对的（宽度跟着列走），
                    // 但登记表写的那个名字在库里已经不存在了，下一次迁移改到真名那一格就再也对不上。
                    Matcher moved = moveTable.matcher(line);
                    if (moved.find()) {
                        rekey(numbers, moved.group(1) + ".", moved.group(3) + "." + moved.group(2) + ".");
                        continue;
                    }
                    Matcher renamedSchema = renameSchema.matcher(line);
                    if (renamedSchema.find()) {
                        rekey(numbers, renamedSchema.group(1) + ".", renamedSchema.group(2) + ".");
                        continue;
                    }
                    Matcher renamedColumn = renameColumn.matcher(line);
                    if (renamedColumn.find()) {
                        String column = renamedColumn.group(2);
                        rekey(
                                numbers,
                                renamedColumn.group(1) + "." + column,
                                renamedColumn.group(1) + "." + renamedColumn.group(3));
                        continue;
                    }
                    Matcher altered = alterTable.matcher(line);
                    if (altered.find()) {
                        table = altered.group(1);
                        inCreate = false;
                        continue;
                    }
                    if (table == null) {
                        continue;
                    }
                    put(numbers, varchar, line, table, inCreate);
                    put(numbers, widen, line, table, true);
                    // 后加的列也带宽度：只读 CREATE 会让「入站上限不越过列宽」对这一格失明
                    put(numbers, addColumn, line, table, true);
                    put(numbers, between, line, table, inCreate);
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("回放迁移失败", e);
        }
        return numbers;
    }

    /**
     * 换前缀：表搬 schema、schema 改名、列改名之后，登记表要用<b>今天</b>那个名字。
     *
     * <p>不改键名的话漂移是双向的：登记在词表里的那个落点在库里已经不存在（列宽倒是还跟着列走，所以数字
     * 仍然对得上，看起来一切正常），而真名那一格日后被 {@code ALTER COLUMN TYPE} 改窄时，扫描器写进新键、
     * 登记表还指着旧键——「不许越过列宽」那条断言当场失明。
     */
    private static void rekey(Map<String, Integer> numbers, String from, String to) {
        List<String> hits =
                numbers.keySet().stream().filter(key -> key.startsWith(from)).toList();
        for (String key : hits) {
            numbers.put(to + key.substring(from.length()), numbers.remove(key));
        }
    }

    private static void put(Map<String, Integer> out, Pattern pattern, String line, String table, boolean enabled) {
        if (!enabled) {
            return;
        }
        Matcher m = pattern.matcher(line);
        if (m.find()) {
            out.put(table + "." + m.group(1), Integer.parseInt(m.group(2)));
        }
    }

    private static int migrationVersion(Path file) {
        Matcher m = MIGRATION_NAME.matcher(file.getFileName().toString());
        return m.matches() ? Integer.parseInt(m.group(1)) : 0;
    }
}

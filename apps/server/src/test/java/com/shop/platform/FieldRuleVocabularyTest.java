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
import com.shop.platform.account.dto.SmsLoginRequest;
import com.shop.platform.account.dto.UpdateProfileRequest;
import com.shop.platform.aftersale.dto.ApplyAfterSaleRequest;
import com.shop.platform.aftersale.dto.RejectAfterSaleRequest;
import com.shop.platform.aftersale.dto.ReturnGoodsRequest;
import com.shop.platform.cart.dto.AddCartItemRequest;
import com.shop.platform.cart.dto.UpdateCartItemRequest;
import com.shop.platform.cms.dto.BannerRequest;
import com.shop.platform.cms.dto.CmsFieldRules;
import com.shop.platform.cms.dto.NavRequest;
import com.shop.platform.cms.dto.RecommendTabRequest;
import com.shop.platform.common.AddressFieldRules;
import com.shop.platform.common.NoteFieldRules;
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
import com.shop.platform.product.dto.CreateProductRequest;
import com.shop.platform.product.dto.ProductFieldRules;
import com.shop.platform.product.dto.UpdateProductRequest;
import com.shop.platform.shop.dto.MerchantAddressRequest;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.lang.annotation.Annotation;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
 * <p>方向刻意不对称：入站上限<b>允许比列宽更紧</b>（昵称 30 而 {@code auth.users.nickname} 是 50——
 * 早一步在 400 挡住比让脏值撞列宽好），但不允许更松（越过列宽就是 500）。DB 兜底那一格
 * （件数 CHECK）则要求<b>相等</b>：入口比 DB 宽时，超出的件数会被 {@code LEAST} 静默改写而不是被拒。
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

    /** Java 侧把字数预算直接写进注解的形态 */
    private static final Pattern BARE_NOTE_LIMIT = Pattern.compile("\\bmax\\s*=\\s*200\\b");

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
                    "user_profile.addresses.receiver_name"),
            new Rule(
                    AddressRequest.class,
                    "province",
                    AddressFieldRules.NAME_MAX,
                    "AddressFieldRules.NAME_MAX",
                    "maxLength",
                    "user_profile.addresses.province"),
            new Rule(
                    AddressRequest.class,
                    "city",
                    AddressFieldRules.NAME_MAX,
                    "AddressFieldRules.NAME_MAX",
                    "maxLength",
                    "user_profile.addresses.city"),
            new Rule(
                    AddressRequest.class,
                    "district",
                    AddressFieldRules.NAME_MAX,
                    "AddressFieldRules.NAME_MAX",
                    "maxLength",
                    "user_profile.addresses.district"),
            new Rule(
                    AddressRequest.class,
                    "detail",
                    AddressFieldRules.DETAIL_MAX,
                    "AddressFieldRules.DETAIL_MAX",
                    "maxLength",
                    "user_profile.addresses.detail"),
            new Rule(
                    AddressRequest.class,
                    "label",
                    AddressFieldRules.LABEL_MAX,
                    "AddressFieldRules.LABEL_MAX",
                    "maxLength",
                    "user_profile.addresses.label"),
            new Rule(
                    MerchantAddressRequest.class,
                    "contactName",
                    AddressFieldRules.NAME_MAX,
                    "AddressFieldRules.NAME_MAX",
                    "maxLength",
                    "merchant_address.addresses.contact_name"),
            new Rule(
                    MerchantAddressRequest.class,
                    "province",
                    AddressFieldRules.NAME_MAX,
                    "AddressFieldRules.NAME_MAX",
                    "maxLength",
                    "merchant_address.addresses.province"),
            new Rule(
                    MerchantAddressRequest.class,
                    "district",
                    AddressFieldRules.NAME_MAX,
                    "AddressFieldRules.NAME_MAX",
                    "maxLength",
                    "merchant_address.addresses.district"),
            new Rule(
                    MerchantAddressRequest.class,
                    "detail",
                    AddressFieldRules.DETAIL_MAX,
                    "AddressFieldRules.DETAIL_MAX",
                    "maxLength",
                    "merchant_address.addresses.detail"),
            // —— 账号：一个数被四个登录/改密入口共用
            new Rule(
                    PasswordLoginRequest.class,
                    "phone",
                    AccountFieldRules.PHONE_MAX,
                    "AccountFieldRules.PHONE_MAX",
                    "maxLength",
                    "auth.users.phone"),
            new Rule(
                    PasswordLoginRequest.class,
                    "phone",
                    AccountFieldRules.PHONE_MIN,
                    "AccountFieldRules.PHONE_MIN",
                    "minLength",
                    "auth.users.phone"),
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
                    "auth.users.nickname"),
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
                    "merchant_address.addresses.note"),
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
                    "coupon.coupon_templates.name"));

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
                    "这一格是图形码上印了几个字符，契约那 10 位是给换更长码留的容量"));

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
        for (Rule rule : withColumn) {
            for (String column : rule.columns()) {
                Integer bound = DB.get(column);
                assertThat(bound)
                        .as("%s：迁移里找不到 %s 这一格的宽度/约束（列改名或登记写错）", rule, column)
                        .isNotNull();
                // 入口比列宽紧是允许的（早点 400），比列宽松则是 500
                assertThat(rule.ownerValue())
                        .as("%s：入站上限越过 %s 的那一格（列宽 %s），超出部分会撞库而不是撞校验", rule, column, bound)
                        .isLessThanOrEqualTo(bound);
            }
        }
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
        assertThat(tsNumber("address.ts", "ADDRESS_NAME_MAX"))
                .as("packages/common/src/address.ts 的人名上限")
                .isEqualTo(AddressFieldRules.NAME_MAX);
        assertThat(tsNumber("address.ts", "ADDRESS_DETAIL_MAX")).as("详址上限").isEqualTo(AddressFieldRules.DETAIL_MAX);
        // 承运商 code 不镜像到前端：它不是用户输入（两端从字典选），抄一份没人读的常量就是孤儿
        assertThat(tsNumber("tracking.ts", "CARRIER_NAME_MAX")).isEqualTo(TrackingFieldRules.CARRIER_NAME_MAX);
        assertThat(tsNumber("tracking.ts", "TRACKING_NO_MAX")).isEqualTo(TrackingFieldRules.TRACKING_NO_MAX);
        assertThat(tsNumber("product-fields.ts", "PRODUCT_NAME_MAX")).isEqualTo(ProductFieldRules.NAME_MAX);
        // 卖点的 10 与 30 在 Java 侧只以正则存在，所以从正则里取数比较，而不是两边各写一遍字面量
        assertThat(tsNumber("product-fields.ts", "SELL_POINT_MIN"))
                .as("卖点下限（Java 侧只在 SELL_POINT_PATTERN 的 {10,30} 里）")
                .isEqualTo(boundOf(ProductFieldRules.SELL_POINT_PATTERN, true));
        assertThat(tsNumber("product-fields.ts", "SELL_POINT_MAX"))
                .isEqualTo(boundOf(ProductFieldRules.SELL_POINT_PATTERN, false));
        // 账号侧形状住在 app-kit（登录框在那），注销与邀请成员复用同一条
        assertThat(tsNumber("packages/app-kit/src/login-schema.ts", "SMS_CODE_DIGITS"))
                .as("验证码位数：前端 owner 与 AccountFieldRules 是否还是同一个数")
                .isEqualTo(AccountFieldRules.SMS_CODE_LENGTH);
        assertThat(tsNumber("packages/app-kit/src/login-schema.ts", "PASSWORD_MIN"))
                .as("密码下限：注册/改密表单的控件位数与登录侧词表")
                .isEqualTo(AccountFieldRules.PASSWORD_MIN);
        assertThat(tsNumber("packages/app-kit/src/login-schema.ts", "NICKNAME_MAX"))
                .as("昵称上限：资料页的 maxLength 与 AccountFieldRules.NICKNAME_MAX")
                .isEqualTo(AccountFieldRules.NICKNAME_MAX);
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

    @Test
    void app里不许有裸的字数上限字面量() throws IOException {
        // 镜像必须是指向 owner 的具名引用：写成 maxLength={200} 就没人知道它是契约的哪一格，改了契约也不会红
        List<String> inline;
        try (Stream<Path> walk = Stream.of(
                        "apps/web/src",
                        "apps/seller/src",
                        "apps/admin/src",
                        "packages/common/src",
                        "packages/app-kit/src",
                        "packages/ui-web/src")
                .filter(p -> Files.isDirectory(REPO_ROOT.resolve(p)))
                .flatMap(p -> streamOf(p))) {
            inline = walk.filter(
                            p -> p.toString().endsWith(".ts") || p.toString().endsWith(".tsx"))
                    .filter(p -> {
                        try {
                            String code = stripComments(Files.readString(p, StandardCharsets.UTF_8));
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
    void 一段说明的上限不退回字面量() throws IOException {
        List<String> owners;
        try (Stream<Path> walk = Files.walk(MAIN_JAVA)) {
            owners = walk.filter(p -> p.toString().endsWith(".java"))
                    .filter(p -> {
                        try {
                            return stripComments(Files.readString(p, StandardCharsets.UTF_8))
                                    .contains("NoteFieldRules.FREE_TEXT_MAX");
                        } catch (IOException e) {
                            throw new IllegalStateException(e);
                        }
                    })
                    .map(p -> MAIN_JAVA.relativize(p).toString().replace('\\', '/'))
                    .toList();
        }
        assertThat(owners).as("引用字数预算 owner 的入口数：一个概念散回七个字面量就是本条要挡的").hasSizeGreaterThanOrEqualTo(7);
        List<String> literals;
        try (Stream<Path> walk = Files.walk(MAIN_JAVA)) {
            literals = walk.filter(p -> p.toString().endsWith(".java"))
                    .filter(p -> {
                        try {
                            return BARE_NOTE_LIMIT
                                    .matcher(stripComments(Files.readString(p, StandardCharsets.UTF_8)))
                                    .find();
                        } catch (IOException e) {
                            throw new IllegalStateException(e);
                        }
                    })
                    .map(p -> p.getFileName().toString())
                    .toList();
        }
        assertThat(literals)
                .as("又有人把 200 直接写进 @Size：那是一列 VARCHAR(200) 的字数预算，走 NoteFieldRules.FREE_TEXT_MAX")
                .containsExactly("RefreshRequest.java");
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
        // 联系电话的形状在前端也只许有一份，且与 Java 逐字节同串
        assertThat(tsString("address.ts", "CONTACT_PHONE_PATTERN"))
                .as("packages/common/src/address.ts 里那份联系电话正则")
                .isEqualTo(PhoneNumber.CONTACT_PATTERN);
        assertThat(tsNumber("address.ts", "CONTACT_PHONE_MAX"))
                .as("联系电话位数：input 的 maxLength 拿不到正则，只能另起一个名字，但数得从同一条规则来")
                .isEqualTo(boundOf(PhoneNumber.CONTACT_PATTERN, false));
    }

    @Test
    void 词表以常量出现而不退回字面量() throws IOException {
        for (Rule rule : RULES) {
            Path source = MAIN_JAVA.resolve(rule.dto().getName().replace('.', '/') + ".java");
            assertThat(source).as("找不到 DTO 源码").exists();
            String code = stripComments(Files.readString(source, StandardCharsets.UTF_8))
                    .replaceAll("\\s+", " ");
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
        // 每条登记都还指得着东西：反射、契约、源码三边都要能取到值
        for (Rule rule : RULES) {
            annotationNumber(rule);
            contractNumber(rule);
        }
    }

    /** 读编译进字节码的注解值——不是源码文本，反射取到的就是 springdoc 看到的同一个数 */
    private static int annotationNumber(Rule rule) {
        Field field = field(rule.dto(), rule.component());
        return switch (rule.contractKey()) {
            case "maxLength", "maxItems" -> size(field, rule).max();
            case "minLength" -> size(field, rule).min();
            case "maximum" ->
                (int) require(field.getAnnotation(Max.class), Max.class, rule).value();
            default -> throw new IllegalStateException("登记表里的契约键不认识：" + rule);
        };
    }

    private static Size size(Field field, Rule rule) {
        return require(field.getAnnotation(Size.class), Size.class, rule);
    }

    /** 注解上那句 message（默认占位串原样返回，其中不含数字，比对自会跳过） */
    private static String annotationMessage(Rule rule) {
        Field field = field(rule.dto(), rule.component());
        return switch (rule.contractKey()) {
            case "maxLength", "minLength", "maxItems" -> size(field, rule).message();
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

    private static int contractBound(String schema, String component, String contractKey) {
        JsonNode bound = contractProperty(schema, component).path(contractKey);
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
        Matcher m =
                Pattern.compile("(?:export )?const " + constant + " = (\\d+)").matcher(tsSource(file));
        assertThat(m.find()).as("%s 里没声明 %s", file, constant).isTrue();
        return Integer.parseInt(m.group(1));
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
     * 按版本号回放全部迁移，得到「当前库里这一格的数字」：{@code VARCHAR(n)} 列宽或
     * {@code CHECK (col BETWEEN a AND b)} 的上界，同一个键空间；后写的 {@code ALTER COLUMN ... TYPE} 覆盖先前的定义。
     */
    private static Map<String, Integer> dbNumbers() {
        Map<String, Integer> numbers = new LinkedHashMap<>();
        Pattern createTable = Pattern.compile("^CREATE TABLE IF NOT EXISTS (\\w+\\.\\w+)");
        Pattern alterTable = Pattern.compile("^ALTER TABLE (\\w+\\.\\w+)");
        Pattern varchar = Pattern.compile("^(\\w+)\\s+VARCHAR\\((\\d+)\\)");
        Pattern widen = Pattern.compile("ALTER COLUMN (\\w+) TYPE VARCHAR\\((\\d+)\\)");
        Pattern addColumn = Pattern.compile("ADD COLUMN (\\w+)\\s+VARCHAR\\((\\d+)\\)");
        Pattern between = Pattern.compile("CHECK \\((\\w+) BETWEEN \\d+ AND (\\d+)\\)");
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

    private static String stripComments(String text) {
        return text.replaceAll("/\\*[\\s\\S]*?\\*/", " ").replaceAll("//[^\\n]*", " ");
    }
}

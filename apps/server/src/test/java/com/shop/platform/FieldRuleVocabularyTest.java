package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.account.dto.AccountFieldRules;
import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.dto.ConfirmDeletionRequest;
import com.shop.platform.account.dto.LoginRequest;
import com.shop.platform.account.dto.PasswordLoginRequest;
import com.shop.platform.account.dto.RefreshRequest;
import com.shop.platform.account.dto.ResetPasswordRequest;
import com.shop.platform.account.dto.SetPasswordRequest;
import com.shop.platform.account.dto.SmsLoginRequest;
import com.shop.platform.account.dto.UpdateProfileRequest;
import com.shop.platform.aftersale.dto.ReturnGoodsRequest;
import com.shop.platform.cart.dto.AddCartItemRequest;
import com.shop.platform.cart.dto.UpdateCartItemRequest;
import com.shop.platform.common.AddressFieldRules;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.Quantities;
import com.shop.platform.common.TrackingFieldRules;
import com.shop.platform.logistics.dto.CreateShipmentRequest;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
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
    private static final Path TS_COMMON = Path.of("..", "..", "packages", "common", "src");
    private static final Path COMMITTED_SPEC = Path.of("..", "..", "openapi", "api-docs.json");

    /** 必须声明在 {@link #DB} 之前：静态初始化按源码顺序跑，回放迁移的过滤器要用到它 */
    private static final Pattern MIGRATION_NAME = Pattern.compile("^V(\\d+)__.+\\.sql$");

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
                    "aftersale.tickets.return_tracking_no"));

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
    }

    @Test
    void 号码与验证码形状各只有一份() {
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
    }

    @Test
    void 词表以常量出现而不退回字面量() throws IOException {
        for (Rule rule : RULES) {
            Path source = MAIN_JAVA.resolve(rule.dto().getName().replace('.', '/') + ".java");
            assertThat(source).as("找不到 DTO 源码").exists();
            String code = stripComments(Files.readString(source, StandardCharsets.UTF_8))
                    .replaceAll("\\s+", " ");
            // 上限常量必须紧邻它所约束的那个组件：注解与字段之间隔着多少写法都不算，隔出一个字面量才算漂移
            Matcher cited = Pattern.compile(
                            Pattern.quote(rule.ownerToken()) + "[\\s\\S]{0,80}?\\b" + rule.component() + "\\b")
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
        JsonNode bound = contractProperty(rule.schema(), rule.component()).path(rule.contractKey());
        assertThat(bound.isNumber())
                .as("契约里没有 %s.%s.%s（字段改名、注解去掉了上限，或契约没重新导出）", rule.schema(), rule.component(), rule.contractKey())
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
        Path path = TS_COMMON.resolve(file);
        assertThat(path).as("找不到前端词表文件 %s", path.toAbsolutePath()).exists();
        Matcher m = Pattern.compile("export const " + constant + " = (\\d+)")
                .matcher(Files.readString(path, StandardCharsets.UTF_8));
        assertThat(m.find()).as("%s 里没声明 %s", file, constant).isTrue();
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

package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.Money;
import com.tngtech.archunit.core.domain.AccessTarget;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * 金额必须是 Money（AGENTS.md 高频硬规则第一条）的机器闸门。
 *
 * <p>「所有金额用 Money，不裸传 int64」写在文档里就一定会漂：某次新增出参顺手写个 {@code Long price}，
 * 编译、测试、契约全绿，只有前端拿到 29900 时不知道该按什么币种、什么单位展示。
 * 这里把这句话变成 {@code mvn test} 的红：
 *
 * <ul>
 *   <li><b>传输层（dto / api / controller / service / events）里金额形状的字段只能是 Money</b>。
 *       这些包的 record 就是跨模块契约与 HTTP 契约本身，字段即接口。
 *   <li><b>币种列只存在于实体与 Money 里</b>：出参/入参上再挂一个 {@code String currency}，
 *       就是在邀请消费方把两个字段拼错（拼错不会报错，只会算错钱）。
 *   <li><b>「分 + 币种」这一列对由行自己换算，调用点不裸拼</b>：{@code Money.ofFen(x.getAmount(), x.getCurrency())}
 *       写在 service 里，与实体上的 {@code amountAsMoney()} 就是同一件事的两个实现——两者对「金额为 NULL」
 *       的答案可以不一样（一个抛 NPE、一个给 null），而抛的那个通常是后来那个。
 *   <li><b>带币种列的实体必须自己交出 {@code xxxAsMoney()} 视图</b>：上一条只挡「别人来拼」，这一条保证
 *       「有得拼的人已经写了出口」，否则豁免就成了没有对价的空子。
 * </ul>
 *
 * <p>读侧例外是一份逐名登记的白名单（三个裸 SQL 行投影，见 {@link #READ_SIDE_ROW_READERS}）：那里读的是
 * {@code ResultSet} 的列而不是实体的 getter，没有实体可以挂方法。
 *
 * <p>mapper 包与 infra.db（裸 SQL 基建、开发期造数器）刻意豁免：那里就是「分 + 币种」两列的形状（见 V58），
 * 实体是行的形状不是契约的形状，收口靠实体的 {@code xxxAsMoney()} 派生方法。
 */
class MoneyTypeRulesTest {

    /** 金额字段的命名特征：以 Price / Amount / Fee / Refund / Discount 结尾（minPrice、payAmount、firstFee 都在内） */
    private static final Pattern AMOUNT_NAME = Pattern.compile("(?i).*(price|amount|fee|refund|discount)$");

    /** 契约所在的包名段：出现在这里的 record 字段就是跨模块 / HTTP 契约 */
    private static final List<String> CONTRACT_PACKAGES = List.of("dto", "api", "controller", "service", "events");

    /**
     * 读侧行投影白名单：裸 SQL 从 {@code ResultSet} 取列，没有实体可以挂换算方法。
     * 逐名登记而不是按包名放开，是为了让「谁还在拼列对」这份名单永远数得过来。
     */
    private static final Set<String> READ_SIDE_ROW_READERS = Set.of(
            "com.shop.platform.order.api.OrderReadQuery",
            "com.shop.platform.product.api.ProductReadQuery",
            "com.shop.platform.product.api.ProductRecallQuery");

    private static final JavaClasses PROD = new ClassFileImporter()
            .withImportOption(new ImportOption.DoNotIncludeTests())
            .importPackages("com.shop.platform");

    @Test
    void 契约层的金额字段必须是Money() {
        List<String> violations = new ArrayList<>();
        for (JavaClass clazz : PROD) {
            // Money 自己是「amount + currency」的定义处，它的 amount 字段就是那个裸分
            if (!isContractLayer(clazz) || clazz.isEquivalentTo(Money.class)) {
                continue;
            }
            for (JavaField field : clazz.getFields()) {
                if (isStatic(field) || !AMOUNT_NAME.matcher(field.getName()).matches()) {
                    continue;
                }
                if (!field.getRawType().isEquivalentTo(Money.class)) {
                    violations.add(field.getFullName() + " 是金额字段，类型必须是 Money，不能是 "
                            + field.getRawType().getSimpleName() + "（裸分没有币种，消费方只能猜）");
                }
            }
        }
        assertThat(violations).as("契约层裸传金额").isEmpty();
    }

    @Test
    void 币种列只在实体和Money里() {
        List<String> violations = new ArrayList<>();
        for (JavaClass clazz : PROD) {
            if (isRowShaped(clazz) || clazz.isEquivalentTo(Money.class)) {
                continue;
            }
            for (JavaField field : clazz.getFields()) {
                if (isStatic(field) || !field.getName().equals("currency")) {
                    continue;
                }
                violations.add(field.getFullName() + " 单独存了币种：币种应与金额同体（Money），" + "两个孤立字段迟早被拼错");
            }
        }
        assertThat(violations).as("契约层散落的 currency 字段").isEmpty();
    }

    @Test
    void 金额列对只在实体里换算() {
        List<String> violations = new ArrayList<>();
        int conversionsInRowShape = 0;
        for (JavaClass clazz : PROD) {
            for (JavaMethodCall call : clazz.getMethodCallsFromSelf()) {
                if (!isMoneyFactory(call.getTarget())) {
                    continue;
                }
                // 行形状所在处就是「分 + 币种」两列的地方，换算是它的活；Money 自己内部互转不算
                if (clazz.isEquivalentTo(Money.class)
                        || isRowShaped(clazz)
                        || READ_SIDE_ROW_READERS.contains(clazz.getName())) {
                    conversionsInRowShape++;
                    continue;
                }
                violations.add(clazz.getName() + " 调了 " + call.getTarget().getName()
                        + "：把实体的两个 getter 拼成 Money 是实体的活（"
                        + "同一列对在两处按不同空值口径换算，就是在「缺金额算 0 / 算 null」上给了两个答案）");
            }
        }
        assertThat(violations).as("实体外裸拼金额列对").isEmpty();
        // 防自转：谓词若永远匹配不上，上面那条就是假绿
        assertThat(conversionsInRowShape).as("一处换算都没扫到 = 谓词或豁免包名失效").isGreaterThan(10);
    }

    /**
     * 豁免的对应面：既然「拼列对」只许在行形状里做，那里就必须已经有出口。
     * 嵌套类是字段表的副本（Lombok {@code @SuperBuilder} 生成的 {@code $Builder}、造数器里的行 helper），
     * 它们没有换算的职责。
     */
    @Test
    void 带币种列的实体自己交出Money视图() {
        List<String> violations = new ArrayList<>();
        int checked = 0;
        for (JavaClass clazz : PROD) {
            if (clazz.isEquivalentTo(Money.class) || clazz.getName().contains("$")) {
                continue;
            }
            boolean hasCurrency = clazz.getFields().stream()
                    .anyMatch(f -> !isStatic(f) && f.getName().equals("currency"));
            if (!hasCurrency) {
                continue;
            }
            checked++;
            boolean hasView = clazz.getMethods().stream()
                    .anyMatch(m -> m.getName().endsWith("AsMoney")
                            && m.getRawReturnType().isEquivalentTo(Money.class));
            if (!hasView) {
                violations.add(clazz.getName() + " 存了 currency 列却没有 xxxAsMoney() 视图");
            }
        }
        assertThat(checked).as("没有实体带币种列，本测试无事可做").isGreaterThan(5);
        assertThat(violations).as("金额列对没有出口").isEmpty();
    }

    /** Money 的两个「列对 → 值」工厂：只许在行形状里被调用 */
    private static boolean isMoneyFactory(AccessTarget.MethodCallTarget factory) {
        return factory.getOwner().isEquivalentTo(Money.class)
                && (factory.getName().equals("ofFen") || factory.getName().equals("ofFenOrNull"));
    }

    /** 按包名段匹配：ArchUnit 的 packageName 不带首尾点，用 {@code contains(".dto.")} 会漏掉末级包 */
    private static boolean inPackage(JavaClass clazz, String... segments) {
        String[] parts = clazz.getPackageName().split("\\.");
        for (String segment : segments) {
            for (String part : parts) {
                if (part.equals(segment)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean isContractLayer(JavaClass clazz) {
        return inPackage(clazz, CONTRACT_PACKAGES.toArray(String[]::new)) || inPackage(clazz, "common");
    }

    /**
     * 行形状所在处：实体（mapper）与裸 SQL 基建（infra.db，含开发期造数器）。
     * 那里的 {@code long 分 + String 币种} 就是数据库列本身，收口靠实体的 xxxAsMoney()。
     */
    private static boolean isRowShaped(JavaClass clazz) {
        return inPackage(clazz, "mapper", "db");
    }

    private static boolean isStatic(JavaField field) {
        return field.getModifiers().contains(JavaModifier.STATIC);
    }
}

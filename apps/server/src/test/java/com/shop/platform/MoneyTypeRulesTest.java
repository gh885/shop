package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.Money;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.util.ArrayList;
import java.util.List;
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
 * </ul>
 *
 * <p>mapper 包与 infra.db（裸 SQL 基建、开发期造数器）刻意豁免：那里就是「分 + 币种」两列的形状（见 V58），
 * 实体是行的形状不是契约的形状，收口靠实体的 {@code xxxAsMoney()} 派生方法。
 */
class MoneyTypeRulesTest {

    /** 金额字段的命名特征：以 Price / Amount / Fee / Refund / Discount 结尾（minPrice、payAmount、firstFee 都在内） */
    private static final Pattern AMOUNT_NAME = Pattern.compile("(?i).*(price|amount|fee|refund|discount)$");

    /** 契约所在的包名段：出现在这里的 record 字段就是跨模块 / HTTP 契约 */
    private static final List<String> CONTRACT_PACKAGES = List.of("dto", "api", "controller", "service", "events");

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

package com.shop.platform;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/**
 * 结构约束。跑在 {@code mvn test} 里，违规就是编译期红灯。
 *
 * <p>只分析 {@code src/main}：测试类用 JdbcTemplate 造数据、断言，那是测试的权利，不是产品的漏洞。
 */
@AnalyzeClasses(packages = "com.shop.platform", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    /**
     * 允许出现原生 SQL 的四类包。
     *
     * <p>{@code common} 和 {@code infra} 是基础设施；{@code api} 是模块对外的点查入口；{@code store} 是模块内部的
     * 数据访问。四类之外一律不许碰 JDBC——否则数据范围校验和审计都能被一条手写 SQL 绕过。
     */
    private static final String[] DATA_ACCESS_PACKAGES = {
        "com.shop.platform.common..",
        "com.shop.platform.infra..",
        "com.shop.platform..api",
        "com.shop.platform..api..",
        "com.shop.platform..store",
        "com.shop.platform..store..",
    };

    @ArchTest
    static final ArchRule 原生SQL只允许出现在四类包 = noClasses()
            .that()
            .resideInAPackage("com.shop.platform..")
            .and()
            .resideOutsideOfPackages(DATA_ACCESS_PACKAGES)
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("org.springframework.jdbc..", "javax.sql..", "java.sql..")
            .because("数据权限和审计绕不过的前提，是手写 SQL 只存在于少数可评审的包里。" + "要写 SQL 就放进 common / infra / api / store");
}

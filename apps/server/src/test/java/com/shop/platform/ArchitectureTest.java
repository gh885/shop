package com.shop.platform;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import java.util.Set;

/**
 * 结构约束。跑在 {@code mvn test} 里，违规就是编译期红灯。
 *
 * <p>只分析 {@code src/main}：测试类用 JdbcTemplate 造数据、断言，那是测试的权利，不是产品的漏洞。
 */
@AnalyzeClasses(packages = "com.shop.platform", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    /**
     * 允许出现原生 SQL 的四类包，名字取自 {@code docs/domain/module-map.md}。
     *
     * <p>{@code common} 和 {@code infra} 是平台能力共享包；{@code api} 是模块对外的点查入口；{@code mapper} 是模块内部的
     * 数据访问（{@code JdbcClient} 和手写 SQL 都住这里）。四类之外一律不许碰 JDBC——否则数据范围校验和审计
     * 都能被一条手写 SQL 绕过。
     */
    private static final String[] DATA_ACCESS_PACKAGES = {
        "com.shop.platform.common..",
        "com.shop.platform.infra..",
        "com.shop.platform..api",
        "com.shop.platform..api..",
        "com.shop.platform..mapper",
        "com.shop.platform..mapper..",
    };

    /** 共享包：不是模块，不受模块内部结构约束。 */
    private static final Set<String> SHARED_PACKAGES = Set.of("common", "infra");

    /**
     * 模块内部允许的子包，逐字取自 {@code docs/domain/module-map.md} 第 8.4 节。
     *
     * <p>多加一个包名就是改蓝图，必须同步改文档；少了这里的约束，半年后每个模块会长成自己的一套目录。
     */
    private static final Set<String> MODULE_SUBPACKAGES =
            Set.of("controller", "dto", "service", "model", "mapper", "api", "events", "internal");

    @ArchTest
    static final ArchRule 原生SQL只允许出现在四类包 = noClasses()
            .that()
            .resideInAPackage("com.shop.platform..")
            .and()
            .resideOutsideOfPackages(DATA_ACCESS_PACKAGES)
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("org.springframework.jdbc..", "javax.sql..", "java.sql..")
            .because("数据权限和审计绕不过的前提，是手写 SQL 只存在于少数可评审的包里。" + "要写 SQL 就放进 common / infra / api / mapper");

    /**
     * 数据访问只有一条路：{@code JdbcClient} + 手写 SQL。
     *
     * <p>为什么专门拦 MyBatis：{@code BaseMapper.updateById} 生成的是 {@code WHERE id = ?}，
     * <b>没有任何状态前置条件</b>。实测把一个已付款订单改回未付款，影响行数 1，成功。
     * 这个项目里每一条写都是条件更新，0 行是判决——引入 ORM 的默认写方法就等于凭空开一个读改写的口子。
     *
     * <p>拦的是 import，不是依赖：依赖可以留在 pom 里没人用，但代码一旦 import 就说明有人开始用了。
     */
    @ArchTest
    static final ArchRule 不引入ORM的默认写方法 = noClasses()
            .that()
            .resideInAPackage("com.shop.platform..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("org.apache.ibatis..", "com.baomidou..", "jakarta.persistence..", "org.hibernate..")
            .because("表映射的 save/updateById 只有 WHERE id = ?，没有状态前置条件。" + "这个项目的写全是 CAS，0 行是判决不是异常，用它的写方法就是超卖");

    @ArchTest
    static final ArchRule 模块内部只住在蓝图画的那几个子包里 = classes()
            .that()
            .resideInAPackage("com.shop.platform..")
            .and()
            .resideOutsideOfPackages("com.shop.platform")
            .should(new ArchCondition<>("只住在 controller / dto / service / model / mapper / api / events / internal") {
                @Override
                public void check(JavaClass item, ConditionEvents events) {
                    String[] segments = item.getPackageName().split("\\.");
                    if (segments.length < 5) {
                        // com.shop.platform 是应用根，com.shop.platform.<module> 是模块根（放 package-info 与装配）
                        return;
                    }
                    String module = segments[3];
                    String subpackage = segments[4];
                    if (SHARED_PACKAGES.contains(module) || MODULE_SUBPACKAGES.contains(subpackage)) {
                        return;
                    }
                    events.add(SimpleConditionEvent.violated(
                            item, item.getName() + " 住在 " + subpackage + "/，不在 module-map.md 第 8.4 节允许的子包里"));
                }
            });
}

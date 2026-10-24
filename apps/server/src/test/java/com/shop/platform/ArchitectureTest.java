package com.shop.platform;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaCall;
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
     * 允许数据访问（SQL 与 MyBatis-Plus）的四类包，名字取自 {@code docs/domain/module-map.md}。
     *
     * <p>{@code common} 和 {@code infra} 是平台能力共享包；{@code api} 是模块对外的点查入口；{@code mapper} 是模块内部的
     * 数据访问（实体、{@code BaseMapper} 和注解 SQL 都住这里）。四类之外一律不许碰数据访问——否则数据范围校验和审计
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
    static final ArchRule 数据访问只允许出现在四类包 = noClasses()
            .that()
            .resideInAPackage("com.shop.platform..")
            .and()
            .resideOutsideOfPackages(DATA_ACCESS_PACKAGES)
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                    "org.springframework.jdbc..", "javax.sql..", "java.sql..", "org.apache.ibatis..", "com.baomidou..")
            .because("数据权限和审计绕不过的前提，是数据访问只存在于少数可评审的包里。" + "要碰 JDBC 或 MyBatis-Plus 就放进 common / infra / api / mapper");

    /**
     * 数据访问：MyBatis-Plus，但写只许带前置条件（CAS：0 行是判决，不是异常）。
     *
     * <p>为什么拦无条件写：{@code updateById} 生成的是 {@code WHERE id = ?}，
     * <b>没有任何状态前置条件</b>。实测把一个已付款订单改回未付款，影响行数 1，成功。
     * 这个项目里每一条写都是条件更新，0 行是判决——读改写或无前置更新等于凭空开一个超卖口子。
     * 改状态就写进 mapper 的条件方法（Wrapper 带 eq 前置状态或手写 WHERE），让 0 行回到调用方手里。
     *
     * <p>同时拦掉 MP 的 IService/ServiceImpl 与 {@code Db} 便捷层（状态机藏进别人的泛型方法，
     * 条件丢了也没人看见）和 JPA/Hibernate（save/updateById 同病）。
     */
    @ArchTest
    static final ArchRule 写只许带前置条件 = noClasses()
            .that()
            .resideInAPackage("com.shop.platform..")
            .should()
            .callMethodWhere(DescribedPredicate.describe("调用 BaseMapper 的无条件写方法", ArchitectureTest::无条件写))
            .orShould()
            .dependOnClassesThat()
            .resideInAnyPackage(
                    "com.baomidou.mybatisplus.extension.service..",
                    "com.baomidou.mybatisplus.extension.toolkit.Db",
                    "jakarta.persistence..",
                    "org.hibernate..")
            .because("写必须是条件更新，0 行是判决不是异常；" + "updateById / saveOrUpdate 只有 WHERE id = ?，用它的写方法就是超卖");

    /** BaseMapper 上没有状态前置条件的写方法。deleteById 不在内：硬删等价于旧手写 SQL 的 {@code DELETE WHERE id}。 */
    private static final Set<String> UNCONDITIONAL_WRITES =
            Set.of("updateById", "updateBatchById", "saveOrUpdate", "saveOrUpdateBatch", "insertOrUpdate");

    private static boolean 无条件写(JavaCall<?> call) {
        String owner = call.getTargetOwner().getName();
        if (owner.equals("com.baomidou.mybatisplus.core.mapper.BaseMapper")) {
            return UNCONDITIONAL_WRITES.contains(call.getTarget().getName());
        }
        return owner.startsWith("com.baomidou.mybatisplus.extension.toolkit.Db");
    }

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

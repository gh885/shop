package com.shop.platform;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption.DoNotIncludeTests;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/**
 * 三层契约命名规范（见 apps/server/AGENTS.md「命名规范（三层契约）」）。
 *
 * <p>只约束"方向后缀"（Request/Query/Command/Response），不约束形状命名（CategoryNode/StaffInfo/ParamItem 由语义决定，位置约定见规范文档，不做机器强制）。 这些规则是给未来代码立的：新类若违反，mvn test 直接红。
 * 测试类（XxxTest）按惯例用 Test 后缀，不参与分析，故整体排除。
 */
@AnalyzeClasses(packages = "com.shop.platform", importOptions = DoNotIncludeTests.class)
class NamingRulesTest {

    /** mapper 包接口必须以 Mapper 结尾 */
    @ArchTest
    static final ArchRule mapper_interfaces_end_with_mapper = classes()
            .that()
            .resideInAPackage("..mapper..")
            .and()
            .areInterfaces()
            .should()
            .haveSimpleNameEndingWith("Mapper")
            .as("mapper 包接口必须以 Mapper 结尾");

    /** mapper 包实体是裸名词，不得带方向后缀 */
    @ArchTest
    static final ArchRule mapper_entities_are_bare_nouns = noClasses()
            .that()
            .resideInAPackage("..mapper..")
            .and()
            .areNotInterfaces()
            .and()
            .areTopLevelClasses()
            .should()
            .haveSimpleNameEndingWith("Request")
            .orShould()
            .haveSimpleNameEndingWith("Query")
            .orShould()
            .haveSimpleNameEndingWith("Command")
            .orShould()
            .haveSimpleNameEndingWith("Controller")
            .orShould()
            .haveSimpleNameEndingWith("Service")
            .orShould()
            .haveSimpleNameEndingWith("Response")
            .as("mapper 包实体为裸名词，不贴方向后缀");

    /** 以 Request 结尾的类只能出现在 dto 包 */
    @ArchTest
    static final ArchRule request_suffix_only_in_dto = noClasses()
            .that()
            .haveSimpleNameEndingWith("Request")
            .should()
            .resideOutsideOfPackage("..dto..")
            .as("Request 后缀只允许出现在 dto 包");

    /** 以 Query 结尾的类只能出现在 dto 包。当前尚无 Query 类，允许空匹配 */
    @ArchTest
    static final ArchRule query_suffix_only_in_dto = noClasses()
            .that()
            .haveSimpleNameEndingWith("Query")
            .should()
            .resideOutsideOfPackage("..dto..")
            .allowEmptyShould(true)
            .as("Query 后缀只允许出现在 dto 包");

    /** 以 Command 结尾的类只能出现在 service 包 */
    @ArchTest
    static final ArchRule command_suffix_only_in_service = noClasses()
            .that()
            .haveSimpleNameEndingWith("Command")
            .should()
            .resideOutsideOfPackage("..service..")
            .allowEmptyShould(true)
            .as("Command 后缀只允许出现在 service 包");

    /** 以 Response 结尾的类只能出现在 controller 包 */
    @ArchTest
    static final ArchRule response_suffix_only_in_controller = noClasses()
            .that()
            .haveSimpleNameEndingWith("Response")
            .should()
            .resideOutsideOfPackage("..controller..")
            .allowEmptyShould(true)
            .as("Response 后缀只允许出现在 controller 包");
}

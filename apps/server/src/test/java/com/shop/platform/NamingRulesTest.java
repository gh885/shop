package com.shop.platform;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption.DoNotIncludeTests;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/**
 * 三层契约命名规范（见 CLAUDE.md「命名规范」）。
 *
 * <p>只约束"方向后缀"，不约束形状命名（CategoryNode/TokenResult/ParamItem 由语义决定）。 这些规则是给未来代码立的：新类若违反，mvn test 直接红。
 * 测试类（XxxTest）按惯例用 Test 后缀，不参与分析，故整体排除。
 */
@AnalyzeClasses(packages = "com.shop.platform", importOptions = DoNotIncludeTests.class)
class NamingRulesTest {

    /** mapper 包接口必须以 Mapper 结尾 */
    @ArchTest
    static final ArchRule mapper_interfaces_end_with_mapper =
            classes()
                    .that()
                    .resideInAPackage("..mapper..")
                    .and()
                    .areInterfaces()
                    .should()
                    .haveSimpleNameEndingWith("Mapper")
                    .as("mapper 包接口必须以 Mapper 结尾");

    /** mapper 包实体是裸名词，不得带 Request/Command/Controller/Service/Response 后缀 */
    @ArchTest
    static final ArchRule mapper_entities_are_bare_nouns =
            noClasses()
                    .that()
                    .resideInAPackage("..mapper..")
                    .and()
                    .areNotInterfaces()
                    .and()
                    .areTopLevelClasses()
                    .should()
                    .haveSimpleNameEndingWith("Request")
                    .orShould()
                    .haveSimpleNameEndingWith("Command")
                    .orShould()
                    .haveSimpleNameEndingWith("Controller")
                    .orShould()
                    .haveSimpleNameEndingWith("Service")
                    .orShould()
                    .haveSimpleNameEndingWith("Response")
                    .as("mapper 包实体为裸名词，不贴方向后缀");

    /** 以 Request 结尾的类只能出现在 controller 包 */
    @ArchTest
    static final ArchRule request_suffix_only_in_controller =
            noClasses()
                    .that()
                    .haveSimpleNameEndingWith("Request")
                    .should()
                    .resideOutsideOfPackage("..controller..")
                    .as("Request 后缀只允许出现在 controller 包");

    /** 以 Command 结尾的类只能出现在 service 包。当前尚无 Command 类，允许空匹配 */
    @ArchTest
    static final ArchRule command_suffix_only_in_service =
            noClasses()
                    .that()
                    .haveSimpleNameEndingWith("Command")
                    .should()
                    .resideOutsideOfPackage("..service..")
                    .allowEmptyShould(true)
                    .as("Command 后缀只允许出现在 service 包");
}

package com.shop.platform;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaParameterizedType;
import com.tngtech.archunit.core.domain.JavaType;
import com.tngtech.archunit.core.importer.ImportOption.DoNotIncludeTests;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;

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

    /** 以 Query 结尾的类只能出现在 dto 包（HTTP 查询入参）或 api 包（跨模块只读查询，如 ProductReadQuery） */
    @ArchTest
    static final ArchRule query_suffix_only_in_dto = noClasses()
            .that()
            .haveSimpleNameEndingWith("Query")
            .should()
            .resideOutsideOfPackage("..dto..")
            .andShould()
            .resideOutsideOfPackage("..api..")
            .allowEmptyShould(true)
            .as("Query 后缀只允许出现在 dto 包或 api 包");

    /** 以 Command 结尾的类只能出现在 service 包（业务入参聚合）或 api 包（跨模块命令，如 StockCommand） */
    @ArchTest
    static final ArchRule command_suffix_only_in_service = noClasses()
            .that()
            .haveSimpleNameEndingWith("Command")
            .should()
            .resideOutsideOfPackage("..service..")
            .andShould()
            .resideOutsideOfPackage("..api..")
            .allowEmptyShould(true)
            .as("Command 后缀只允许出现在 service 包或 api 包");

    /**
     * JdbcTemplate 只允许 infra.db（共享数据访问基建）与各模块 api 包（跨模块只读查询落点）引用，
     * 禁止出现在 service 等其他包——跨 schema 裸 SQL 必须收进 owning 模块的 api 包。
     */
    @ArchTest
    static final ArchRule jdbc_template_only_in_infra_db_and_api = noClasses()
            .that()
            .resideOutsideOfPackage("..infra.db..")
            .and()
            .resideOutsideOfPackage("..api..")
            .should()
            .dependOnClassesThat()
            .areAssignableTo(org.springframework.jdbc.core.JdbcTemplate.class)
            .allowEmptyShould(true)
            .as("JdbcTemplate 只允许 infra.db 与各模块 api 包引用");

    /** 以 Response 结尾的类只能出现在 controller 包 */
    @ArchTest
    static final ArchRule response_suffix_only_in_controller = noClasses()
            .that()
            .haveSimpleNameEndingWith("Response")
            .should()
            .resideOutsideOfPackage("..controller..")
            .allowEmptyShould(true)
            .as("Response 后缀只允许出现在 controller 包");

    /** controller 方法禁止返回 mapper 包实体：HTTP 出参一律 Response record，契约与存储模型解耦 */
    @ArchTest
    static final ArchRule controllers_return_no_mapper_types = noMethods()
            .that()
            .areDeclaredInClassesThat()
            .resideInAPackage("..controller..")
            .should()
            .haveRawReturnType(JavaClass.Predicates.resideInAPackage("..mapper.."))
            .allowEmptyShould(true)
            .as("controller 出参禁止 mapper 实体（HTTP 契约用 Response record）");

    /**
     * HTTP handler 出参必须为 <名词>Response / 契约形状类（service 形状类或 infra 值对象，或它们的 List/PageResult 包装）；void 豁免。
     *
     * <p>service 形状类与 infra 值对象（CartItemView/ShopReviewItem/CategoryNode/TokenPair/UploadTicket 等）直出：
     * 带 @Schema 的形状即 wire 契约，字段变更 = 接口变更，由 openapi 契约与前端 SDK 编译期兜底，
     * 恒等镜像 Response 一律禁止（理由见 apps/server/AGENTS.md「命名规范」）。
     * 仍然禁止直出 mapper 实体（另有 controllers_return_no_mapper_types 兜底）。
     */
    @ArchTest
    static final ArchRule handler_outputs_are_response_or_service_shaped = methods()
            .that(httpHandlers())
            .should(haveResponseShapedReturnTypes())
            .as("HTTP 出参必须为 Response 或 service 形状类");

    private static DescribedPredicate<JavaMethod> httpHandlers() {
        DescribedPredicate<JavaMethod> predicate = DescribedPredicate.describe(
                "标注了 @GetMapping/@PostMapping/@PutMapping/@PatchMapping/@DeleteMapping",
                m -> m.isAnnotatedWith(GetMapping.class)
                        || m.isAnnotatedWith(PostMapping.class)
                        || m.isAnnotatedWith(PutMapping.class)
                        || m.isAnnotatedWith(PatchMapping.class)
                        || m.isAnnotatedWith(DeleteMapping.class));
        return predicate;
    }

    private static ArchCondition<JavaMethod> haveResponseShapedReturnTypes() {
        return new ArchCondition<>("返回 XxxResponse / service 形状类 / infra 值对象 / 其 List/PageResult 包装 / void") {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                String violation = responseShapeViolationOf(method);
                if (violation != null) {
                    events.add(SimpleConditionEvent.violated(method, violation));
                }
            }
        };
    }

    /** 违规描述；null = 合规 */
    private static String responseShapeViolationOf(JavaMethod method) {
        if (method.getRawReturnType().isEquivalentTo(void.class)) {
            return null; // 动作型端点无出参，204 即契约
        }
        String rawName = method.getRawReturnType().getName();
        if (isContractShape(method.getRawReturnType())) {
            return null;
        }
        if (rawName.equals(java.util.List.class.getName())
                || rawName.equals(com.shop.platform.common.PageResult.class.getName())) {
            if (method.getReturnType() instanceof JavaParameterizedType parameterized
                    && !parameterized.getActualTypeArguments().isEmpty()) {
                JavaType element = parameterized.getActualTypeArguments().getFirst();
                if (isContractShape(element)) {
                    return null;
                }
                return "handler " + method.getFullName() + " 返回裸容器类型，元素必须为 XxxResponse 或 service 形状类: "
                        + element.getName();
            }
            return "handler " + method.getFullName() + " 返回裸容器类型: " + rawName;
        }
        return "handler " + method.getFullName() + " 出参未贴 Response 后缀也不是契约形状类（service 形状/infra 值对象）: " + rawName;
    }

    /** 合法出参形状：XxxResponse，service 包形状类（CartItemView/CategoryNode 等），或 infra 值对象（TokenPair/UploadTicket 等共享技术形状） */
    private static boolean isContractShape(JavaType type) {
        String name = type.getName();
        if (name.endsWith("Response")) {
            return true;
        }
        return name.startsWith("com.shop.platform.") && (name.contains(".service.") || name.contains(".infra."));
    }
}

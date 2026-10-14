package com.shop.platform.contract;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;
import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.testsupport.SourceScanner;
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
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
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
@org.junit.jupiter.api.Tag("contract")
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

    /**
     * MyBatis-Plus 的条件容器（{@code QueryWrapper} / {@code LambdaQueryWrapper} / {@code LambdaUpdateWrapper}
     * 一族）只允许各模块 mapper 包引用——细则见 apps/server/AGENTS.md「mapper 层职责」。
     *
     * <p>这条禁的不是风格而是第二份答案：条件一旦在 service 里现拼，「同一个筛选」就有了两个住所，改一处另一处
     * 静默不动；条件更新里的状态守卫漏到 service，就等于把并发闸门交给调用方的自觉。搬家前这类越层有 15 个文件。
     *
     * <p>分页载体 {@code Page} 与列引用 {@code SFunction} 刻意不在本条之内：前者作类型出现在 service 是合法的
     * （读 records/total），不合法的只是就地构造，那是源码形状、ArchUnit 看不见，由下面那条扫描钉住；后者是
     * 「哪一列」的规则定义（{@code OrderTimeout} 持有到期列），不是取数构造。
     */
    @ArchTest
    static final ArchRule mybatis_conditions_only_in_mapper = noClasses()
            .that()
            .resideOutsideOfPackage("..mapper..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("com.baomidou.mybatisplus.core.conditions..")
            .allowEmptyShould(true)
            .as("MyBatis-Plus 条件容器只允许各模块 mapper 包引用");

    /**
     * 分页载体就地构造（{@code new Page<>}）与裸 SQL 尾巴（{@code .last("...")}）只许出现在 mapper 包文件里。
     *
     * <p>形状扫描而非 ArchUnit：类型引用本身合法（service 拿 {@code Page} 读 total），要挡的是「把第几页翻译成
     * 取数载体」这一步和「往语句尾部拼 SQL 方言」——两者都在文本层，字节码上看不出来。{@code LIMIT} 走
     * {@code .last} 是 MyBatis-Plus 唯一的入口，放它进 service 就是让编排层持有方言。
     */
    @Test
    void 分页构造与裸SQL尾巴只住在mapper包() throws IOException {
        Path mainSource = SourceScanner.MAIN_JAVA;
        List<Path> files = SourceScanner.javaFiles(mainSource);
        // 反证不空转：路径失效时本门禁会静默通过，先确认确实扫到了源码，且 mapper 侧真有这两种形状可禁
        assertThat(files)
                .as("假定 working dir = apps/server，%s 下没扫到源码", mainSource)
                .isNotEmpty();
        assertThat(files.stream().filter(NamingRulesTest::isMapperFile).count())
                .as("mapper 包一个文件也没有，本门禁就是在禁空气")
                .isPositive();

        List<Path> offenders = files.stream()
                .filter(p -> !isMapperFile(p))
                .filter(p -> containsAnyOf(p, "new Page<", ".last("))
                .toList();
        assertThat(offenders)
                .as("就地构造分页载体或往语句尾部拼裸 SQL，都属于「怎么取」，须搬进 mapper 具名方法")
                .isEmpty();
    }

    private static boolean isMapperFile(Path file) {
        return file.toString().replace('\\', '/').contains("/mapper/");
    }

    private static boolean containsAnyOf(Path file, String... needles) {
        try {
            String source = SourceScanner.read(file);
            for (String needle : needles) {
                if (source.contains(needle)) {
                    return true;
                }
            }
            return false;
        } catch (IOException e) {
            throw new IllegalStateException("读取 " + file + " 失败", e);
        }
    }

    /** 以 Response 结尾的类只能出现在 controller 包 */
    @ArchTest
    static final ArchRule response_suffix_only_in_controller = noClasses()
            .that()
            .haveSimpleNameEndingWith("Response")
            .should()
            .resideOutsideOfPackage("..controller..")
            .allowEmptyShould(true)
            .as("Response 后缀只允许出现在 controller 包");

    /** HTTP 入参不得依赖 mapper 包：DTO 是独立 wire 契约，存储模型变更不能穿透请求边界。 */
    @ArchTest
    static final ArchRule dto_does_not_depend_on_mapper = noClasses()
            .that()
            .resideInAPackage("..dto..")
            .should()
            .dependOnClassesThat()
            .resideInAPackage("..mapper..")
            .allowEmptyShould(true)
            .as("dto 入参不得依赖 mapper 存储模型");

    /** HTTP 入参不得反向依赖 service 内部 Command；DTO 只描述 wire 入参。 */
    @ArchTest
    static final ArchRule dto_does_not_depend_on_service = noClasses()
            .that()
            .resideInAPackage("..dto..")
            .should()
            .dependOnClassesThat()
            .resideInAPackage("..service..")
            .allowEmptyShould(true)
            .as("dto 入参不得依赖 service 实现");

    /** HTTP Response 契约不得依赖 mapper；实体转换必须止于 service 读模型。 */
    @ArchTest
    static final ArchRule response_does_not_depend_on_mapper = noClasses()
            .that()
            .resideInAPackage("..controller..")
            .and()
            .haveSimpleNameEndingWith("Response")
            .should()
            .dependOnClassesThat()
            .resideInAPackage("..mapper..")
            .allowEmptyShould(true)
            .as("HTTP Response 不得依赖 mapper 存储模型");

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

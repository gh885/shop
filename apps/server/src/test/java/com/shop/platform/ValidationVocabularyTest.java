package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.cms.dto.LinkTarget;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.coupon.model.UserCouponStatus;
import com.shop.platform.infra.region.RegionRegistry;
import com.shop.platform.product.dto.ProductAdminSort;
import com.shop.platform.product.dto.ProductSort;
import com.shop.platform.testsupport.SourceScanner;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * 入站校验词表的单点门禁：一条规则只能有一个定义处，其余地方引用它。
 *
 * <p>这一类漂移是<b>看不见的</b>：{@code @Pattern} 的正则抄在两个 DTO 里，两份今天一模一样，
 * 于是没有任何测试会红；等到有人只改其中一份，同一个字段就按入口不同给两种答案（前端各表单还会各自继续抄）。
 * 本类扫的就是这种「此刻正确、注定漂移」的复制：
 * <ol>
 *   <li><b>同一条正则不许写两遍</b>：扫 {@code src/main/java} 全部 {@code @Pattern} 的 regexp，字面量出现两次即红——
 *       引用具名常量不算重复（那正是本类期望的写法）；
 *   <li><b>常量必须等于它的权威表</b>：Java 的注解元素值必须是编译期常量表达式，所以「由枚举派生」写不进注解，
 *       只能写成字面量常量再由本类逐字节比对枚举名——加枚举值忘了补词表就红；
 *   <li><b>手机号三档是值对象归一化的子集</b>：DTO 放行的号，{@code PhoneNumber.of} 必须也接得住，
 *       否则同一份输入一处 400 一处落库；
 *   <li><b>排序的每个取值都有分支</b>：{@code switch} 语句不强制穷尽，漏一支会静默退化成默认排序。
 * </ol>
 *
 * <p><b>本类不管契约</b>：词表常量被改动后 OpenAPI 那一格是否重新导出，由
 * {@code ApiDocsContractTest}（运行中的 springdoc 输出 vs 仓库里的 {@code openapi/api-docs.json}）守。
 * 两者是互补的：本类保证「一处定义」，那类保证「定义与已发布的形状一致」。
 *
 * <p>刻意不做的检查：「字面量与某个具名常量的值相同」也算重复。6 位邮编与 6 位区划码形状相同而概念不同，
 * 按值判重会逼着邮编去引用 {@code RegionRegistry.CODE_PATTERN}——那才是真漂移（放宽一处连带改了另一处）。
 */
class ValidationVocabularyTest {

    private static final Path MAIN_SOURCE = SourceScanner.MAIN_JAVA;

    /**
     * 注解元素 {@code regexp = ...}。按元素而不是整段注解匹配：正则里出现括号就会截断注解匹配，
     * 而这个元素名在 main 下只用于 {@code @Pattern}（javadoc 里提到的那些行按注释跳过）。
     */
    private static final Pattern REGEXP_ELEMENT = Pattern.compile("regexp\\s*=\\s*([^,)]+)");

    /** switch 分支里的枚举名清单：多值 case（{@code case STOCK_ASC, STOCK_DESC ->}）一次收下全部标签 */
    private static final Pattern CASE_LABELS =
            Pattern.compile("case\\s+([A-Z][A-Z_]*(?:\\s*,\\s*[A-Z][A-Z_]*)*)\\s*->");

    @Test
    void 同一条正则不在两个文件里各抄一遍() throws Exception {
        assertThat(MAIN_SOURCE).as("本测试假定 working dir = apps/server").exists();

        List<String> literals = new ArrayList<>();
        List<String> constantReferences = new ArrayList<>();
        for (Path file : SourceScanner.javaFiles(MAIN_SOURCE)) {
            for (String line : SourceScanner.lines(file)) {
                String code = line.strip();
                if (code.startsWith("*") || code.startsWith("//") || code.startsWith("/*")) {
                    continue;
                }
                Matcher regexp = REGEXP_ELEMENT.matcher(code);
                if (!regexp.find()) {
                    continue;
                }
                String value = regexp.group(1).trim();
                if (value.startsWith("\"")) {
                    literals.add(file.getFileName() + " " + value);
                } else {
                    constantReferences.add(file.getFileName() + " -> " + value);
                }
            }
        }

        // 反证不空转：解析器扫不到东西时上面两个清单都是空的，断言「无重复」会假绿
        assertThat(constantReferences).as("入站词表应当大量引用具名常量，扫到的引用数＝0 说明解析器或路径失效").isNotEmpty();
        assertThat(literals).as("独有形状的字面量（如 6 位邮编）可以有，但词表应当以具名引用为主").hasSizeLessThan(constantReferences.size());

        List<String> duplicated = literals.stream()
                .map(literal -> literal.substring(literal.indexOf(' ')))
                .collect(Collectors.groupingBy(v -> v, Collectors.counting()))
                .entrySet()
                .stream()
                .filter(e -> e.getValue() > 1)
                .map(e -> e.getKey() + " ×" + e.getValue())
                .toList();
        assertThat(duplicated).as("这些正则被抄成了两份：收成一处具名常量（词表或提示语改了另一份不会有人知道）").isEmpty();
    }

    @Test
    void 跳转目标词表等于枚举名() {
        assertThat(LinkTarget.PATTERN)
                .isEqualTo(alternation(Arrays.stream(LinkTarget.values()).map(Enum::name)));
        // 反证：枚举确实有值，派生表不是空串
        assertThat(LinkTarget.values()).isNotEmpty();
    }

    @Test
    void 券状态筛选词表等于枚举名() {
        assertThat(UserCouponStatus.PATTERN)
                .isEqualTo(alternation(Arrays.stream(UserCouponStatus.values()).map(Enum::name)));
    }

    @Test
    void 排序词表等于枚举wire值_且每个取值都有分支() throws Exception {
        assertThat(ProductSort.PATTERN)
                .isEqualTo(alternation(Arrays.stream(ProductSort.values()).map(ProductSort::wireName)));

        // switch 语句不强制穷尽：新增枚举值忘了补 case，会静默走 default 之前的「不加排序」，不报错也不红
        assertThat(branchless(ProductSort.values(), productCaseLabels()))
                .as("这些排序值没有 ORDER BY 分支")
                .isEmpty();
    }

    @Test
    void 卖家排序词表等于枚举wire值_且每个取值都有分支() throws Exception {
        assertThat(ProductAdminSort.PATTERN)
                .isEqualTo(alternation(Arrays.stream(ProductAdminSort.values()).map(ProductAdminSort::wireName)));

        // 与买家侧同一口径，差别在这里必须认多值 case（case STOCK_ASC, STOCK_DESC ->）：
        // 库存两档在聚合分支里成对出现，按单值匹配会把已经写了分支的值误判成缺失。
        assertThat(branchless(ProductAdminSort.values(), productCaseLabels()))
                .as("这些卖家排序值没有分支（漏一支会静默退化成默认排序）")
                .isEmpty();
    }

    @Test
    void 区划码形状与权威数据同形() {
        RegionRegistry registry = new RegionRegistry(JsonMapper.builder().build());
        registry.load();
        Pattern code = Pattern.compile(RegionRegistry.CODE_PATTERN);
        Pattern prefix = Pattern.compile("^" + RegionRegistry.PREFIX_PATTERN + "$");

        List<String> codes = leafCodes();
        assertThat(codes).as("regions.json 应当加载出区县码").isNotEmpty();
        assertThat(codes).allMatch(code.asPredicate());

        // 前缀阶梯：省 2 / 市 4 / 区县 6 都必须落进 PREFIX_PATTERN 的形状，且真实可查
        String sample = codes.get(0);
        assertThat(sample.substring(0, 2)).matches(prefix);
        assertThat(sample.substring(0, 4)).matches(prefix);
        assertThat(registry.hasRegionPrefix(sample.substring(0, 2))).isTrue();
        assertThat(registry.hasRegionPrefix(sample.substring(0, 4))).isTrue();
        // 形状不合前缀门的一律无效，不查数据
        assertThat(registry.hasRegionPrefix("4")).as("1 位不是合法前缀形状").isFalse();
        assertThat(registry.hasRegionPrefix("441")).as("3 位不是合法前缀形状").isFalse();
        assertThat(registry.hasRegionPrefix("990099")).as("不存在的区划码前缀").isFalse();
    }

    @Test
    void 手机号三档放行的号归一化必接得住() {
        List<String> mobile = List.of("13800000000", "13912345678", "19900000000");
        List<String> contact = List.of("13800000000", "+8613800000000", "010-12345678", "12345", "+1234567");

        mobile.forEach(number -> {
            assertThat(number).matches(PhoneNumber.CHINA_MOBILE_PATTERN);
            assertThatCode(() -> PhoneNumber.of(number)).doesNotThrowAnyException();
        });
        contact.forEach(number -> {
            assertThat(number).matches(PhoneNumber.CONTACT_PATTERN);
            assertThatCode(() -> PhoneNumber.of(number)).doesNotThrowAnyException();
        });
        // 强校验档是联系电话档的子集：短信入口放的号，地址入口也放得进（不会出现能发短信却存不下的号）
        assertThat(mobile).allMatch(number -> number.matches(PhoneNumber.CONTACT_PATTERN));
    }

    @Test
    void 联系电话档按当前契约不放行空格与括号() {
        // of() 能吃掉空格，但 DTO 那一格不放行：粘贴「138 0000 0000」当前是 400，不是静默存成 11 位。
        // 这条断言是把已知缺口钉在账上——放宽它属于接口变更（要跑 pnpm sdk:gen，ApiDocsContractTest 会先红），
        // 而不是内部优化；哪天有意放宽，改这一格与契约，别改成本类期望的形状。
        assertThat("138 0000 0000").doesNotMatch(PhoneNumber.CONTACT_PATTERN);
        assertThat(PhoneNumber.of("138 0000 0000").value()).isEqualTo("13800000000");
    }

    @Test
    void 联系电话档的粗形由值对象兜精确判定() {
        // 「1-2-3」过得了形状门（5 个字符全在允许集内），归一化后只剩 3 位数字，由 of() 挡下。
        // 两处话术相同：同一句「手机号格式不正确」、同一个 400，调用方看不出差别——这才允许门做粗形。
        String noise = "1-2-3";
        assertThat(noise).matches(PhoneNumber.CONTACT_PATTERN);
        assertThatThrownBy(() -> PhoneNumber.of(noise))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("手机号格式不正确");
    }

    private static String alternation(Stream<String> names) {
        return names.collect(Collectors.joining("|"));
    }

    /** 一个源文件里所有 switch 分支标签（枚举常量名） */
    private static Set<String> caseLabels(String source) {
        Set<String> labels = new HashSet<>();
        Matcher cases = CASE_LABELS.matcher(source);
        while (cases.find()) {
            Arrays.stream(cases.group(1).split(",")).map(String::trim).forEach(labels::add);
        }
        return labels;
    }

    /** 取值名没落在 switch 分支里的那些（switch 语句不做穷尽检查，缺一支不报错，只是静默换一种形状） */
    private static List<String> branchless(Enum<?>[] values, Set<String> labels) {
        return Arrays.stream(values)
                .filter(value -> !labels.contains(value.name()))
                .map(Enum::name)
                .toList();
    }

    /**
     * product 模块全部源码里的 switch 分支标签并集。
     *
     * <p>扫整个模块而不是点名的那一个文件：ORDER BY 分支住 service 还是住 mapper 是<b>形状</b>，门禁不该假定它住哪
     * （取数搬家已把两个 switch 挪进 {@code ProductMapper}，点名读文件的那两条会当场空转还照样绿）。
     * 两侧词表因此共用一份标签集——两个枚举的取值名互不相交（买家是 newest 与两个 price 档，卖家是 createdAt
     * 与 stock、soldCount 两档的升降序后缀），互相挡不住对方的缺口。
     */
    private static Set<String> productCaseLabels() throws IOException {
        Path module = MAIN_SOURCE.resolve(Path.of("com/shop/platform/product"));
        List<Path> sources = SourceScanner.javaFiles(module);
        assertThat(sources).as("%s 下一个 .java 也没扫到：路径失效，本门禁会空转", module).isNotEmpty();
        Set<String> labels = new HashSet<>();
        for (Path source : sources) {
            labels.addAll(caseLabels(SourceScanner.read(source)));
        }
        return labels;
    }

    /** 直接读 classpath 上那份 regions.json（与 RegionRegistry 同一份数据），取出所有 6 位码 */
    private static List<String> leafCodes() {
        ObjectMapper mapper = JsonMapper.builder().build();
        List<String> codes = new ArrayList<>();
        try (var in = ValidationVocabularyTest.class.getClassLoader().getResourceAsStream("regions/regions.json")) {
            collectCodes(mapper.readTree(in), codes);
        } catch (Exception e) {
            throw new IllegalStateException("读取 regions/regions.json 失败", e);
        }
        return codes;
    }

    private static void collectCodes(JsonNode node, List<String> out) {
        if (node == null) {
            return;
        }
        if (node.isArray()) {
            node.forEach(child -> collectCodes(child, out));
            return;
        }
        String code = node.path("code").asString("");
        if (code.length() == 6) {
            out.add(code);
        }
        collectCodes(node.get("children"), out);
    }
}

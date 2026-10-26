package com.shop.platform.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.infra.security.Permission;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * 权限点三方对拍：{@code contracts/permissions.yaml} ⇄ {@link Permission} 枚举 ⇄ 前端生成物。
 *
 * <p>和 {@link ErrorCodeVocabularyTest} 同一形态：不起 Spring、不连库，纯文本 + 反射。区别在于这里
 * 核的是**三方**而不是两方——因为权限码有一个额外的事实来源：前端菜单要靠它决定显不显示。
 *
 * <p>库那一方（{@code common.permission}）不在这里核：它已经由 {@code Authorizer} 构造时双向比对，
 * 启动失败比测试失败更早、更难绕过。这里补的是启动管不到的两条：yaml 漂移、以及前端生成物过期。
 *
 * <p><b>{@code reserved: true} 的条目不计入对拍。</b> 它们是文档占位，库里没有、枚举里没有、
 * 生成物里也没有。把它们算进集合，就得给"只活在文档里"发明一个第四种状态。
 */
class PermissionVocabularyTest {

    private static final Path YAML = Path.of("..", "..", "contracts", "permissions.yaml");

    private static final Path GENERATED =
            Path.of("..", "..", "packages", "common", "src", "contract", "permission-codes.ts");

    /** 一行 {@code code: XXX}。yaml 里这个键只出现在权限条目上，不需要完整解析。 */
    private static final Pattern CODE_LINE = Pattern.compile("^\\s*code:\\s*([A-Za-z][A-Za-z0-9:_]*)\\s*$");

    /** 一个条目的开始：{@code - domain: ...}。用来切块，块内再看有没有 reserved。 */
    private static final Pattern ENTRY_START = Pattern.compile("^\\s*-\\s+domain:");

    private static final Pattern RESERVED_LINE = Pattern.compile("^\\s+reserved:\\s*true\\s*$");
    /** 生成物里的一条常量：{@code XXX: "XXX",}。 */
    private static final Pattern GENERATED_CONSTANT =
            Pattern.compile("^\\s{4}([A-Za-z][A-Za-z0-9:_]*):\\s*\"([A-Za-z][A-Za-z0-9:_]*)\",\\s*$");

    @Test
    void yamlAndEnumDeclareTheSameCodes() throws Exception {
        Set<String> yaml = codesInYaml();
        Set<String> java = codesInEnum();

        assertThat(java.stream().filter(code -> !yaml.contains(code)).toList())
                .as("枚举里有、permissions.yaml 里没有——契约少登记了一个码")
                .isEmpty();
        assertThat(yaml.stream().filter(code -> !java.contains(code)).toList())
                .as("permissions.yaml 里有、枚举里没有——登记了一个没人实现的码（占位请标 reserved: true）")
                .isEmpty();
    }

    @Test
    void generatedFrontendConstantsAreUpToDate() throws Exception {
        Path path = GENERATED;
        assertThat(path).as("前端生成物不见了，跑 `pnpm permissions:gen`").exists();

        Set<String> yaml = codesInYaml();
        Set<String> generated = codesInGenerated(path);

        assertThat(generated.stream().filter(code -> !yaml.contains(code)).toList())
                .as("生成物里有、yaml 里没有——生成物过期，跑 `pnpm permissions:gen`")
                .isEmpty();
        assertThat(yaml.stream().filter(code -> !generated.contains(code)).toList())
                .as("yaml 里有、生成物里没有——生成物过期，跑 `pnpm permissions:gen`")
                .isEmpty();
    }

    /** 常量名必须等于它的值。改一个不改另一个就是两条不同的码，前端菜单会静默失灵。 */
    @Test
    void everyGeneratedConstantMapsToItself() throws Exception {
        List<String> mismatched = Files.readAllLines(GENERATED, StandardCharsets.UTF_8).stream()
                .map(GENERATED_CONSTANT::matcher)
                .filter(Matcher::matches)
                .filter(matcher -> !matcher.group(1).equals(matcher.group(2)))
                .map(matcher -> matcher.group(1) + " = " + matcher.group(2))
                .toList();

        assertThat(mismatched).as("权限码的值必须等于名字（改名 = 契约破坏）").isEmpty();
    }

    /** 解析 yaml 里所有**非 reserved** 的 code。按行扫描：`- domain:` 开一个条目，`reserved: true` 把当前条目标掉。 */
    private static Set<String> codesInYaml() throws Exception {
        assertThat(YAML).as("权限登记处要相对 apps/server 解析；找不到说明目录结构变了").exists();

        Set<String> codes = new TreeSet<>();
        String pending = null;
        boolean reserved = false;
        for (String line : Files.readAllLines(YAML, StandardCharsets.UTF_8)) {
            if (ENTRY_START.matcher(line).find()) {
                // 上一个条目收尾：非 reserved 才计数
                if (pending != null && !reserved) {
                    codes.add(pending);
                }
                pending = null;
                reserved = false;
                continue;
            }
            if (RESERVED_LINE.matcher(line).find()) {
                reserved = true;
                continue;
            }
            Matcher matcher = CODE_LINE.matcher(line);
            if (matcher.matches()) {
                pending = matcher.group(1);
            }
        }
        if (pending != null && !reserved) {
            codes.add(pending);
        }

        assertThat(codes).as("yaml 里一个码都没解析出来，正则和文件格式对不上了").isNotEmpty();
        return codes;
    }

    private static Set<String> codesInEnum() {
        return Arrays.stream(Permission.values())
                .map(Permission::code)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private static Set<String> codesInGenerated(Path path) throws Exception {
        Set<String> codes = new TreeSet<>();
        try (Stream<String> lines = Files.lines(path, StandardCharsets.UTF_8)) {
            lines.map(GENERATED_CONSTANT::matcher)
                    .filter(Matcher::matches)
                    .forEach(matcher -> codes.add(matcher.group(1)));
        }
        assertThat(codes).as("生成物里一个常量都没解析出来，说明生成器格式变了").isNotEmpty();
        return codes;
    }

    /** 枚举里不允许出现两个常量映射到同一个码——那会让"哪个常量说了算"没有答案。 */
    @Test
    void noTwoConstantsShareACode() {
        Permission[] values = Permission.values();

        assertThat(Arrays.stream(values).map(Permission::code).distinct().count())
                .as("枚举常量数应等于去重后的码数；不相等说明有两个常量写成了同一个码")
                .isEqualTo(values.length);
    }
}

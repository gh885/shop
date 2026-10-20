package com.shop.platform.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.ErrorCodes;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * 注册表（{@code contracts/error-codes.yaml}）⇄ Java 常量（{@link ErrorCodes}）的双向核对。
 *
 * <p>不起 Spring、不连库，纯文本 + 反射。主分支靠 codegen 保证这条等式；重写期 codegen 脚本没恢复，
 * 改由这个测试盯住——少一个码或多一个码都红灯，报错直接列出差集。
 *
 * <p>只核集合，不核顺序与排版：排版归 spotless。语义（每码的状态码）由 {@code contracts/error-codes.yaml}
 * 里的 {@code status} 列自己保证，Java 侧不重抄一份，避免第二个真相源。
 */
class ErrorCodeVocabularyTest {

    private static final Pattern CODE_LINE = Pattern.compile("^\\s*code:\\s*([A-Z][A-Z0-9_]*)\\s*$");

    private static Path registry() {
        return Path.of("..", "..", "contracts", "error-codes.yaml");
    }

    private static Set<String> codesInRegistry() throws Exception {
        Path path = registry();
        assertThat(path).as("注册表要相对 apps/server 解析；找不到说明目录结构变了").exists();

        Set<String> codes = new TreeSet<>();
        for (String line : Files.readAllLines(path, StandardCharsets.UTF_8)) {
            Matcher matcher = CODE_LINE.matcher(line);
            if (matcher.matches()) {
                codes.add(matcher.group(1));
            }
        }
        assertThat(codes).as("注册表里一个码都没解析出来，正则和文件格式对不上了").isNotEmpty();
        return codes;
    }

    private static Set<String> codesInJava() {
        List<Field> fields = Stream.of(ErrorCodes.class.getDeclaredFields())
                .filter(field -> Modifier.isStatic(field.getModifiers()) && field.getType() == String.class)
                .toList();
        return fields.stream()
                .map(field -> {
                    try {
                        return (String) field.get(null);
                    } catch (IllegalAccessException e) {
                        throw new IllegalStateException(e);
                    }
                })
                .collect(Collectors.toCollection(TreeSet::new));
    }

    @Test
    void javaConstantsAndTheRegistryDeclareTheSameCodes() throws Exception {
        Set<String> registry = codesInRegistry();
        Set<String> java = codesInJava();

        assertThat(java.stream().filter(code -> !registry.contains(code)).toList())
                .as("Java 里有、注册表里没有")
                .isEmpty();
        assertThat(registry.stream().filter(code -> !java.contains(code)).toList())
                .as("注册表里有、Java 里没有")
                .isEmpty();
        assertThat(java).hasSameSizeAs(registry);
    }
}

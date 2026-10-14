package com.shop.platform.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.ValidationRules;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * 422 字段级明细的规则词表：Java owner ⇄ TS 镜像，两边必须逐个相等。
 *
 * <p>与 {@code ErrorCodeVocabularyTest} 同一个套路（那边是三边：Java / 文档 / TS）。这边只两边：
 * 规则名不写进文档表格——它们不是对外的「错误码」，而是「这句话怎么拼出来」的实现细节，
 * 权威就是 {@link ValidationRules} 那份 Java 常量与它的 TS 镜像。
 *
 * <p>为什么值得钉：两边各改一边不会编译错也不会类型错，只会让 422 的某条规则在前端
 * 「不认识」→ 静默退回显示后端那句中文 message（也就是这条通道要消灭的东西）。
 *
 * <p>无库、不起 Spring、纯文本 + 反射。
 */
@org.junit.jupiter.api.Tag("contract")
class ValidationRuleVocabularyTest {

    private static final Path TS_OWNER =
            Path.of("..", "..", "packages", "common", "src", "contract", "validation-rules.ts");

    /** TS 里那行：{@code    REQUIRED: "validation.REQUIRED",} */
    private static final Pattern TS_ENTRY =
            Pattern.compile("^\\s*([A-Z][A-Z0-9_]*)\\s*:\\s*\"validation\\.[A-Z][A-Z0-9_]*\",?\\s*$");

    private static final Pattern MULTILINE_ENTRY =
            Pattern.compile("(?m)^\\s*([A-Z][A-Z0-9_]*)\\s*:\\s*\"validation\\.");

    @Test
    void java与ts两侧规则名逐个相等() throws Exception {
        assertThat(TS_OWNER).as("本测试假定 working dir = apps/server").exists();

        Set<String> java = new TreeSet<>(javaRuleNames());
        Set<String> ts = tsRuleNames();

        // 两个方向都要：少一条 = 前端不认识那条规则（退回中文 message）；多一条 = TS 认了个不存在的规则
        assertThat(ts).as("TS 少了 Java owner 里的规则").isEqualTo(java);
        assertThat(java).as("两侧都空的话本测试会空转").isNotEmpty();
    }

    @Test
    void 每个规则的值就是它的名字() {
        // 规则名会作为 `errors[].rule` 的值出现在 wire 上，改字面量等于改对外协议
        for (var f : ValidationRules.class.getDeclaredFields()) {
            if (!f.getType().equals(String.class)) continue;
            try {
                String value = (String) f.get(null);
                assertThat(value).as("规则常量的值必须等于它的名字：%s", f.getName()).isEqualTo(f.getName());
            } catch (IllegalAccessException e) {
                throw new AssertionError(e);
            }
        }
    }

    private static Set<String> javaRuleNames() {
        return java.util.Arrays.stream(ValidationRules.class.getDeclaredFields())
                .filter(f -> f.getType().equals(String.class))
                .map(java.lang.reflect.Field::getName)
                .collect(Collectors.toCollection(TreeSet::new));
    }

    private static Set<String> tsRuleNames() throws Exception {
        Set<String> out = new TreeSet<>();
        Matcher m = MULTILINE_ENTRY.matcher(Files.readString(TS_OWNER));
        while (m.find()) {
            out.add(m.group(1));
        }
        assertThat(out).as("一条都没扫到，正则多半与文件脱节了").isNotEmpty();
        // 单行那条留着做反证：词表条目就写成一行，格式一变这里先空转
        assertThat(TS_ENTRY.matcher("    REQUIRED: \"validation.REQUIRED\",").find())
                .as("TS_ENTRY 正则已与文件格式脱节")
                .isTrue();
        return out;
    }
}

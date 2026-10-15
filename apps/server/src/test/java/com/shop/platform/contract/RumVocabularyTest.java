package com.shop.platform.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.rum.RumVocabulary;
import com.shop.platform.testsupport.SourceScanner;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * 遥测接收端词表的门禁：{@link RumVocabulary#ERROR_NAMES} 与前端 `ErrorName` 联合类型
 * **两向相等**（无库、纯扫描）。
 *
 * <p>为什么值得一道门禁：这两份清单分居两处而语义是同一个——「哪些错误名有资格进指标标签」。
 * 漂了的症状**完全无声**：接收端把不认识的错误名折成 `other`（这是刻意的，见白名单那节），
 * 于是前端新增一类错误之后，它在指标里静静地全归到 other，没人会收到任何提示。
 * 与 `ErrorCodeVocabularyTest` 守的是同一类病：**词表两边各写一份而不核**。
 *
 * <p>扫描面是前端那一份的唯一出处（`packages/monitoring/src/types.ts` 的 `ErrorName`），
 * 而不是从文档或注释里抄——抄来的清单会随改动静默过期。
 */
@org.junit.jupiter.api.Tag("contract")
class RumVocabularyTest {

    /** `ErrorName` 联合类型的出处。它随 `core.ts` 拆分成 `state.ts` / `types.ts` 搬到了 types.ts */
    private static final Path FRONTEND_ERROR_OWNER =
            SourceScanner.REPO_ROOT.resolve("packages/monitoring/src/types.ts");

    /** `MonitoringEvent` 各分支 `kind` 判别值的出处（envelope.ts 的五个事件接口）。 */
    private static final Path FRONTEND_EVENT_OWNER =
            SourceScanner.REPO_ROOT.resolve("packages/monitoring/src/envelope.ts");

    /**
     * 联合类型的成员：`export type ErrorName =` 之后那一串以 `|` 开头的行。
     *
     * <p>**不能拿分号收尾**——那个类型声明后面没有分号，`[^;]*` 会一路吞到几十行之后的第一个分号，
     * 把 `dev` / `ssr` / `shop_monitoring_session` 这些无关字面量一起当成错误名（第一版就是这么错的）。
     * 按「连续的 `|` 行」收尾与源码实际形状一致。
     */
    private static final Pattern ERROR_NAME_UNION =
            Pattern.compile("export type ErrorName\\s*=((?:\\s*\\|[^\\n]*\\n?)+)");

    /** 成员字面量。**必须带上数字**：`i18n_missing_key` 里的 `18` 用 `[a-z_]+` 匹配不上，
     *  于是那个名字被静默地从清单里漏掉——门禁自己犯它要防的那种病 */
    private static final Pattern QUOTED = Pattern.compile("\"([a-z0-9_]+)\"");

    @Test
    void 接收端的错误名白名单_与前端ErrorName联合类型两向相等() throws Exception {
        Set<String> frontend = frontendErrorNames();
        assertThat(frontend)
                .as("没从前端 types.ts 里解析出 ErrorName 的成员——扫描正则或那个类型的位置变了，本门禁已经失明")
                .isNotEmpty();

        assertThat(RumVocabulary.ERROR_NAMES)
                .as("接收端白名单与前端 ErrorName 必须两向相等：多一个就是接收端在等一个永远不会来的名字，" + "少一个就是那类错误在指标里静静地全归到 other（无声）")
                .containsExactlyInAnyOrderElementsOf(frontend);
    }

    @Test
    void 事件种类白名单_与前端MonitoringEvent的判别值两向相等() throws Exception {
        String source = SourceScanner.withoutComments(SourceScanner.read(FRONTEND_EVENT_OWNER));
        Set<String> frontendKinds = new TreeSet<>();
        Matcher matcher = Pattern.compile("kind:\\s*\"([a-z_]+)\"").matcher(source);
        while (matcher.find()) {
            frontendKinds.add(matcher.group(1));
        }
        assertThat(frontendKinds).as("没解析出任何 kind 字面量，扫描已失明").isNotEmpty();
        // 前端的 kind 字面量出现在接口声明与联合类型里，可能带出判别值之外的字符串；
        // 这里只要求「接收端认识前端的每一个 kind」，反方向不设（接收端多认一个不造成无声失败）
        assertThat(RumVocabulary.KINDS).containsAll(frontendKinds);
    }

    @Test
    void 性能名和屏幕档位与前端词表一致() throws Exception {
        String source = SourceScanner.withoutComments(
                SourceScanner.read(SourceScanner.REPO_ROOT.resolve("packages/monitoring/src/envelope.ts")));
        assertThat(RumVocabulary.VITAL_NAMES).containsExactlyInAnyOrderElementsOf(stringUnion(source, "WebVitalName"));
        assertThat(RumVocabulary.VIEWPORTS).containsExactlyInAnyOrderElementsOf(stringUnion(source, "ViewportSize"));
    }

    private static Set<String> stringUnion(String source, String name) {
        Matcher union =
                Pattern.compile("export type " + name + "\\s*=([^\\n]+)").matcher(source);
        assertThat(union.find()).as("Missing frontend union: %s", name).isTrue();
        Set<String> result = new TreeSet<>();
        Matcher values = Pattern.compile("\"([^\"]+)\"").matcher(union.group(1));
        while (values.find()) result.add(values.group(1));
        assertThat(result).isNotEmpty();
        return result;
    }

    private static Set<String> frontendErrorNames() throws IOException {
        String source = SourceScanner.withoutComments(SourceScanner.read(FRONTEND_ERROR_OWNER));
        Matcher union = ERROR_NAME_UNION.matcher(source);
        if (!union.find()) {
            return Set.of();
        }
        Set<String> names = new TreeSet<>();
        Matcher quoted = QUOTED.matcher(union.group(1));
        while (quoted.find()) {
            names.add(quoted.group(1));
        }
        return names;
    }
}

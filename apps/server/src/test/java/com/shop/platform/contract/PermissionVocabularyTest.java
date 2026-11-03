package com.shop.platform.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.infra.security.Permission;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * 权限码的**覆盖面**：清单里每个码都必须指得到至少一个检查点。
 *
 * <p>为什么这条比"yaml ⇄ 枚举 ⇄ 前端生成物是否一致"更重要：那三者现在由
 * {@code scripts/contracts/permissions-codegen.mjs} 一次生成，结构上不可能漂，一致性已经不需要测试
 * （{@code pnpm permissions:drift} 是生成物过期的门）。真正会出问题的是另一件事——**码登记了、
 * 但没人检查**。那种码是死的：它让"这个人有权限吗"多出第三种答案，而且永远为真。
 *
 * <p>所以判据是：{@code src/main/java} 里必须出现 {@code Permission.<枚举名>}。豁免只有一个：
 * {@link #NOT_YET_WIRED}——每一条都要写清为什么，加一条等于认领一份待办。
 *
 * @see <a href="../../../../../../../docs/domain/access-control.md">docs/domain/access-control.md</a>
 */
class PermissionVocabularyTest {

    /**
     * 清单里有、但还没有检查点的码。**这张表只会变短。**
     *
     * <p>两种成因，都写清了：① 功能后端还没有（没有对应的 controller）；② 端点存在但语义还没接上。
     */
    private static final Set<String> NOT_YET_WIRED = Set.of(
            // ① 后端还没有对应端点
            "inventory:read",
            "inventory:adjust",
            "ad:read",
            "ad:write",
            "ad:review",
            "brand:configure",
            "coupon:configure",
            "coupon:issue",
            "content_article:write",
            "rum_report:read",
            "audit_log:read",
            "event_record:read",
            "buyer_account:read");

    private static final Pattern REFERENCE = Pattern.compile("Permission\\.([A-Z][A-Z0-9_]*)");

    @Test
    void 每个权限码都指得到一个检查点() throws IOException {
        Set<String> referenced = referencedEnumNames();

        Set<String> missing = new TreeSet<>();
        for (Permission permission : Permission.values()) {
            if (referenced.contains(permission.name()) || NOT_YET_WIRED.contains(permission.code())) {
                continue;
            }
            missing.add(permission.code());
        }

        assertThat(missing)
                .as("这些权限码登记在 contracts/permissions.yaml 里，但 src/main/java 里没有任何 "
                        + "Permission.<名字> 的引用——它们是死码。要么接上检查点，要么从清单里删掉，"
                        + "要么加进 NOT_YET_WIRED 并写清原因")
                .isEmpty();
    }

    @Test
    void 豁免清单里不许有已经不存在的码() {
        Set<String> live = Permission.codes();
        assertThat(NOT_YET_WIRED.stream().filter(code -> !live.contains(code)).toList())
                .as("NOT_YET_WIRED 里出现了清单里没有的码——码改了名或删了，这张表也要跟着改")
                .isEmpty();
    }

    private static Set<String> referencedEnumNames() throws IOException {
        Set<String> names = new TreeSet<>();
        try (Stream<Path> files = Files.walk(Path.of("src", "main", "java"))) {
            for (Path path : files.filter(Files::isRegularFile)
                    .filter(file -> file.toString().endsWith(".java"))
                    .filter(file -> !file.getFileName().toString().equals("Permission.java"))
                    .toList()) {
                String source = Files.readString(path, StandardCharsets.UTF_8);
                Matcher matcher = REFERENCE.matcher(source);
                while (matcher.find()) {
                    names.add(matcher.group(1));
                }
            }
        }
        return names;
    }
}

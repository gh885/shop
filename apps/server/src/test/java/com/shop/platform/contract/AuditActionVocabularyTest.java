package com.shop.platform.contract;

import static org.assertj.core.api.Assertions.assertThat;

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
 * 审计动作注册表 ⇄ 代码调用点的双向核对。
 *
 * <p>不起 Spring、不连库，纯文本扫描，与 {@link ErrorCodeVocabularyTest} 同一形态。注册表在迁移里
 * （{@code INSERT INTO audit.audit_action}），真相是「应用后库里的行」＝各迁移的 INSERT 并集减去
 * DELETE 子集——解析必须算上 DELETE，否则上一轮清掉的孤儿会从旧 INSERT 里"复活"。
 *
 * <p>两个方向各堵一种静默失效：
 *
 * <ul>
 *   <li><b>注册了没人调</b>（死码，运行时永远不会报错）：注册表里的动作在全仓 main 源码里连同形状的
 *       字面量都找不到。用宽口径（任意 3 段小写字面量）是因为动作名可能经变量透传给
 *       {@code AuditEntry.by*}（如 GovernanceEnforcementService.changeStatus），直调扫描会漏；
 *       宽口径对已登记动作零误伤，代价是只敢用在「判死」这一侧。
 *   <li><b>调了没注册</b>（运行时会炸 {@code 未登记的审计动作}，但炸在生产写入路径上代价高）：
 *       直调 {@code AuditEntry.by*} / {@code new AuditEntry} 的第一参数必须已登记。变量透传的场景
 *       这里看不见，由运行时的清单校验兜底——那是响的，不是静默的。
 * </ul>
 */
class AuditActionVocabularyTest {

    private static final Pattern ACTION_LITERAL = Pattern.compile("\"([a-z][a-z_0-9]*\\.[a-z_0-9]+\\.[a-z_0-9]+)\"");

    private static final Pattern DIRECT_CALL = Pattern.compile("AuditEntry\\.by\\w*\\s*\\(\\s*\"([a-z.]+)\"");

    private static final Path MIGRATIONS = Path.of("src", "main", "resources", "db", "migration");

    @Test
    void 注册表里的每个动作都有生产者() throws Exception {
        Set<String> orphans = new TreeSet<>(registry());
        orphans.removeAll(literalsInMain());

        assertThat(orphans)
                .as("注册了但全仓没有任何同形状字面量的审计动作（死码）：要么补调用点，要么进迁移的 DELETE。%n%s", orphans)
                .isEmpty();
    }

    @Test
    void 直调的动作必须已登记() throws Exception {
        Set<String> unregistered = new TreeSet<>(directCalls());
        unregistered.removeAll(registry());

        assertThat(unregistered)
                .as("直调 AuditEntry 的动作名没在迁移里登记，写入时会抛「未登记的审计动作」：%n%s", unregistered)
                .isEmpty();
    }

    /**
     * 注册表 = 各迁移 INSERT 并集 − DELETE 子集。
     *
     * <p>包级可见：{@link AuditCoverageTest} 要拿它核「audit:」覆盖项引用的动作真实存在。
     */
    static Set<String> registry() throws IOException {
        Set<String> actions = new TreeSet<>();
        Set<String> removed = new TreeSet<>();
        Pattern insert = Pattern.compile("INSERT\\s+INTO\\s+audit\\.audit_action[^;]*?;", Pattern.DOTALL);
        Pattern delete = Pattern.compile("DELETE\\s+FROM\\s+audit\\.audit_action[^;]*?;", Pattern.DOTALL);
        try (Stream<Path> files = Files.list(MIGRATIONS)) {
            for (Path file :
                    files.filter(path -> path.toString().endsWith(".sql")).toList()) {
                String sql = Files.readString(file, StandardCharsets.UTF_8).replace("\r", "");
                collectActions(insert.matcher(sql), actions);
                collectActions(delete.matcher(sql), removed);
            }
        }
        actions.removeAll(removed);
        assertThat(actions).as("注册表一条都没解析出来，正则和迁移格式对不上了").isNotEmpty();
        return actions;
    }

    private static void collectActions(Matcher statements, Set<String> into) {
        while (statements.find()) {
            Matcher literals =
                    Pattern.compile("'([a-z][a-z_0-9]*(?:\\.[a-z_0-9]+)+)'").matcher(statements.group());
            while (literals.find()) {
                into.add(literals.group(1));
            }
        }
    }

    /** 全仓 main 源码里所有「3 段小写点分」字面量——动作名的唯一形状。 */
    static Set<String> literalsInMain() throws IOException {
        Set<String> literals = new TreeSet<>();
        try (Stream<Path> files = Files.walk(Path.of("src", "main", "java"))) {
            for (Path file :
                    files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String source = Files.readString(file, StandardCharsets.UTF_8).replace("\r", "");
                for (Matcher matcher = ACTION_LITERAL.matcher(source); matcher.find(); ) {
                    literals.add(matcher.group(1));
                }
            }
        }
        return literals;
    }

    /** 直调 {@code AuditEntry.by*} 的第一参数字面量。 */
    private static Set<String> directCalls() throws IOException {
        Set<String> calls = new TreeSet<>();
        try (Stream<Path> files = Files.walk(Path.of("src", "main", "java"))) {
            for (Path file :
                    files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String source = Files.readString(file, StandardCharsets.UTF_8).replace("\r", "");
                for (Matcher matcher = DIRECT_CALL.matcher(source); matcher.find(); ) {
                    calls.add(matcher.group(1));
                }
            }
        }
        return calls;
    }
}

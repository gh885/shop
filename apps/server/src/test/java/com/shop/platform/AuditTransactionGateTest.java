package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.testsupport.SourceScanner;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * 门禁：写审计账本的调用点必须落在事务里。
 *
 * <p>值得钉住的理由不是风格：{@code RecordAuditCommand.record} 标着 {@code @Transactional(MANDATORY)}，调用方不在事务里
 * 就直接抛 {@code IllegalTransactionStateException}——业务库已经改完、账本一行没有、接口回 500。「管理端禁用买家」就是这么坏的：
 * 缺 {@code @Transactional} 的那条路径只有 mock 单测（mapper 被 mock，事务传播根本不参与），所以从测试里看不出来，
 * 而规则此前只写在 {@code audit} 的 package-info 与各调用点的注释里，靠 code review 维持。
 *
 * <p>口径读的是剥净注释的源码（{@link SourceScanner#withoutComments}：注释里提一句 {@code @Transactional} 不算开了事务）。
 * 成员边界按 spotless 的固定缩进认（成员在 4 空格、其声明的续行在 8 空格以上），每个调用点必须解析到某个方法，且：
 *
 * <ul>
 *   <li>方法自己（或其类）带 {@code @Transactional}，或
 *   <li>那是 {@code private} 辅助方法且<b>本文件内每一处调用点</b>都在事务里——事务由调用方带入。
 *       放宽只给 private：跨文件的调用方这里看不见，而「公开入口没事务」正是本门禁要拦的那个 bug。
 * </ul>
 *
 * <p><b>认不出所属方法也算违规</b>：签名形状一改这里先炸，而不是静默漏检——门禁宁可假红也不假绿。
 */
class AuditTransactionGateTest {

    private static final Path MAIN_JAVA = SourceScanner.MAIN_JAVA;

    /** 账本写入的唯一出口；字段名全库统一为 recordAuditCommand（由注入的类型名决定） */
    private static final Pattern RECORD_CALL = Pattern.compile("\\brecordAuditCommand\\.record\\s*\\(");

    /** 方法签名起始行：显式修饰符开头，其后某处出现 {@code 名字(}；带 {@code ;} 或 {@code =} 的是字段/常量 */
    private static final Pattern SIGNATURE =
            Pattern.compile("^(public|protected|private|static|final|synchronized)\\b.*[A-Za-z_$][\\w$]*\\(");

    private static final Pattern METHOD_NAME = Pattern.compile("([A-Za-z_$][\\w$]*)\\s*\\(");

    private static final Pattern TYPE_DECL = Pattern.compile("\\b(class|record|interface|enum)\\s+\\w");

    /** 一个方法：名字、是否 private、是否自带事务 */
    private record Method(String name, boolean isPrivate, boolean inTransaction) {}

    private static final Method NO_METHOD = new Method(null, false, false);

    @Test
    void 写审计账本的调用点全都在事务里() throws IOException {
        List<String> unguarded = new ArrayList<>();
        int callSites = 0;

        for (Path file : SourceScanner.javaFiles(MAIN_JAVA)) {
            String source = SourceScanner.withoutComments(SourceScanner.read(file));
            int inThisFile = count(source, RECORD_CALL);
            if (inThisFile == 0) {
                continue;
            }
            callSites += inThisFile;
            check(file, source, unguarded);
        }

        assertThat(unguarded).as("审计写入与业务动作不同事务时，动作已落库而账本为空，接口还回 500").isEmpty();
        assertThat(callSites).as("扫描本身要有效：全库一个审计调用点都找不到，说明口径瞎了而不是规则被遵守").isPositive();
    }

    private static void check(Path file, String source, List<String> unguarded) {
        String[] lines = source.split("\n", -1);
        Method[] owner = ownersOf(lines);

        for (int i = 0; i < lines.length; i++) {
            if (!RECORD_CALL.matcher(lines[i]).find()) {
                continue;
            }
            String at = "%s:%d".formatted(SourceScanner.rel(MAIN_JAVA, file), i + 1);
            Method method = owner[i];
            if (method.name() == null) {
                unguarded.add("%s 认不出所属方法（签名形状变了，先修本门禁的口径）".formatted(at));
                continue;
            }
            if (method.inTransaction()) {
                continue;
            }
            if (!method.isPrivate()) {
                unguarded.add("%s %s() 缺 @Transactional：审计写 MANDATORY，无事务即 500 且账本一行不留".formatted(at, method.name()));
                continue;
            }
            String caller = firstUntypedCaller(lines, owner, method.name());
            if (caller != null) {
                unguarded.add("%s %s() 的事务靠调用方带入，但 %s() 这条路径上没有事务".formatted(at, method.name(), caller));
            }
        }
    }

    /**
     * 逐行标出「这一行属于哪个方法」。只认三种行：成员边界行（缩进 0 或 4）、边界行的注解续行、其余（方法体内部，沿用当前方法）。
     * 注解块在遇到下一个成员声明时结算：类型声明行结算类级事务，签名行结算方法级事务。
     */
    private static Method[] ownersOf(String[] lines) {
        Method[] owner = new Method[lines.length];
        StringBuilder pending = new StringBuilder();
        boolean classTransactional = false;
        Method current = NO_METHOD;

        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            String trimmed = line.trim();
            if (trimmed.isEmpty()) {
                owner[i] = current;
                continue;
            }
            int indent = line.length() - trimmed.length();
            if (indent > 4) {
                if (!pending.isEmpty()) {
                    pending.append(trimmed).append(' ');
                }
                owner[i] = current;
                continue;
            }
            if (trimmed.startsWith("@")) {
                pending.append(trimmed).append(' ');
                owner[i] = current;
                continue;
            }
            boolean annotated = pending.indexOf("@Transactional") >= 0;
            if (TYPE_DECL.matcher(trimmed).find()) {
                classTransactional = annotated;
                current = NO_METHOD;
            } else if (isSignature(trimmed)) {
                current =
                        new Method(methodName(trimmed), trimmed.startsWith("private"), classTransactional || annotated);
            } else {
                current = NO_METHOD;
            }
            pending.setLength(0);
            owner[i] = current;
        }
        return owner;
    }

    /** private 辅助方法的事务由调用方带入：本文件内找它每一处调用点，返回第一个没事务的调用方名字（没有则 null）。 */
    private static String firstUntypedCaller(String[] lines, Method[] owner, String name) {
        Pattern call = Pattern.compile("\\b" + Pattern.quote(name) + "\\s*\\(");
        for (int i = 0; i < lines.length; i++) {
            Method here = owner[i];
            if (name.equals(here.name())) {
                continue; // 自己的签名行与自身递归调用，都不算调用方
            }
            if (!call.matcher(lines[i]).find()) {
                continue;
            }
            if (here.name() == null || !here.inTransaction()) {
                return here.name() == null ? "一处顶层调用" : here.name();
            }
        }
        return null;
    }

    private static boolean isSignature(String trimmed) {
        return SIGNATURE.matcher(trimmed).find() && !trimmed.contains(";") && !trimmed.contains("=");
    }

    private static String methodName(String signatureLine) {
        var matcher = METHOD_NAME.matcher(signatureLine);
        String last = null;
        while (matcher.find()) {
            last = matcher.group(1);
        }
        return last == null ? "未知方法" : last;
    }

    private static int count(String source, Pattern pattern) {
        var matcher = pattern.matcher(source);
        int n = 0;
        while (matcher.find()) {
            n++;
        }
        return n;
    }
}

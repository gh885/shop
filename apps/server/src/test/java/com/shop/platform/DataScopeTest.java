package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * 数据归属强制：范围表上的查询必须把归属列写进 SQL，写成 Internal 后缀的方法除外。
 *
 * <p>这是「越权防线从 code review 自觉变成 CI 强制」的落点。列表查询历来绑归属，真正的口子在
 * 详情点查——{@code WHERE id = ?} 查出来再在 Java 里比对，谁新加一条读就多一个忘比对的机会
 * （实测 {@code GET /shipments} 就这么漏过：任何卖家可枚举别家子单的运单号）。现在归属列进 SQL，
 * 漏写即本测试红灯，不需要任何人记得。
 *
 * <p>覆盖两种形态：
 *
 * <ul>
 *   <li>{@code @Select} 注解 SQL（含拼接 {@code COLUMNS} 常量与 {@code LIST_SQL} 式常量引用）；
 *   <li>{@code JdbcClient} 手写 SQL 的 text block 常量（api 包里的跨模块点查）。
 * </ul>
 *
 * <p><b>豁免只有一个：Internal 后缀。</b>方法名以 Internal 结尾 = 调用方自行完成了归属校验
 * （定时任务、事件处理、webhook、母单已验过的子表查询），controller 调 Internal 由
 * {@code ArchitectureTest} 另行拦截。命名豁免是显式的：review 时 Internal 三个字母必须站得住。
 *
 * <p>只管 SELECT：写路径是 CAS 条件更新 + service 层归属校验（approve/reject 都带 merchantId），
 * 无条件写已被 ArchitectureTest 的「写只许带前置条件」拦死。UPDATE/DELETE 的归属列绑定是后续加固项。
 *
 * <p>范围表清单是白名单不是全集——表进清单的资格是「行永远不公开」：
 * {@code seller.shipping_template} 不在（结算定价要公开读 active 模板），catalog 商品同理。
 * 加表先想清楚它有没有公开读路径。
 *
 * <p>不起 Spring、不连库，纯文本扫描，与 {@code ErrorCodeVocabularyTest} 同一形态。
 */
class DataScopeTest {

    /** 表 → 可接受的归属列（一表多列：售后单既有 merchant_id 又有 buyer_id，绑任一即认可）。 */
    private static final Map<String, Set<String>> SCOPED_TABLES = Map.of(
            "trade.order_group", Set.of("buyer_id"),
            "trade.seller_order", Set.of("merchant_id"),
            "fulfillment.package", Set.of("merchant_id"),
            "returns.rma_case", Set.of("merchant_id", "buyer_id"),
            "account.addresses", Set.of("buyer_id"));

    private static final Pattern ANNOTATION_START = Pattern.compile("@(Select|Update|Insert|Delete)\\s*\\(");

    private static final Pattern CONSTANT_DEF = Pattern.compile("String\\s+(\\w+)\\s*=");

    private static final Pattern TEXT_BLOCK_CONSTANT =
            Pattern.compile("String\\s+(\\w+)\\s*=\\s*\"\"\"", Pattern.MULTILINE);

    private static final Pattern FIRST_FROM =
            Pattern.compile("\\bFROM\\s+(?!\\()((?:\\w+)\\.)?(\\w+)", Pattern.CASE_INSENSITIVE);

    @Test
    void 范围表查询必须绑定归属列() throws IOException {
        List<String> violations = new ArrayList<>();
        try (Stream<Path> files = Files.walk(Path.of("src", "main", "java"))) {
            files.filter(Files::isRegularFile)
                    .map(path -> path.toString().replace('\\', '/'))
                    .filter(DataScopeTest::isDataAccessPath)
                    .forEach(path -> {
                        try {
                            scan(path, violations);
                        } catch (IOException e) {
                            throw new IllegalStateException("读不到源文件: " + path, e);
                        }
                    });
        }
        assertThat(violations)
                .as(
                        "范围表上的查询必须带归属列（WHERE/AND + buyer_id/merchant_id），或方法名以 Internal 结尾显式豁免。%n逐条：%n%s",
                        String.join("%n", violations))
                .isEmpty();
    }

    /** 只扫数据可能住的四类包，与 ArchitectureTest 的 DATA_ACCESS_PACKAGES 同一口径。 */
    private static boolean isDataAccessPath(String path) {
        return path.contains("/mapper/")
                || path.contains("/api/")
                || path.contains("/common/")
                || path.contains("/infra/");
    }

    private static void scan(String path, List<String> violations) throws IOException {
        String source = Files.readString(Path.of(path), StandardCharsets.UTF_8);
        Map<String, String> constants = constantsOf(source);
        scanAnnotationSql(path, source, constants, violations);
        scanTextBlockConstants(path, source, constants, violations);
    }

    /** 收集文件级 String 常量（RHS 原文到分号），供 {@code @Select(LIST_SQL)} 与 {@code "..." + COLUMNS} 解引用。 */
    private static Map<String, String> constantsOf(String source) {
        Map<String, String> constants = new LinkedHashMap<>();
        Matcher matcher = CONSTANT_DEF.matcher(source);
        while (matcher.find()) {
            int end = source.indexOf(';', matcher.end());
            if (end > 0) {
                constants.put(matcher.group(1), source.substring(matcher.end(), end));
            }
        }
        return constants;
    }

    /**
     * 规则 A：@Select 注解 SQL。注解实参按括号配对取出（SQL 文本里的括号在字符串内也是成对的），
     * 方法名取注解之后、下一个 {@code (} 之前的最后一个标识符。
     * @Update/@Insert/@Delete 也进入定位但被跳过——只管 SELECT，见类注释。
     */
    private static void scanAnnotationSql(
            String path, String source, Map<String, String> constants, List<String> violations) {
        Matcher annotation = ANNOTATION_START.matcher(source);
        while (annotation.find()) {
            int close = matchingParen(source, annotation.end() - 1);
            if (close < 0) {
                continue;
            }
            String statement = source.substring(annotation.end(), close);
            String method = methodNameAfter(source, close + 1);
            if (annotation.group(1).equals("Select") && !method.endsWith("Internal")) {
                checkStatement(path, method, resolve(statement, constants), violations);
            }
        }
    }

    /** 注解实参的配对右括号下标；SQL 字符串内的括号成对出现，按字符计数即可。 */
    private static int matchingParen(String source, int openIndex) {
        int depth = 0;
        for (int i = openIndex; i < source.length(); i++) {
            char c = source.charAt(i);
            if (c == '(') {
                depth++;
            } else if (c == ')') {
                depth--;
                if (depth == 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    /** 注解结束到下一个 {@code (} 之间的最后一个标识符就是方法名（本库注解方法不带第二个注解，够用）。 */
    private static String methodNameAfter(String source, int from) {
        int paren = source.indexOf('(', from);
        if (paren < 0) {
            return "?";
        }
        Matcher id = Pattern.compile("([A-Za-z_]\\w*)\\s*$").matcher(source.substring(from, paren));
        return id.find() ? id.group(1) : "?";
    }

    /** 规则 A'：text block 常量里的 SELECT（JdbcClient 手写 SQL、被 @Select 引用的常量）。结束以第一个 {@code """} 为准——文本块内不可能出现三连引号。 */
    private static void scanTextBlockConstants(
            String path, String source, Map<String, String> constants, List<String> violations) {
        Matcher matcher = TEXT_BLOCK_CONSTANT.matcher(source);
        while (matcher.find()) {
            int close = source.indexOf("\"\"\"", matcher.end());
            if (close < 0) {
                continue;
            }
            String name = matcher.group(1);
            String raw = source.substring(matcher.end(), close);
            if (raw.matches("(?si)\\s*(<script>\\s*)?(UPDATE|INSERT|DELETE|WITH)\\b.*") || name.endsWith("INTERNAL")) {
                continue;
            }
            checkStatement(path, name, resolve(raw, constants), violations);
        }
    }

    /** 语句主表落在范围表上时，要求归属列出现在谓词位置（WHERE/AND/OR/ON 后），或使用动态归属参数 {@code #{ownerId}}。 */
    private static void checkStatement(String path, String name, String statement, List<String> violations) {
        Matcher from = FIRST_FROM.matcher(statement);
        if (!from.find()) {
            return;
        }
        String table = from.group(1) != null ? from.group(1) + from.group(2) : from.group(2);
        Set<String> ownerColumns = lookup(table);
        if (ownerColumns == null) {
            return;
        }
        if (statement.contains("#{ownerId}")) {
            return;
        }
        for (String column : ownerColumns) {
            if (Pattern.compile("\\b(WHERE|AND|OR|ON)\\s+(\\w+\\.)?" + column + "\\b", Pattern.CASE_INSENSITIVE)
                    .matcher(statement)
                    .find()) {
                return;
            }
        }
        violations.add(path + ": " + name + " 查范围表 " + table + " 没绑归属列（" + ownerColumns + "）");
    }

    /** 把语句里引用的文件级常量（{@code LIST_SQL}、{@code COLUMNS}）原地展开，FROM 与谓词才看得得见。 */
    private static String resolve(String statement, Map<String, String> constants) {
        String resolved = statement;
        for (Map.Entry<String, String> constant : constants.entrySet()) {
            if (resolved.contains(constant.getKey())) {
                resolved = resolved.replaceAll(
                        "\\b" + constant.getKey() + "\\b", Matcher.quoteReplacement(constant.getValue()));
            }
        }
        return resolved;
    }

    private static Set<String> lookup(String table) {
        if (SCOPED_TABLES.containsKey(table)) {
            return SCOPED_TABLES.get(table);
        }
        String bare = table.contains(".") ? table.substring(table.indexOf('.') + 1) : table;
        return SCOPED_TABLES.keySet().stream()
                .filter(key -> key.endsWith("." + bare))
                .findFirst()
                .map(SCOPED_TABLES::get)
                .orElse(null);
    }
}

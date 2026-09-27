package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.ErrorCodes;
import com.shop.platform.testsupport.SourceScanner;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * 错误码词表的单点门禁：一个码在 Java 常量、{@code docs/error-codes.md}、{@code packages/common} 三边的值、
 * 状态码与前端落点必须同时成立。
 *
 * <p>code 是这个仓库里<b>唯一没有类型承载</b>的对外词汇：金额有 {@code Money}、手机号有
 * {@code PhoneNumber}、区划码有 {@code RegionRegistry}，而错误码就是一个裸 {@code String} 参数，
 * 从一个 service 方法一路飘到 RFC 9457 响应的扩展属性，再被前端按字符串比对。全链路没有一处会因为
 * 拼错而编译不过、404 不、500 不——它只是让前端那条按码分支静静地永不命中。此前 41 处抛出点散抄 23 个码，
 * 同一个码最多抄了 6 遍（{@code INVALID_TOKEN}）：改一次的名字要记得改六处，忘记任何一处的表现
 * 是「一半的路径还认得这个码」。现在抛出点只引用 {@link ErrorCodes}，字面量在本仓库只住在 owner 里。
 *
 * <p>三边之中只有 Java 常量与 TS 常量是编译期可查的，文档那一格是散文——所以本类的重心有两处：
 * <ol>
 *   <li><b>把文档变成可 join 的表</b>：{@code HTTP} 列与每一处抛出点由出口推出来的状态码逐处相等；
 *       「谁在读」列不是谁写的声明，而是拿生产前端源码里真实出现的 {@code ErrorCodes.X} 引用反查出来的集合，
 *       两个方向都必须相等（多一个 reader 红、少一个 reader 也红）；
 *   <li><b>结构性禁令</b>：抛出点的码位只许是 {@code ErrorCodes.X}、{@code null}，或三处登记在案的<b>导管</b>
 *       （{@code Validate.isTrue} 的形参、两个鉴权过滤器手里的 {@code verification.code()}）。
 *       新起一条「码从变量里来」的导管会让白名单等式当场红——那种导管是漂移的温床：静态扫不到，就等于不存在。
 * </ol>
 *
 * <p><b>本类不管日志文本，也不管契约</b>：{@code detail} 文案与日志里的码都不是契约，随便改；
 * 而 code 本身由 {@code GlobalExceptionHandler} 挂成 ProblemDetail 扩展属性，<b>不进</b>
 * {@code openapi/api-docs.json}，所以改码不需要 {@code pnpm gen:sdk}（这与
 * {@link FieldRuleVocabularyTest} 守的那一族数字根本不同——那一族是契约）。
 *
 * <p>无库、不起 Spring：反射读 {@link ErrorCodes}，其余全部是纯文本扫描。
 */
class ErrorCodeVocabularyTest {

    private static final Path MAIN_JAVA = Path.of("src", "main", "java");
    private static final Path REPO_ROOT = Path.of("..", "..");
    private static final Path DOC = REPO_ROOT.resolve(Path.of("docs", "error-codes.md"));
    private static final Path TS_OWNER = REPO_ROOT.resolve(Path.of("packages", "common", "src", "error-codes.ts"));

    /** 生产前端源码目录（错误码的消费侧）；`packages/api` 全是生成物，不在内 */
    private static final List<Path> FRONTEND_SOURCE = List.of(
            REPO_ROOT.resolve(Path.of("apps", "web", "src")),
            REPO_ROOT.resolve(Path.of("apps", "seller", "src")),
            REPO_ROOT.resolve(Path.of("apps", "admin", "src")),
            REPO_ROOT.resolve(Path.of("packages", "common", "src")),
            REPO_ROOT.resolve(Path.of("packages", "app-kit", "src")),
            REPO_ROOT.resolve(Path.of("packages", "ui-web", "src")));

    /** 文档里声明「这一发不是后端打的」的那些码：只许出现在前端自己的错误通道里 */
    private static final Set<String> FRONTEND_ONLY_CODES = Set.of("RESPONSE_VALIDATION_FAILED");

    /**
     * 码位允许「从变量来」的导管，形如 {@code 文件名 -> 允许的实参表达式}。
     * 这三处是收口本身（{@code Validate} 把形参转交异常、两个过滤器把校验结果里的码转交 writer），
     * 不是漏抄。白名单是等式：多一处（新导管）就红。
     */
    private static final Map<String, String> CODE_PLUMBING = Map.of(
            "Validate.java", "code",
            "JwtAuthFilter.java", "verification.code()",
            "StaffAuthFilter.java", "verification.code()");

    /**
     * 出口的定义处：{@code BusinessException} 的工厂方法。测试<b>不抄</b>「哪个工厂给哪个状态码」，
     * 而是从这些工厂的签名与函数体里读出来（见 {@link #codedFactories()}），并从这两条出口扫描里跳过它自己。
     */
    private static final Path EXCEPTION_OWNER =
            MAIN_JAVA.resolve(Path.of("com", "shop", "platform", "common", "BusinessException.java"));

    private static final Pattern CODE_NAME = Pattern.compile("ErrorCodes\\.([A-Z][A-Z0-9_]+)");
    private static final Pattern CODE_LITERAL = Pattern.compile("\"([A-Z][A-Z0-9_]{3,})\"");
    private static final Pattern DOC_ROW =
            Pattern.compile("^\\|\\s*`([A-Z][A-Z0-9_]*)`\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|]+?)\\s*\\|");
    private static final Pattern TS_ENTRY =
            Pattern.compile("^\\s*([A-Z][A-Z0-9_]*)\\s*:\\s*\"([A-Z][A-Z0-9_]*)\"\\s*,?$");
    private static final Pattern TS_READER = Pattern.compile("ErrorCodes\\.([A-Z][A-Z0-9_]+)");

    /** 一处抛码站点：码、由出口推出的状态码、出处 */
    private record Site(String code, int status, String at) {}

    /** 文档一行：Code、HTTP 列原文、「谁在读」列（已解析成仓库相对路径） */
    private record DocRow(String code, String http, Set<String> readers) {}

    // ---------------------------------------------------------------- 三边集合

    @Test
    void java常量名与值逐字节相同且文档表与ts镜像同一集合() throws Exception {
        Map<String, String> java = javaConstants();
        assertThat(java).as("owner 里一个常量都没有，本测试会空转").isNotEmpty();

        // 1. Java：常量名 == 值（对外那个字符串就是名字，中间不许有翻译）
        for (Map.Entry<String, String> e : java.entrySet()) {
            assertThat(e.getValue()).as("错误码常量的值必须等于它的名字：%s", e.getKey()).isEqualTo(e.getKey());
        }

        List<DocRow> doc = docRows();
        Set<String> docCodes = doc.stream().map(DocRow::code).collect(Collectors.toCollection(TreeSet::new));
        Set<String> ts = tsCodes();

        // 2. Java ⇄ 文档（文档多出来的只能是被登记过的前端独有码）
        Set<String> inJava = new TreeSet<>(java.keySet());
        assertThat(docCodes).as("文档 Code 列必须覆盖 Java owner 的每个常量").containsAll(inJava);
        Set<String> docOnly = new TreeSet<>(docCodes);
        docOnly.removeAll(inJava);
        assertThat(docOnly).as("文档里有、Java 不抛的码必须逐个登记进 FRONTEND_ONLY_CODES").isSubsetOf(FRONTEND_ONLY_CODES);

        // 3. 文档 ⇄ TS，双向
        assertThat(ts).as("TS 少了文档里的码").isEqualTo(docCodes);
    }

    @Test
    void 每个码都有真实抛出点除登记过的前端独有码() throws Exception {
        Map<String, String> java = javaConstants();
        List<Site> sites = throwSites();
        Set<String> thrown = sites.stream().map(Site::code).collect(Collectors.toCollection(TreeSet::new));

        assertThat(thrown).as("owner 里的每个码都得真的有人抛，否则它就是文档里那条规则的谎言").isEqualTo(new TreeSet<>(java.keySet()));
        for (String frontendOnly : FRONTEND_ONLY_CODES) {
            assertThat(java).as("前端独有的码不许同时在 Java owner 里有定义").doesNotContainKey(frontendOnly);
            assertThat(docRow(frontendOnly).readers())
                    .as("前端独有的码必须有真实读者，否则它是凭空造的词")
                    .isNotEmpty();
        }
    }

    // ---------------------------------------------------------------- 字面量禁令

    @Test
    void 错误码字面量只许住在owner里() throws Exception {
        Set<String> vocabulary = new TreeSet<>(javaConstants().keySet());
        int owned = vocabulary.size();
        vocabulary.addAll(FRONTEND_ONLY_CODES);
        List<String> offenders = new ArrayList<>();
        for (Path file : mainSources()) {
            boolean owner = file.endsWith("ErrorCodes.java");
            for (String line : read(file)) {
                Matcher literal = CODE_LITERAL.matcher(line);
                while (literal.find()) {
                    String value = literal.group(1);
                    if (!owner && vocabulary.contains(value)) {
                        offenders.add(rel(file) + " -> \"" + value + "\"");
                    }
                }
            }
        }
        assertThat(offenders)
                .as("抛出点要写 ErrorCodes.X（拼错的码不会有任何一处报错，只会让前端那条分支永不命中）")
                .isEmpty();
        assertThat(vocabulary).as("词汇表空了，上面的扫描就是空转").hasSizeGreaterThanOrEqualTo(24);

        // 反空转：owner 里确实住着这些字面量，禁令才有意义
        long ownerLiterals =
                read(MAIN_JAVA.resolve(Path.of("com", "shop", "platform", "common", "ErrorCodes.java"))).stream()
                        .filter(l -> CODE_LITERAL.matcher(l).find())
                        .count();
        assertThat(ownerLiterals).as("owner 自己的字面量数应当与它的常量数同量级，否则上面的扫描是在空转").isGreaterThanOrEqualTo(owned);
    }

    @Test
    void 抛码站点的码位只许是常量null或登记过的导管() throws Exception {
        Map<String, Integer> factories = codedFactories();
        List<String> offenders = new ArrayList<>();
        Set<String> plumbingSeen = new TreeSet<>();
        for (Path file : mainSources()) {
            if (file.equals(EXCEPTION_OWNER)) {
                continue;
            }
            String name = file.getFileName().toString();
            for (Call call : calls(file)) {
                if (!isOutlet(call, factories)) {
                    continue;
                }
                String arg = call.codeArg();
                if (arg == null) {
                    continue; // 无码（1 参工厂、null 实参）
                }
                if (CODE_NAME.matcher(arg).find()) {
                    continue;
                }
                String allowed = CODE_PLUMBING.get(name);
                if (allowed != null && allowed.equals(arg)) {
                    plumbingSeen.add(name);
                    continue;
                }
                offenders.add(rel(file) + ":" + call.line() + " -> " + arg);
            }
        }
        assertThat(offenders)
                .as("码位必须是 ErrorCodes.X，新导管要先登记进 CODE_PLUMBING 并说明理由")
                .isEmpty();
        assertThat(plumbingSeen).as("登记的导管必须还在用：不用了就删，别留白名单当摆设").isEqualTo(new TreeSet<>(CODE_PLUMBING.keySet()));
    }

    // ---------------------------------------------------------------- 状态码

    @Test
    void 文档那一列HTTP与每处抛码站点的状态码逐处相等() throws Exception {
        List<Site> sites = throwSites();
        assertThat(sites).as("一处抛码站点都没扫到，本测试空转").isNotEmpty();
        Map<String, Set<Integer>> byCode = new TreeMap<>();
        for (Site s : sites) {
            byCode.computeIfAbsent(s.code(), k -> new TreeSet<>()).add(s.status());
        }
        List<String> mismatch = new ArrayList<>();
        for (Map.Entry<String, Set<Integer>> e : byCode.entrySet()) {
            String declared = docRow(e.getKey()).http().strip();
            if (e.getValue().size() > 1) {
                mismatch.add(e.getKey() + " 同一个码在不同出口给出多种状态 " + e.getValue() + "（文档写的是 " + declared + "）");
                continue;
            }
            int actual = e.getValue().iterator().next();
            if (!String.valueOf(actual).equals(declared)) {
                mismatch.add(
                        e.getKey() + ": 文档 " + declared + " vs Java " + actual + " @ " + sitesOf(sites, e.getKey()));
            }
        }
        assertThat(mismatch).as("HTTP 列必须与真实抛出结果一致").isEmpty();
    }

    @Test
    void 校验结果的码只经401出口那条链没有断() throws Exception {
        // Verification.fail 的状态码在文档里推不出来，所以先钉住那条链：
        // 读 verification.code() 的文件必须正是以 401 抛 BusinessException 的那两个过滤器。
        List<String> readers = new ArrayList<>();
        for (Path file : mainSources()) {
            // 压平空白再比：格式化只挪换行与缩进，不该让一条链的断言失效
            String flat = SourceScanner.read(file).replaceAll("\\s+", "");
            if (!flat.contains("verification.code()")) {
                continue;
            }
            readers.add(file.getFileName().toString());
            assertThat(flat)
                    .as("拿校验结果的码去写响应，只能是 401，否则文档那一列就不成立")
                    .contains("BusinessException.unauthorized(verification.code(),verification.detail())");
        }
        assertThat(readers)
                .as("这条链的两个端点固定是那两个过滤器")
                .containsExactlyInAnyOrder("JwtAuthFilter.java", "StaffAuthFilter.java");
        for (Site site : throwSites()) {
            if (site.at().contains("BearerTokens")) {
                assertThat(site.status()).as("Verification.fail 的码按 401 入档").isEqualTo(401);
            }
        }
    }

    // ---------------------------------------------------------------- 「谁在读」列

    @Test
    void 文档的谁在读列是前端扫描结果不是声明() throws Exception {
        Map<String, Set<String>> readers = frontendReaders();
        List<String> drift = new ArrayList<>();
        for (DocRow row : docRows()) {
            Set<String> actual = readers.getOrDefault(row.code(), Set.of());
            if (!row.readers().equals(actual)) {
                drift.add(row.code() + ": 文档 " + row.readers() + " vs 实际 " + actual);
            }
        }
        assertThat(drift).as("「谁在读」两向都要相等：新增了按码分支的地方得回写文档，文档指着已不读码的文件得改").isEmpty();

        long claimed = docRows().stream().filter(r -> !r.readers().isEmpty()).count();
        assertThat(claimed).as("把这一列全填成 — 会让本测试空转：真实读者远多于此").isGreaterThanOrEqualTo(8);
        // 每个声称的落点必须是真实存在的文件
        for (DocRow row : docRows()) {
            for (String reader : row.readers()) {
                assertThat(REPO_ROOT.resolve(reader))
                        .as("%s 宣称由 %s 读取", row.code(), reader)
                        .exists();
            }
        }
    }

    @Test
    void 前端只读文档里存在的码() throws Exception {
        Set<String> docCodes = docRows().stream().map(DocRow::code).collect(Collectors.toCollection(TreeSet::new));
        Set<String> read = new TreeSet<>(frontendReaders().keySet());
        assertThat(read).as("前端按一个文档没有的码分支，等于凭空造词").isSubsetOf(docCodes);
        assertThat(read).as("前端一处都没读码，扫描大概是空转").isNotEmpty();
    }

    // ---------------------------------------------------------------- 词汇表规模

    @Test
    void 词汇表规模不退坡() throws Exception {
        // 删码是接口变更：状态码与 detail 还在，只有前端那条分支会静静地永不命中。
        assertThat(javaConstants()).as("Java owner 的码数").hasSizeGreaterThanOrEqualTo(23);
        assertThat(docRows()).as("文档表的行数").hasSizeGreaterThanOrEqualTo(24);
        assertThat(tsCodes()).as("TS 镜像的键数").hasSizeGreaterThanOrEqualTo(24);
        assertThat(throwSites()).as("抛码站点数").hasSizeGreaterThanOrEqualTo(40);
    }

    // ================================================================ 读源

    private static Map<String, String> javaConstants() throws Exception {
        Map<String, String> out = new TreeMap<>();
        for (Field f : ErrorCodes.class.getDeclaredFields()) {
            if (!Modifier.isPublic(f.getModifiers()) || !String.class.equals(f.getType())) {
                continue;
            }
            out.put(f.getName(), (String) f.get(null));
        }
        return out;
    }

    private static List<DocRow> docRows() throws IOException {
        List<DocRow> rows = new ArrayList<>();
        for (String line : read(DOC)) {
            Matcher m = DOC_ROW.matcher(line);
            if (!m.find()) {
                continue;
            }
            rows.add(new DocRow(m.group(1), m.group(2), readers(m.group(3))));
        }
        return rows;
    }

    /** 「谁在读」格：{@code —} 表示无人读；多路径以 {@code 、} 或 {@code ,} 分隔，都带反引号 */
    private static Set<String> readers(String cell) {
        Set<String> out = new TreeSet<>();
        String cleaned = cell.replace("`", "").trim();
        if (cleaned.isEmpty() || cleaned.equals("—") || cleaned.equals("-")) {
            return out;
        }
        for (String part : cleaned.split("[、,]")) {
            String p = part.trim();
            if (!p.isEmpty()) {
                out.add(p);
            }
        }
        return out;
    }

    private static DocRow docRow(String code) throws IOException {
        return docRows().stream()
                .filter(r -> r.code().equals(code))
                .findFirst()
                .orElseThrow(() -> new AssertionError("docs/error-codes.md 里没有 " + code));
    }

    private static Set<String> tsCodes() throws IOException {
        Set<String> out = new TreeSet<>();
        for (String line : read(TS_OWNER)) {
            Matcher m = TS_ENTRY.matcher(line);
            if (m.find()) {
                assertThat(m.group(2)).as("TS 里每个键的值必须等于键本身").isEqualTo(m.group(1));
                out.add(m.group(1));
            }
        }
        return out;
    }

    /** 生产前端里 {@code ErrorCodes.X} 的真实出现位置：码 -> 仓库相对路径集合 */
    private static Map<String, Set<String>> frontendReaders() throws IOException {
        Map<String, Set<String>> out = new TreeMap<>();
        for (Path dir : FRONTEND_SOURCE) {
            for (Path file : SourceScanner.files(dir, ".ts", ".tsx")) {
                if (isExcludedFrontend(file.getFileName().toString())) {
                    continue;
                }
                String rel = rel(file);
                for (String line : read(file)) {
                    Matcher m = TS_READER.matcher(line);
                    while (m.find()) {
                        out.computeIfAbsent(m.group(1), k -> new TreeSet<>()).add(rel);
                    }
                }
            }
        }
        return out;
    }

    private static boolean isExcludedFrontend(String fileName) {
        return fileName.contains(".test.") || fileName.contains(".gen.") || fileName.endsWith("d.ts");
    }

    /** 一处的调用文本（跨行已拼平） */
    private record Call(String outlet, List<String> args, int line) {
        String codeArg() {
            String arg =
                    switch (outlet) {
                        case "new BusinessException" -> args.size() >= 3 ? args.get(1) : null;
                        case "Validate.isTrue" ->
                            args.size() == 3 && !args.get(1).matches("\\d+") ? args.get(1) : null;
                        case "Verification.fail" -> args.get(0);
                        default -> args.size() == 2 ? args.get(0) : null; // badRequest / forbidden / conflict
                    };
            // 显式「这一发不带码」：归属闸门那类只要状态码与人话，写 null 是设计而不是漏抄
            return "null".equals(arg) ? null : arg;
        }

        Integer status(Map<String, Integer> factories) {
            return switch (outlet) {
                case "new BusinessException" -> intArg(args.get(0));
                case "Verification.fail" -> 401;
                // isTrue 的码位只可能是第 2 参（见 codeArg），那条重载恒 400；带状态码的那条不带码
                case "Validate.isTrue" -> 400;
                default -> factories.get(outlet.substring(outlet.lastIndexOf('.') + 1));
            };
        }
    }

    private static Integer intArg(String arg) {
        return arg != null && arg.matches("\\d+") ? Integer.valueOf(arg) : null;
    }

    private static boolean isOutlet(Call call, Map<String, Integer> factories) {
        return call.codeArg() != null && call.status(factories) != null;
    }

    /** 扫出 main 下所有目标调用的实参（括号/字符串感知，支持跨行） */
    private static List<Call> calls(Path file) throws IOException {
        String src = SourceScanner.read(file);
        List<Call> out = new ArrayList<>();
        Matcher m = Pattern.compile(
                        "(new BusinessException|BusinessException\\.\\w+|Validate\\.isTrue|Verification\\.fail)\\s*\\(")
                .matcher(src);
        while (m.find()) {
            String outlet = m.group(1);
            int open = m.end() - 1;
            int close = matching(src, open);
            if (close < 0) {
                continue;
            }
            List<String> args = splitArgs(src.substring(open + 1, close));
            out.add(new Call(outlet, args, lineOf(src, m.start())));
            m.region(close, src.length());
        }
        return out;
    }

    private static List<Site> throwSites() throws Exception {
        Map<String, Integer> factories = codedFactories();
        Set<String> vocabulary = javaConstants().keySet();
        List<Site> out = new ArrayList<>();
        for (Path file : mainSources()) {
            if (file.endsWith("ErrorCodes.java") || file.equals(EXCEPTION_OWNER)) {
                continue;
            }
            for (Call call : calls(file)) {
                if (!isOutlet(call, factories)) {
                    continue;
                }
                Matcher name = CODE_NAME.matcher(call.codeArg());
                String code = name.find() ? name.group(1) : matcher(CODE_LITERAL, call.codeArg());
                if (code == null) {
                    continue; // 导管（变量码）与 null：由 抛码站点 那条测试管白名单
                }
                if (!vocabulary.contains(code)) {
                    throw new AssertionError(rel(file) + ":" + call.line() + " 引用的码不在 owner 里: " + code);
                }
                out.add(new Site(code, call.status(factories), rel(file) + ":" + call.line()));
            }
        }
        return out;
    }

    /**
     * 从 {@code BusinessException} 的工厂定义读出「哪个工厂带码、给出哪个状态码」：签名
     * {@code (String code, String detail)} 且函数体是 {@code new BusinessException(INT, code, detail)}。
     * 状态码因此不是测试里抄的一张表——工厂改状态，文档那一列就得跟着改，否则「逐处相等」那条红。
     */
    private static Map<String, Integer> codedFactories() throws IOException {
        Matcher m = Pattern.compile("publicstaticBusinessException(\\w+)\\(Stringcode,Stringdetail\\)"
                        + "\\{returnnewBusinessException\\((\\d+),code,detail\\);")
                .matcher(flatSource(EXCEPTION_OWNER));
        Map<String, Integer> out = new TreeMap<>();
        while (m.find()) {
            out.put(m.group(1), Integer.valueOf(m.group(2)));
        }
        assertThat(out.keySet()).as("带码工厂必须真的存在，否则状态码是从空气里推的").contains("badRequest", "forbidden", "conflict");
        return out;
    }

    /** 异常类里声明过的全部静态工厂 */
    private static Set<String> declaredFactories() throws IOException {
        Matcher m = Pattern.compile("publicstaticBusinessException(\\w+)\\(").matcher(flatSource(EXCEPTION_OWNER));
        Set<String> out = new TreeSet<>();
        while (m.find()) {
            out.add(m.group(1));
        }
        return out;
    }

    @Test
    void 异常工厂只有带码与不带码两种形状() throws Exception {
        Matcher m = Pattern.compile(
                        "publicstaticBusinessException(\\w+)\\(Stringdetail\\)\\{returnnewBusinessException\\((\\d+),detail\\);")
                .matcher(flatSource(EXCEPTION_OWNER));
        Set<String> plain = new TreeSet<>();
        while (m.find()) {
            plain.add(m.group(1));
        }
        Set<String> coded = codedFactories().keySet();
        assertThat(plain).as("只给人话的那族工厂要逐个在册（它们没有码位，是本类的排除项）").isNotEmpty();
        Set<String> covered = new TreeSet<>(coded);
        covered.addAll(plain);
        // 分全性：badRequest / forbidden 各是重载对（一参给人话、二参给人话 + 码），名字会同时出现在两族里，
        // 这正当；真正要挡的是第三种形状（例如又带 code 又带 errors 的工厂），它两族都进不去。
        assertThat(covered).as("有工厂落在两族之外，先补本类再补代码").isEqualTo(declaredFactories());
    }

    private static String flatSource(Path file) throws IOException {
        return SourceScanner.read(file).replaceAll("\\s+", "");
    }

    private static String matcher(Pattern p, String input) {
        Matcher m = p.matcher(input);
        return m.find() ? m.group(1) : null;
    }

    private static int lineOf(String src, int index) {
        int line = 1;
        for (int i = 0; i < index; i++) {
            if (src.charAt(i) == '\n') {
                line++;
            }
        }
        return line;
    }

    /** 括号与字符串感知的配对右括号 */
    private static int matching(String src, int open) {
        int depth = 0;
        boolean inText = false;
        for (int i = open; i < src.length(); i++) {
            char c = src.charAt(i);
            if (inText) {
                if (c == '\\') {
                    i++;
                } else if (c == '"') {
                    inText = false;
                }
                continue;
            }
            if (c == '"') {
                inText = true;
            } else if (c == '(' || c == '{' || c == '[') {
                depth++;
            } else if (c == ')' || c == '}' || c == ']') {
                if (--depth == 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    /** 按顶层逗号切实参，空白压平（多行调用给同一个形状） */
    private static List<String> splitArgs(String body) {
        List<String> out = new ArrayList<>();
        int depth = 0;
        boolean inText = false;
        StringBuilder current = new StringBuilder();
        for (int i = 0; i < body.length(); i++) {
            char c = body.charAt(i);
            if (inText) {
                if (c == '\\') {
                    current.append(c).append(body.charAt(++i));
                    continue;
                }
                if (c == '"') {
                    inText = false;
                }
                current.append(c);
                continue;
            }
            if (c == '"') {
                inText = true;
                current.append(c);
            } else if (c == '(' || c == '{' || c == '[') {
                depth++;
                current.append(c);
            } else if (c == ')' || c == '}' || c == ']') {
                depth--;
                current.append(c);
            } else if (c == ',' && depth == 0) {
                out.add(collapse(current));
                current.setLength(0);
            } else {
                current.append(c);
            }
        }
        out.add(collapse(current));
        return out;
    }

    private static String collapse(StringBuilder raw) {
        String s = raw.toString().replaceAll("\\s+", " ").trim();
        return s.isEmpty() ? null : s;
    }

    // ================================================================ 文件工具

    private static List<Path> mainSources() throws IOException {
        return SourceScanner.javaFiles(MAIN_JAVA);
    }

    private static List<String> read(Path file) throws IOException {
        return SourceScanner.lines(file).stream()
                .map(ErrorCodeVocabularyTest::strip)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    /** 注释行不参与扫描：文档式的引用不是词表定义处 */
    private static String strip(String raw) {
        String line = raw.strip();
        return (line.startsWith("*") || line.startsWith("/*") || line.startsWith("//")) ? "" : line;
    }

    private static String rel(Path file) {
        Path base = file.startsWith(MAIN_JAVA) ? MAIN_JAVA : REPO_ROOT;
        return SourceScanner.rel(base, file);
    }

    private static String sitesOf(List<Site> sites, String code) {
        return sites.stream().filter(s -> s.code().equals(code)).map(Site::at).collect(Collectors.joining(", "));
    }
}

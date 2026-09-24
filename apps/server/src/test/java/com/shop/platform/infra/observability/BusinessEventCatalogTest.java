package com.shop.platform.infra.observability;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * 业务事件目录门禁：代码里埋了什么、文档说有什么，必须是同一份事实。
 *
 * <p>五条规则各自挡一种漂移：
 * <ol>
 *   <li><b>单一出口</b>：{@code "event"} 只能由 {@link BizEvent} 写进 MDC——绕过它手写 {@code MdcScope.of("event", ...)}
 *       就把「埋字段」和「打这行」重新拆成两步，忘打的那一步不会有任何人发现</li>
 *   <li><b>目录双向相等</b>：代码埋的事件与 {@code docs/conventions/business-event-logging.md} 的表逐名相等——
 *       先上线后补文档、或文档留着代码已删的事件，两边都是骗下一个人</li>
 *   <li><b>必带字段相等</b>：表里的「必带字段」每个埋点都得有，埋点写的字段表里都得列着（{@code ; 可选} 之后算可选）——
 *       这一条同时挡住「少埋一个维度查不动」和「文档承诺了一个没人写的字段」</li>
 *   <li><b>命名形状</b>：GEN-49 的约定（短标识、点分小写、非中文；段内蛇形可以，段首段尾不行）+ 失败事件带 {@code reason}、
 *       成功事件带实体 ID（约定 2/3）</li>
 *   <li><b>规则文档不点名不存在的事件</b>：{@code docs/business-rules} 里带反引号的事件名目录都得有——
 *       业务规则讲清后果时会顺手指名事件（GEN-50 只禁抄字段表，不禁指名），改了名删了事件，这里就红</li>
 * </ol>
 *
 * <p>本测试不依赖数据库，也不需要起后端；它只读源码文本与那份文档。与 {@code ValidationVocabularyTest} 一样，
 * 它不拥有契约——事件文本不进 HTTP 响应，改它不触发 {@code pnpm gen:sdk}。
 */
class BusinessEventCatalogTest {

    private static final Path MAIN_SOURCE =
            Path.of("src", "main", "java").toAbsolutePath().normalize();
    private static final Path CATALOG_DOC = Path.of("docs", "conventions", "business-event-logging.md");

    /** 事件名：点分小写短标识，至少两段（领域实体.动词[.failed]）；段内可以多词蛇形，但段首段尾不能是下划线 */
    private static final Pattern EVENT_NAME =
            Pattern.compile("^[a-z][a-z0-9]*(_[a-z0-9]+)*(\\.[a-z][a-z0-9]*(_[a-z0-9]+)*)+$");

    /** 文档表里字段名用反引号包着：{@code `order_id`}；带点的 {@code error.type} 同样算一个字段 */
    private static final Pattern BACKTICK = Pattern.compile("`([^`]+)`");

    private static final Pattern TERMINAL = Pattern.compile("\\.(emit|warn|error)\\(");
    private static final Pattern PUT_KEY = Pattern.compile("\\.put\\(\\s*\"([^\"]+)\"");

    /** 框架自带的事件，不参与「成功事件必带实体 ID」那条（它没有主体） */
    private static final Set<String> ID_EXEMPT = Set.of("http.request");

    record Site(String event, List<String> keys, Path where) {}

    record DocRow(String event, List<String> required, List<String> optional) {}

    @Test
    void event字段只能由BizEvent写出() throws IOException {
        List<String> bypassed = new ArrayList<>();
        for (Path source : businessSources()) {
            if (Files.readString(source).contains("\"event\"")) {
                bypassed.add(MAIN_SOURCE.relativize(source).toString());
            }
        }
        assertThat(bypassed)
                .as("绕过 BizEvent 手写 event：埋字段与打那行日志被拆成两步，忘打第二步不会有任何人发现")
                .isEmpty();
    }

    @Test
    void 代码埋的事件与文档目录逐名相等() throws IOException {
        List<Site> sites = sites();
        List<DocRow> rows = catalog();

        assertThat(sites).as("一个埋点都没扫到 = 扫描失效，别让本测试假绿").isNotEmpty();
        assertThat(rows).as("文档表没解析出行 = 解析失效，同上").isNotEmpty();

        Set<String> inCode = new LinkedHashSet<>(sites.stream().map(Site::event).toList());
        Set<String> inDoc = new LinkedHashSet<>(rows.stream().map(DocRow::event).toList());
        assertThat(inCode).as("代码埋了但目录里没有（或目录留着代码已删的事件）").isEqualTo(inDoc);
    }

    @Test
    void 必带字段每个埋点都写_写出的字段目录都列着() throws IOException {
        List<Site> sites = sites();
        List<DocRow> rows = catalog();
        assertThat(rows.size())
                .as("一个事件名在目录里只能有一行，多行会让「必带」变成说不清")
                .isEqualTo(new LinkedHashSet<>(rows.stream().map(DocRow::event).toList()).size());

        for (Site site : sites) {
            DocRow row = rows.stream()
                    .filter(r -> r.event().equals(site.event()))
                    .findFirst()
                    .orElseThrow(() -> new AssertionError("目录缺 " + site.event() + " 这一行"));
            assertThat(site.keys())
                    .as("%s（%s）缺必带字段", site.event(), site.where())
                    .containsAll(row.required());

            List<String> unknown = site.keys().stream()
                    .filter(k -> !row.required().contains(k) && !row.optional().contains(k))
                    .toList();
            assertThat(unknown)
                    .as("%s（%s）写了目录里没有的字段", site.event(), site.where())
                    .isEmpty();
        }

        for (DocRow row : rows) {
            List<Site> ofEvent =
                    sites.stream().filter(s -> s.event().equals(row.event())).toList();
            for (String optional : row.optional()) {
                assertThat(ofEvent)
                        .as("目录把 %s 的 %s 列为可选，却没有任何埋点写它", row.event(), optional)
                        .anyMatch(s -> s.keys().contains(optional));
            }
        }
    }

    @Test
    void 命名与字段规则符合事件约定() throws IOException {
        for (Site site : sites()) {
            assertThat(site.event()).as("事件名（%s）", site.where()).matches(EVENT_NAME);
            if (site.event().endsWith(".failed")) {
                assertThat(site.keys()).as("失败事件 %s 必带枚举化 reason", site.event()).contains("reason");
            } else if (!ID_EXEMPT.contains(site.event())) {
                assertThat(site.keys()).as("成功事件 %s 必带实体 ID", site.event()).anyMatch(k -> k.endsWith("_id"));
            }
        }
    }

    @Test
    void 规则文档点名的事件目录里都得有() throws IOException {
        Set<String> cataloged =
                new LinkedHashSet<>(catalog().stream().map(DocRow::event).toList());
        // 末段词表取自目录本身，不硬编码：规则文档里反引号包着的点分名字混着库路径
        // （`account.users.deletion_requested_at`）和配置键（`shop.security.pepper`），按形状一刀切会全线误红。
        // 只核对「末段与某个已有事件同名」的那批：新增动词自动纳管，动词消失只是不再检查（漏检，不误红）。
        Set<String> verbs = new LinkedHashSet<>();
        for (String name : cataloged) {
            verbs.add(name.substring(name.lastIndexOf('.') + 1));
        }

        List<String> orphaned = new ArrayList<>();
        int named = 0;
        for (Path doc : ruleDocs()) {
            Matcher token = BACKTICK.matcher(Files.readString(doc));
            while (token.find()) {
                String name = token.group(1).strip();
                if (!EVENT_NAME.matcher(name).matches()) {
                    continue;
                }
                if (!verbs.contains(name.substring(name.lastIndexOf('.') + 1))) {
                    continue;
                }
                named++;
                if (!cataloged.contains(name)) {
                    orphaned.add(name + "（" + doc.getFileName() + "）");
                }
            }
        }
        assertThat(named).as("规则文档里一个事件名都没扫到 = 扫描失效，别让本测试假绿").isPositive();
        assertThat(orphaned).as("规则文档点了目录里没有的事件名：改名或删事件时，指它的业务规则要一起改").isEmpty();
    }

    // ── 内部：源码扫描与文档解析 ──

    /** 一处 {@code BizEvent.of("name").put(...)...emit()} 埋点 */
    private List<Site> sites() throws IOException {
        List<Site> sites = new ArrayList<>();
        for (Path path : businessSources()) {
            String source = path.getFileName().toString();
            String text = Files.readString(path);
            Matcher term = TERMINAL.matcher(text);
            int at = text.indexOf("BizEvent.of(");
            while (at >= 0) {
                int open = at + "BizEvent.of(".length();
                if (text.charAt(open) != '"') {
                    throw new AssertionError(source + " 的事件名不是字面量，目录无法核对：" + text.substring(open, open + 20));
                }
                int nameEnd = text.indexOf('"', open + 1);
                String event = text.substring(open + 1, nameEnd);
                if (!term.find(nameEnd)) {
                    throw new AssertionError(source + " 的 " + event + " 没落到终止方法（emit/warn/error），埋点不会输出");
                }
                int terminal = term.start();
                List<String> keys = new ArrayList<>();
                Matcher put = PUT_KEY.matcher(text.substring(nameEnd, terminal));
                while (put.find()) {
                    keys.add(put.group(1));
                }
                sites.add(new Site(event, keys, MAIN_SOURCE.relativize(path)));
                at = text.indexOf("BizEvent.of(", terminal);
            }
        }
        return sites;
    }

    /** 「## 已有事件目录」表的行：{@code | \`event\` | 必带字段 | 来源 |} */
    private List<DocRow> catalog() throws IOException {
        List<String> lines = Files.readAllLines(catalogDoc());
        List<DocRow> rows = new ArrayList<>();
        boolean inCatalog = false;
        for (String line : lines) {
            if (line.startsWith("## ")) {
                inCatalog = line.startsWith("## 已有事件目录");
                continue;
            }
            // 数据行一律以「反引号包着的事件名」开头：表头（| event |）与分隔行（| --- |）都进不来
            if (!inCatalog || !line.startsWith("| `")) {
                continue;
            }
            String[] cells = line.split("\\|");
            String event = cells[1].replace("`", "").strip();
            String fields = cells[2];
            int optionalAt = fields.indexOf(';');
            rows.add(new DocRow(
                    event,
                    backticked(optionalAt < 0 ? fields : fields.substring(0, optionalAt)),
                    optionalAt < 0 ? List.of() : backticked(fields.substring(optionalAt))));
        }
        return rows;
    }

    private List<String> backticked(String cell) {
        List<String> out = new ArrayList<>();
        Matcher m = BACKTICK.matcher(cell);
        while (m.find()) {
            out.add(m.group(1).strip());
        }
        return out;
    }

    /** 主源码全部 .java，排除事件出口本身 */
    private List<Path> businessSources() throws IOException {
        try (Stream<Path> files = Files.walk(MAIN_SOURCE)) {
            return files.filter(p -> p.toString().endsWith(".java"))
                    .filter(p -> !p.getFileName().toString().equals("BizEvent.java"))
                    .filter(p -> !p.getFileName().toString().equals("MdcScope.java"))
                    .toList();
        }
    }

    /** 业务规则文档：正文里会指名事件的地方 */
    private List<Path> ruleDocs() throws IOException {
        Path dir = catalogDoc().getParent().getParent().resolve("business-rules");
        try (Stream<Path> files = Files.list(dir)) {
            return files.filter(p -> p.toString().endsWith(".md")).toList();
        }
    }

    /** maven 模块根：{@code src/main/java} 往上三级，不押死「cwd 一定是 apps/server」 */
    private Path moduleRoot() {
        return MAIN_SOURCE.getParent().getParent().getParent();
    }

    /** 文档在仓库根：从模块根逐级上溯找，不押死「cwd 一定是 apps/server」 */
    private Path catalogDoc() {
        for (Path dir = moduleRoot(); dir != null; dir = dir.getParent()) {
            Path candidate = dir.resolve(CATALOG_DOC);
            if (Files.exists(candidate)) {
                return candidate;
            }
        }
        throw new UncheckedIOException(new IOException("找不到 " + CATALOG_DOC + "，事件目录门禁无从核对"));
    }
}

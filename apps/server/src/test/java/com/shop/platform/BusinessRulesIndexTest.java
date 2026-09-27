package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.testsupport.SourceScanner;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * 业务规则库索引（{@code docs/business-rules/README.md}）「生效 / 待落地」两列的数字门禁。
 *
 * <p>这张表是规则库唯一的入口，两列写的是<b>条数</b>——也就是说它每隔几条规则就会自己错一次，
 * 而且错的方向是「比实际少」，于是照索引找规则的人会以为库里有空号。起本门禁前，十行里有五行的
 * 生效数长期少于正文实际条数（order / aftersale / product / account / cms 合起来少 9 条）；
 * 文件头那句「改代码里的业务规则时同步改对应条目」提醒过要同步，却没让谁红过一次。
 * 这是 {@link FieldRuleVocabularyTest} 那条判断在文档层的复现：<b>注释里的数字关系只靠散文，等于没有关系</b>。
 *
 * <p>尺子只有一把，写死在本类，规则文件侧不需要配合埋任何标记：
 * <ul>
 *   <li>一条规则 = 一个<b>顶格</b> bullet，编号形如 {@code - **[ORD-12]**}；{@code [CPN-N1]} 这种
 *       已拍板未落地的同形，只是号段带 N 前缀。缩进的子 bullet 是条款续写，不另计。
 *   <li>「待落地」= 落在「已定案未实现」小节里的 bullet。小节按标题级别闭合，所以它在文件中间
 *       也照样数得对——不押死「该节一定在末尾」这个当前成立但没人约束的排版巧合。
 *   <li>两列一起比对、一起报出，一次改动常牵动好几行，一红即停只会让人改一行跑一次。
 * </ul>
 *
 * <p>顺带守住表的另外四个方向：索引覆盖规则目录里每个 {@code .md}（新域文件不得游离）、
 * 每行指向的文件真实存在（删文件不删行就是死链）、编号全库唯一（编号只标首次收录、跨域联动条款
 * 归动作发起方文件，出现两遍等于有人把同一条规则抄了两个家）、散在代码与文档里的编号引用都能落到
 * 某一条上（编号是这座仓库唯一的跨语言外键，合并或改名一条规则时那几百处注释不会自己跟上）。
 *
 * <p>不连库、不起 Spring，纯文本核对，没有本地数据源时它照跑。
 */
class BusinessRulesIndexTest {

    private static final Path INDEX_DOC = Path.of("docs", "business-rules", "README.md");

    /** 顶格规则 bullet：{@code - **[前缀-编号]**} */
    private static final Pattern RULE_BULLET = Pattern.compile("^- \\*\\*\\[([A-Z]+)-(N?\\d+)\\]\\*\\*");

    /** 索引表的数据行，只认第一格里的 {@code [xxx.md](...)} */
    private static final Pattern INDEX_ROW = Pattern.compile("^\\|\\s*\\[([\\w.\\-]+\\.md)\\]\\([^)]*\\)\\s*\\|(.*)$");

    /** 「已定案未实现」小节标题：捕获组 1 是标题级别，用它判定该节在哪一级闭合 */
    private static final Pattern PENDING_HEADING = Pattern.compile("^(#{1,6})\\s.*已定案未实现");

    private static final Pattern HEADING = Pattern.compile("^(#{1,6})\\s");

    /** README 正文里的 markdown 链接目标，用于放行「附属文档（非规则）」那类登记 */
    private static final Pattern MD_LINK = Pattern.compile("\\[[^\\]]*\\]\\(([^)]+\\.md)\\)");

    private static final Path RULES_DIR = rulesDir();

    /** 仓库根：编号引用散布在三端 + 三包 + 后端 + 迁移 + 文档里，核对面是整个仓库 */
    private static final Path REPO_ROOT = RULES_DIR.getParent().getParent();

    private static final String[] TEXT_SUFFIXES = {".java", ".ts", ".tsx", ".md", ".sql", ".mjs"};

    /** 索引表的一行：文件名、前缀列原文、两列声明的条数 */
    private record Row(String file, String prefixes, int effective, int pending) {}

    /** 一个域文件重数出来的结果：全部编号（含待落地节）+ 两列条数 */
    private record Counted(List<String> ids, int effective, int pending) {}

    @Test
    void 生效与待落地两列等于正文重数出来的条数() {
        Map<String, Counted> counted = countAll();
        List<String> drifted = new ArrayList<>();
        for (Row row : readRows()) {
            Counted have = counted.get(row.file());
            if (have.effective() != row.effective()) {
                drifted.add(row.file() + " 生效：索引写 " + row.effective() + "，正文数到 " + have.effective());
            }
            if (have.pending() != row.pending()) {
                drifted.add(row.file() + " 待落地：索引写 " + row.pending() + "，正文数到 " + have.pending());
            }
        }
        assertThat(drifted).as("规则库索引的条数与正文不一致").isEmpty();
    }

    /**
     * 防「两边同时归零」：bullet 形状一旦变，正文会数出 0，若索引也恰好被改成 0 就一路绿下去。
     * 这里要求每个域文件都真数得出东西，且总量落在一个不会是巧合的量级上。
     */
    @Test
    void 每个域文件都数得出规则且总量不是巧合() {
        int total = 0;
        for (Map.Entry<String, Counted> entry : countAll().entrySet()) {
            int bullets = entry.getValue().ids().size();
            assertThat(bullets).as(entry.getKey() + " 一条规则都没数到，多半是 bullet 形状变了").isPositive();
            total += bullets;
        }
        assertThat(total).as("全库规则总条数：低于此值即解析面塌陷").isGreaterThan(300);
    }

    /** 编号只标首次收录，跨域联动条款归动作发起方文件，所以同一个编号不该有两处正文。 */
    @Test
    void 规则编号在全库唯一() {
        Map<String, String> home = new LinkedHashMap<>();
        List<String> duplicated = new ArrayList<>();
        countAll().forEach((file, counted) -> {
            for (String id : counted.ids()) {
                String previous = home.putIfAbsent(id, file);
                if (previous != null) {
                    duplicated.add(id + " 同时出现在 " + previous + " 与 " + file);
                }
            }
        });
        assertThat(duplicated).as("规则编号重复").isEmpty();
    }

    /**
     * 前缀列要盖住正文真在用的编号。写了「等」的域（cms：CMS / NAV / REC / FED / FUT / WEB / ADM / BAN）
     * 明确放弃这项核对，其余逐个对上——新增一条别的编号而索引没登记，就该在这里被看见。
     */
    @Test
    void 前缀列覆盖正文实际用到的前缀() {
        Map<String, Counted> counted = countAll();
        List<String> missing = new ArrayList<>();
        for (Row row : readRows()) {
            if (row.prefixes().contains("等")) {
                continue;
            }
            Set<String> declared = new LinkedHashSet<>();
            for (String prefix : row.prefixes().split("/")) {
                if (!prefix.isBlank()) {
                    declared.add(prefix.strip());
                }
            }
            Set<String> used = new LinkedHashSet<>();
            for (String id : counted.get(row.file()).ids()) {
                used.add(id.substring(0, id.lastIndexOf('-')));
            }
            used.removeAll(declared);
            if (!used.isEmpty()) {
                missing.add(row.file() + " 用了未声明的前缀 " + used);
            }
        }
        assertThat(missing).as("索引的前缀列漏了正文里真在用的编号前缀").isEmpty();
    }

    /**
     * 代码与文档里点名的规则编号，必须真的能落到规则库某一条上。
     *
     * <p>编号是这座仓库里唯一的跨语言外键：Java 注释、TS 注释、迁移脚本、工单都靠它指回规则。
     * 而「编号只标首次收录、不回收号、不重排」意味着合并或改名一条规则时，散在几百个文件里的引用
     * <b>不会自己更新</b>——那条注释从此指向一个空号，读的人顺着找不到规则，还以为规则被删了。
     * 前缀取自库中已有编号（不取索引的前缀列：cms 那一格写着「CMS 等」，按它扫会漏掉 NAV / REC / FED /
     * FUT / WEB / ADM / BAN 这七个真在用的前缀）。今天全仓 526 个引用编号全部命中，零悬空。
     */
    @Test
    void 引用的编号都能落到规则库某一条() throws IOException {
        Set<String> defined = new LinkedHashSet<>();
        countAll().values().forEach(counted -> defined.addAll(counted.ids()));

        Set<String> prefixes = new LinkedHashSet<>();
        for (String id : defined) {
            prefixes.add(id.substring(0, id.lastIndexOf('-')));
        }
        Pattern citation = Pattern.compile("\\b(" + String.join("|", prefixes) + ")-(\\d{1,3})\\b");

        List<String> dangling = new ArrayList<>();
        walkText(REPO_ROOT, citation, defined, dangling);
        assertThat(dangling).as("引用了规则库里不存在的编号：规则被合并、改名或删除时，注释里的编号不会自己跟上").isEmpty();
    }

    /** 扫全仓文本，把命中不了已有编号的引用连位置一起收集（依赖、产物与生成物目录由扫描器跳过） */
    private void walkText(Path dir, Pattern citation, Set<String> defined, List<String> out) throws IOException {
        for (Path file : SourceScanner.files(dir, TEXT_SUFFIXES)) {
            if (generated(file.getFileName().toString())) {
                continue;
            }
            List<String> lines = SourceScanner.lines(file);
            for (int i = 0; i < lines.size(); i++) {
                Matcher m = citation.matcher(lines.get(i));
                while (m.find()) {
                    String id = m.group(1) + "-" + m.group(2);
                    if (!defined.contains(id)) {
                        out.add(SourceScanner.rel(REPO_ROOT, file) + ":" + (i + 1) + " 引用 " + id);
                    }
                }
            }
        }
    }

    /** 三个 app 的路由树生成物由工具产出，不参与核对（SDK 生成物已经由 {@code sdk} 目录名整棵跳过） */
    private static boolean generated(String name) {
        return name.equals("routeTree.gen.ts");
    }

    /** 每行指向的文件都得在库里：删了规则文件不删索引行，这里立刻红。 */
    @Test
    void 索引指向的文件都存在() {
        List<String> absent = new ArrayList<>();
        for (Row row : readRows()) {
            if (!Files.isRegularFile(RULES_DIR.resolve(row.file()))) {
                absent.add(row.file());
            }
        }
        assertThat(absent).as("索引里有死链").isEmpty();
    }

    /** 目录里的 .md 不许游离：要么进索引表，要么在 README 正文里以链接出现（附属文档）。 */
    @Test
    void 规则目录下没有未登记的游离文件() throws IOException {
        Set<String> indexed = new LinkedHashSet<>();
        readRows().forEach(row -> indexed.add(row.file()));

        Set<String> mentioned = new LinkedHashSet<>();
        for (String line : SourceScanner.lines(RULES_DIR.resolve("README.md"))) {
            Matcher m = MD_LINK.matcher(line);
            while (m.find()) {
                mentioned.add(Path.of(m.group(1)).getFileName().toString());
            }
        }

        List<String> unlisted = new ArrayList<>();
        try (Stream<Path> files = Files.list(RULES_DIR)) {
            files.filter(p -> p.toString().endsWith(".md"))
                    .map(p -> p.getFileName().toString())
                    .filter(name -> !name.equals("README.md"))
                    .filter(name -> !indexed.contains(name))
                    .filter(name -> !mentioned.contains(name))
                    .sorted()
                    .forEach(unlisted::add);
        }
        assertThat(unlisted).as("既不在索引表也不在 README 任何链接里的规则文件，按索引检索的人找不到它").isEmpty();
    }

    /** 索引登记的那些域文件，逐个按本类的尺子重数 */
    private Map<String, Counted> countAll() {
        Map<String, Counted> out = new LinkedHashMap<>();
        for (Row row : readRows()) {
            try {
                out.put(row.file(), countOne(row.file()));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
        return out;
    }

    private Counted countOne(String file) throws IOException {
        List<String> ids = new ArrayList<>();
        int effective = 0;
        int pending = 0;
        int pendingLevel = 0;
        for (String line : SourceScanner.lines(RULES_DIR.resolve(file))) {
            Matcher head = PENDING_HEADING.matcher(line);
            Matcher any = HEADING.matcher(line);
            if (head.find()) {
                pendingLevel = head.group(1).length();
            } else if (any.find() && pendingLevel > 0 && any.group(1).length() <= pendingLevel) {
                pendingLevel = 0;
            }
            Matcher bullet = RULE_BULLET.matcher(line);
            if (bullet.find()) {
                ids.add(bullet.group(1) + "-" + bullet.group(2));
                if (pendingLevel > 0) {
                    pending++;
                } else {
                    effective++;
                }
            }
        }
        return new Counted(ids, effective, pending);
    }

    private List<Row> readRows() {
        List<Row> rows = new ArrayList<>();
        try {
            for (String line : SourceScanner.lines(RULES_DIR.resolve("README.md"))) {
                Matcher row = INDEX_ROW.matcher(line);
                if (!row.matches()) {
                    continue;
                }
                List<String> cells = cellsOf(row.group(2));
                if (cells.size() != 4) {
                    throw new IllegalStateException("索引行「" + row.group(1) + "」不是 4 格（领域 / 前缀 / 生效 / 待落地）：" + line);
                }
                rows.add(new Row(row.group(1), cells.get(1), parseCount(cells.get(2)), parseCount(cells.get(3))));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        assertThat(rows).as("没在 " + INDEX_DOC + " 里找到任何索引行，门禁不能空转").isNotEmpty();
        return rows;
    }

    /** {@code —} 表示该域没有待落地条款，记 0；其余必须是整数——写个「约」进来就是想把门禁糊过去 */
    private static int parseCount(String cell) {
        String text = cell.strip();
        if (text.equals("—") || text.equals("-")) {
            return 0;
        }
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException e) {
            throw new IllegalStateException("索引条数那一格既不是破折号也不是整数：「" + text + "」");
        }
    }

    /** 行首文件名之后的其余格子；末格是行尾 {@code |} 后面的空串，丢掉。 */
    private static List<String> cellsOf(String tail) {
        List<String> cells = new ArrayList<>(List.of(tail.split("\\|", -1)));
        cells.remove(cells.size() - 1);
        cells.replaceAll(String::strip);
        return cells;
    }

    /** 文档在仓库根：从 maven 模块根逐级上溯找，不押死「cwd 一定是 apps/server」 */
    private static Path rulesDir() {
        Path moduleRoot = Path.of("src", "main", "java")
                .toAbsolutePath()
                .normalize()
                .getParent()
                .getParent()
                .getParent();
        for (Path dir = moduleRoot; dir != null; dir = dir.getParent()) {
            Path candidate = dir.resolve(INDEX_DOC);
            if (Files.isRegularFile(candidate)) {
                return candidate.getParent();
            }
        }
        throw new IllegalStateException("找不到 " + INDEX_DOC + "，索引门禁无从核对");
    }
}

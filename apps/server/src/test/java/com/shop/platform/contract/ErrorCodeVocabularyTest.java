package com.shop.platform.contract;

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
 * 错误码词表的单点门禁：一个码在注册表（{@code contracts/error-codes.yaml}）、Java 常量、{@code packages/common}、
 * 前端 catalog（{@code packages/app-kit/src/locales/<locale>/error.json}）四边的值、状态码、
 * 前端落点与那句用户可见文案必须同时成立。
 *
 * <p>code 是这个仓库里<b>唯一没有类型承载</b>的对外词汇：金额有 {@code Money}、手机号有
 * {@code PhoneNumber}、区划码有 {@code RegionRegistry}，而错误码就是一个裸 {@code String} 参数，
 * 从一个 service 方法一路飘到 RFC 9457 响应的扩展属性，再被前端按字符串比对。全链路没有一处会因为
 * 拼错而编译不过、404 不、500 不——它只是让前端那条按码分支静静地永不命中。此前 41 处抛出点散抄 23 个码，
 * 同一个码最多抄了 6 遍（{@code INVALID_TOKEN}）：改一次的名字要记得改六处，忘记任何一处的表现
 * 是「一半的路径还认得这个码」。现在抛出点只引用 {@link ErrorCodes}，字面量在本仓库只住在 owner 里。
 *
 * <p><b>注册表是真相源，两份常量表是它的生成物</b>（{@code pnpm errors:gen}，漂移由 {@code pnpm errors:drift} 拦）。
 * 所以注册表 ⇄ Java 常量那一格是<b>生成关系</b>，不是手抄对账；本类真正的价值在另外三边——生成物可能整体落后，
 * 而 catalog 与前端读点不会因为注册表改了而自己跟上。
 *
 * <p>四边之中只有 Java 常量与 TS 常量是编译期可查的，注册表那两栏与 catalog 那两份 JSON 是散文/数据——
 * 所以本类的重心有三处：
 * <ol>
 *   <li><b>注册表是可 join 的表</b>：{@code status} 与每一处抛出点由出口推出来的状态码逐处相等；
 *       {@code behavior} 的分支前缀（「按码分支」/「不按码分支」）不是注释而是<b>声明</b>，它由生产前端源码里
 *       真实出现的 {@code ErrorCodes.X} 引用反查出来的集合两向核（多一个读点红、少一个也红）。旧文档表的
 *       「前端行为」那一栏有五条写的是愿望，这条判据把它压成了事实；
 *   <li><b>结构性禁令</b>：抛出点的码位只许是 {@code ErrorCodes.X}、{@code null}，或三处登记在案的<b>导管</b>
 *       （{@code Validate.isTrue} 的形参、两个鉴权过滤器手里的 {@code verification.code()}）。
 *       新起一条「码从变量里来」的导管会让白名单等式当场红——那种导管是漂移的温床：静态扫不到，就等于不存在；
 *   <li><b>码有文案</b>：每个 code 在两份语言的 {@code error.json} 里恰有一条 {@code error.<CODE>}
 *       （见 {@link #每个code在两份语言恰有一条error文案()}）。这一格是把用户可见错误句子
 *       归给前端 catalog 之后新增的口子——TS 侧的 {@code satisfies} 只能保证 key 存在，保证不了那条 key
 *       真写着一句话。
 * </ol>
 *
 * <p><b>本类不管日志文本，也不管契约</b>：{@code detail} 文案与日志里的码都不是契约，随便改；
 * 而 code 本身由 {@code GlobalExceptionHandler} 挂成 ProblemDetail 扩展属性，<b>不进</b>
 * {@code openapi/api-docs.json}，所以改码不需要 {@code pnpm sdk:gen}（这与
 * {@link FieldRuleVocabularyTest} 守的那一族数字根本不同——那一族是契约）。
 *
 * <p>无库、不起 Spring：反射读 {@link ErrorCodes}，其余全部是纯文本扫描。
 */
@org.junit.jupiter.api.Tag("contract")
class ErrorCodeVocabularyTest {

    private static final Path MAIN_JAVA = Path.of("src", "main", "java");
    private static final Path REPO_ROOT = Path.of("..", "..");

    /** 唯一真相源：24 张码卡，{@code pnpm errors:gen} 从这里生成 Java 与 TS 两份常量表 */
    private static final Path REGISTRY = REPO_ROOT.resolve(Path.of("contracts", "error-codes.yaml"));

    private static final Path TS_OWNER =
            REPO_ROOT.resolve(Path.of("packages", "common", "src", "contract", "error-codes.ts"));

    /** 用户可见错误文案的落点：两份语言各一份，namespace 由文件名给 */
    private static final List<Path> ERROR_CATALOGS = List.of(
            REPO_ROOT.resolve(Path.of("packages", "app-kit", "src", "locales", "zh-Hans-CN", "error.json")),
            REPO_ROOT.resolve(Path.of("packages", "app-kit", "src", "locales", "en-US", "error.json")));

    /** 生产前端源码目录（错误码的消费侧）；`packages/api` 全是生成物，不在内 */
    private static final List<Path> FRONTEND_SOURCE = List.of(
            REPO_ROOT.resolve(Path.of("apps", "web", "src")),
            REPO_ROOT.resolve(Path.of("apps", "seller", "src")),
            REPO_ROOT.resolve(Path.of("apps", "admin", "src")),
            REPO_ROOT.resolve(Path.of("packages", "common", "src")),
            REPO_ROOT.resolve(Path.of("packages", "i18n", "src")),
            REPO_ROOT.resolve(Path.of("packages", "monitoring", "src")),
            REPO_ROOT.resolve(Path.of("packages", "client", "src")),
            REPO_ROOT.resolve(Path.of("packages", "app-kit", "src")),
            REPO_ROOT.resolve(Path.of("packages", "ui-web", "src")));

    /**
     * 客户端本地失败的词表 owner：断网 / 超时 / 取消 / 响应不合契约。这几个码后端一个都不会发，
     * 抛出点是前端自己（`sdk-client` 的错误拦截器）。
     *
     * <p>此前这里是手写的豁免清单 {@code FRONTEND_ONLY_CODES}，只有一个成员，整份机制为它而存在。
     * 现在改成**从 owner 文件里扫出来**：多一个码不必回来改测试，而「哪些码不是后端发的」也只有一个答案。
     */
    private static final Path CLIENT_FAILURE_OWNER =
            REPO_ROOT.resolve(Path.of("packages", "common", "src", "contract", "client-failure.ts"));

    /**
     * 「这一发没有可用的令牌」那两个码：客户端 401 拦截器**只对带这两个码的响应**做「刷新 + 重放」
     * （`packages/client/src/sdk-client.ts` 的 `isTokenVerdict`）。与前端那份是同一份口径，
     * 两边各写一次是因为跨语言——与 `ValidationRules` 的镜像同一种做法。
     */
    private static final Set<String> TOKEN_VERDICT_CODES = Set.of("TOKEN_EXPIRED", "INVALID_TOKEN");

    /**
     * 码位允许「从变量来」的导管，形如 {@code 文件名 -> 允许的实参表达式}。
     * 这三处是收口本身（{@code Validate} 把形参转交异常、两个过滤器把校验结果里的码转交 writer），
     * 不是漏抄。白名单是等式：多一处（新导管）就红。
     */
    private static final Map<String, String> CODE_PLUMBING = Map.of(
            "Validate.java", "code",
            "JwtAuthFilter.java", "verification.code()",
            "StaffAuthFilter.java", "verification.code()",
            "SubaccountAuthFilter.java", "verification.code()");

    /**
     * 出口的定义处：{@code BusinessException} 的工厂方法。测试<b>不抄</b>「哪个工厂给哪个状态码」，
     * 而是从这些工厂的签名与函数体里读出来（见 {@link #codedFactories()}），并从这两条出口扫描里跳过它自己。
     */
    private static final Path EXCEPTION_OWNER =
            MAIN_JAVA.resolve(Path.of("com", "shop", "platform", "common", "BusinessException.java"));

    private static final Pattern CODE_NAME = Pattern.compile("ErrorCodes\\.([A-Z][A-Z0-9_]+)");
    private static final Pattern CODE_LITERAL = Pattern.compile("\"([A-Z][A-Z0-9_]{3,})\"");
    /**
     * 注册表是 YAML 块序列：每张卡是一段以行首 {@code - } 起始的条目。用它切块，头部注释（不以
     * {@code - } 开头）落进第一段，因没有 {@code code} 键而被跳过。
     */
    private static final Pattern ITEM_START = Pattern.compile("(?m)^-\\s");

    private static final Pattern CARD_CODE = Pattern.compile("(?m)^[ \t]*code:[ \t]*\"?([A-Z][A-Z0-9_]*)\"?[ \t]*$");
    private static final Pattern CARD_STATUS = Pattern.compile("(?m)^[ \t]*status:[ \t]*\"?([0-9]+)\"?[ \t]*$");
    private static final Pattern CARD_BEHAVIOR = Pattern.compile("(?m)^[ \t]*behavior:[ \t]*(.*)$");

    private static final Pattern TS_ENTRY =
            Pattern.compile("^\\s*([A-Z][A-Z0-9_]*)\\s*:\\s*\"([A-Z][A-Z0-9_]*)\"\\s*,?$");
    /**
     * 码在**生产前端**里的落脚点。扫两份词表的引用：`ErrorCodes.X`（后端发的）与
     * `ClientFailureCodes.X`（前端本地失败）——「谁在读」这件事对两份词表是同一个判据：
     * 这个码在仓库里的唯一落脚处。
     */
    private static final Pattern TS_READER = Pattern.compile("(?:ErrorCodes|ClientFailureCodes)\\.([A-Z][A-Z0-9_]+)");

    /** catalog 里的一条错误文案：key 是 {@code error.<CODE>}，值就是那句用户可见的话 */
    private static final Pattern ERROR_KEY =
            Pattern.compile("^\\s*\"error\\.([A-Z][A-Z0-9_]*)\"\\s*:\\s*\"([^\"]*)\"\\s*,?\\s*$");

    /** 一处抛码站点：码、由出口推出的状态码、出处 */
    private record Site(String code, int status, String at) {}

    /** 注册表一张卡：Code、status、behavior（这三栏是可核对的声明，其余是给人读的散文） */
    private record Card(String code, int status, String behavior) {}

    /**
     * behavior 的两个分支前缀：写「按码分支」就得真有读点，写「不按码分支」就不许有。
     * 判据用 {@code startsWith} 而不是 {@code contains}——「不按码分支」里就含着「按码分支」这四个字，
     * contains 会把负声明读成正的。
     */
    private static final String BRANCHES = "按码分支";

    private static final String DOES_NOT_BRANCH = "不按码分支";

    // ---------------------------------------------------------------- 三边集合

    @Test
    void java常量名与值逐字节相同且注册表与ts镜像同一集合() throws Exception {
        Map<String, String> java = javaConstants();
        assertThat(java).as("owner 里一个常量都没有，本测试会空转").isNotEmpty();

        // 1. Java：常量名 == 值（对外那个字符串就是名字，中间不许有翻译）
        for (Map.Entry<String, String> e : java.entrySet()) {
            assertThat(e.getValue()).as("错误码常量的值必须等于它的名字：%s", e.getKey()).isEqualTo(e.getKey());
        }

        List<Card> registry = registryCards();
        Set<String> registryCodes = registry.stream().map(Card::code).collect(Collectors.toCollection(TreeSet::new));
        Set<String> ts = tsCodes();
        Set<String> clientOnly = clientLocalCodes();
        assertThat(clientOnly)
                .as("client-failure.ts 一个码都没扫到——那份词表改名或改形状了，这条等式已经失明")
                .isNotEmpty();

        // 2. Java ⇄ 注册表：生成关系，两向相等（注册表少一条就是 gen 没跑；多一条是有人手改了产物）
        assertThat(registryCodes).as("注册表必须覆盖 Java owner 的每个常量").isEqualTo(new TreeSet<>(java.keySet()));

        // 3. 注册表 ∪ 客户端那份 ⇄ TS 两份词表的并集，双向
        Set<String> expected = new TreeSet<>(registryCodes);
        expected.addAll(clientOnly);
        Set<String> tsAll = new TreeSet<>(ts);
        tsAll.addAll(clientOnly);
        assertThat(tsAll)
                .as("TS 两份词表（error-codes.ts ∪ client-failure.ts）的并集必须等于注册表 ∪ 客户端那份")
                .isEqualTo(expected);
        assertThat(new TreeSet<>(registryCodes)
                        .stream().filter(clientOnly::contains).toList())
                .as("前端自己判定的失败码不许进后端注册表——那会让 Java owner 凭空多出四个常量")
                .isEmpty();
    }

    @Test
    void 每个码都有真实抛出点除登记过的前端独有码() throws Exception {
        Map<String, String> java = javaConstants();
        List<Site> sites = throwSites();
        Set<String> thrown = sites.stream().map(Site::code).collect(Collectors.toCollection(TreeSet::new));

        assertThat(thrown).as("owner 里的每个码都得真的有人抛，否则它就是文档里那条规则的谎言").isEqualTo(new TreeSet<>(java.keySet()));
        Map<String, Set<String>> readers = frontendReaders();
        for (String clientOnly : clientLocalCodes()) {
            assertThat(java).as("客户端本地失败的码不许同时在 Java owner 里有定义").doesNotContainKey(clientOnly);
            assertThat(readers.getOrDefault(clientOnly, Set.of()))
                    .as("客户端本地失败的码必须有真实落脚点（`ClientFailureCodes.X` 出现在生产前端里），否则它是凭空造的词")
                    .isNotEmpty();
        }
    }

    // ---------------------------------------------------------------- 字面量禁令

    @Test
    void 错误码字面量只许住在owner里() throws Exception {
        Set<String> vocabulary = new TreeSet<>(javaConstants().keySet());
        int owned = vocabulary.size();
        vocabulary.addAll(clientLocalCodes());
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
    void 注册表的status与每处抛码站点的状态码逐处相等() throws Exception {
        List<Site> sites = throwSites();
        assertThat(sites).as("一处抛码站点都没扫到，本测试空转").isNotEmpty();
        Map<String, Set<Integer>> byCode = new TreeMap<>();
        for (Site s : sites) {
            byCode.computeIfAbsent(s.code(), k -> new TreeSet<>()).add(s.status());
        }
        List<String> mismatch = new ArrayList<>();
        for (Map.Entry<String, Set<Integer>> e : byCode.entrySet()) {
            int declared = registryCard(e.getKey()).status();
            if (e.getValue().size() > 1) {
                mismatch.add(e.getKey() + " 同一个码在不同出口给出多种状态 " + e.getValue() + "（注册表写的是 " + declared + "）");
                continue;
            }
            int actual = e.getValue().iterator().next();
            if (actual != declared) {
                mismatch.add(
                        e.getKey() + ": 注册表 " + declared + " vs Java " + actual + " @ " + sitesOf(sites, e.getKey()));
            }
        }
        assertThat(mismatch).as("status 栏必须与真实抛出结果一致").isEmpty();
    }

    @Test
    void 校验结果的码只经401出口那条链没有断() throws Exception {
        // Verification.fail 的状态码在注册表里推不出来，所以先钉住那条链：
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
                    .as("拿校验结果的码去写响应，只能是 401，否则注册表那一栏就不成立")
                    .contains("BusinessException.unauthorized(verification.code(),verification.detail())");
        }
        assertThat(readers)
                .as("这条链的端点固定是那三个过滤器（用户链 / 员工链 / 卖家子账号链）")
                .containsExactlyInAnyOrder("JwtAuthFilter.java", "StaffAuthFilter.java", "SubaccountAuthFilter.java");
        for (Site site : throwSites()) {
            if (site.at().contains("BearerTokens")) {
                assertThat(site.status()).as("Verification.fail 的码按 401 入档").isEqualTo(401);
            }
        }
    }

    // ---------------------------------------------------------------- 401 的两类与重放边界

    /**
     * 401 的两类与**重放边界**（客户端那一半在 `packages/client/src/sdk-client.ts` 的
     * {@code isTokenVerdict}，用例在 sdk-client.test.ts）。
     *
     * <p>前端那条 401 拦截器会「刷一次新令牌 → **把原请求重发一次**」。这条行为能成立，靠的是一个
     * 从来没被写下来的前提：**发出 401 的时候，这个请求还没有产生任何副作用**。它对令牌裁决成立
     * （过滤器与参数解析器都在处理器之前），对凭据裁决也成立（登录/改密是在写库之前比对凭据），
     * 但它是**巧合还是契约**，静态上看不出来——所以这里把它钉成一张二分表：
     *
     * <ul>
     *   <li><b>令牌裁决</b>：这个请求没有可用的令牌，换一个新的就能继续 → 必须带
     *       {@code TOKEN_EXPIRED} / {@code INVALID_TOKEN}，客户端据此刷新并重放；
     *   <li><b>凭据裁决</b>：你给的凭据不对，或你压根没资格 → **不得**带这两个码。带了的表现是
     *       客户端白刷一次令牌、再把那次写请求重发一遍（改密输错当前密码就是现成的反例）。
     * </ul>
     *
     * <p>此前这条判据不存在，客户端的判据是「状态码是不是 401」——于是每一个 401 都是令牌裁决。
     * 诚实边界：本门禁认的是**文件**，不是「副作用之后」；某个登记在册的文件里新写一处
     * 「先写库再 401」，静态看不出来，仍由 code review 维持（与 {@code OwnershipDoorTest} 同一种边界）。
     */
    @Test
    void 重放边界_401的两类按文件登记且码位相符() throws Exception {
        Set<String> tokenVerdict = Set.of(
                "BearerTokens.java",
                "JwtAuthFilter.java",
                "StaffAuthFilter.java",
                "SubaccountAuthFilter.java",
                "RefreshCookies.java");
        Set<String> credential = Set.of(
                "AuthService.java",
                "StaffService.java",
                "SubaccountService.java",
                "RefreshTokenStore.java",
                "CurrentUserArgumentResolver.java",
                "CurrentStaffArgumentResolver.java",
                "CurrentSubaccountArgumentResolver.java",
                "CurrentOperatorArgumentResolver.java");

        List<String> offenders = new ArrayList<>();
        Set<String> seen = new TreeSet<>();
        for (Path file : mainSources()) {
            String name = file.getFileName().toString();
            for (Call call : calls(file)) {
                // 401 有两种出口形状：过滤器 / 参数解析器直接抛 BusinessException.unauthorized，
                // 以及 BearerTokens 把裁决结果交给 Verification（由两个过滤器转成 401）。
                // 只认前者会把 BearerTokens 漏出扫描面，而它正是令牌裁决码的产地。
                if (!"BusinessException.unauthorized".equals(call.outlet())
                        && !"Verification.fail".equals(call.outlet())) {
                    continue;
                }
                seen.add(name);
                String arg = call.codeArg();
                String code = arg == null ? null : matcher(CODE_NAME, arg);
                // 码从变量来的**登记过的导管**：两个过滤器手里的 verification.code()。它的取值域由
                // BearerTokens 里的常量钉住（本类相邻那条「校验结果的码只经401出口那条链没有断」），
                // 这里按令牌裁决认——不认的话这条门禁会把两个过滤器本身判红。
                boolean plumbing = "verification.code()".equals(arg);
                boolean verdict = plumbing || (code != null && TOKEN_VERDICT_CODES.contains(code));
                if (tokenVerdict.contains(name)) {
                    if (!verdict) {
                        offenders.add(rel(file) + ":" + call.line()
                                + " 令牌裁决必须带 TOKEN_EXPIRED / INVALID_TOKEN——客户端按这个码决定要不要刷新重放，"
                                + "没有码它就只能放弃（而「请求抢在 bootstrapAuth 之前发出」正是要刷一次的那种）");
                    }
                } else if (credential.contains(name)) {
                    if (verdict) {
                        offenders.add(rel(file) + ":" + call.line()
                                + " 凭据裁决不得带令牌裁决码——客户端会因此白刷一次令牌，"
                                + "并把这次请求重发一遍，而重放的合法性建立在「401 时还没有副作用」上");
                    }
                } else {
                    offenders.add(rel(file) + ":" + call.line()
                            + " 这个文件不在两张登记表里：新增 401 出口要先想清楚它属于哪一类再登记，"
                            + "「顺手也报个 401」会让上面那条重放前提悄悄失效");
                }
            }
        }
        assertThat(offenders).as("401 的两类必须按文件登记，且码要与之相符").isEmpty();
        Set<String> registered = new TreeSet<>(tokenVerdict);
        registered.addAll(credential);
        assertThat(seen).as("两向相等：登记了却不再抛 401 的文件是过期白名单，得删").isEqualTo(registered);
    }

    // ---------------------------------------------------------------- behavior 的分支声明

    /**
     * 「前端拿这个码干什么」与「前端真的按它分支了吗」两向核。
     *
     * <p>旧文档表的「谁在读」列同时是<b>声明</b>和<b>扫描结果</b>：列里手抄着文件名，判据又写着
     * 「不是谁写的声明」。这份自我矛盾的结果是那五条愿望式「前端行为」——文件路径抄得对，动作不存在。
     * 现在声明收进注册表的 {@code behavior} 前缀（一个布尔），路径清单整体删掉：
     * 扫描结果不需要人回写，声明不需要人维护清单。
     */
    @Test
    void behavior的分支声明是前端扫描结果不是愿望() throws Exception {
        Map<String, Set<String>> readers = frontendReaders();
        List<String> drift = new ArrayList<>();
        int claimed = 0;
        for (Card card : registryCards()) {
            Boolean declares = branchClaim(card);
            if (declares == null) {
                drift.add(card.code() + ": behavior 没写分支声明（必须以「" + BRANCHES + "」或「" + DOES_NOT_BRANCH
                        + "」开头）——这句是可核对的声明，不是给人读的注释");
                continue;
            }
            Set<String> actual = readers.getOrDefault(card.code(), Set.of());
            if (declares != !actual.isEmpty()) {
                drift.add(card.code() + ": 声明 " + (declares ? BRANCHES : DOES_NOT_BRANCH) + " vs 实际读点 " + actual);
            }
            if (declares) {
                claimed++;
            }
        }
        assertThat(drift).as("分支声明两向都要相等：新增了按码分支的地方得回写注册表，注册表说按码分支却扫不到读点就是那条旧病").isEmpty();
        assertThat(claimed).as("把声明全写成「不按码分支」会让本测试空转：真实按码分支的码远多于此").isGreaterThanOrEqualTo(8);
    }

    @Test
    void 前端只读注册表里登记的码() throws Exception {
        Set<String> registryCodes =
                registryCards().stream().map(Card::code).collect(Collectors.toCollection(TreeSet::new));
        registryCodes.addAll(clientLocalCodes());
        Set<String> read = new TreeSet<>(frontendReaders().keySet());
        assertThat(read).as("前端按一个注册表没有的码分支，等于凭空造词").isSubsetOf(registryCodes);
        assertThat(read).as("前端一处都没读码，扫描大概是空转").isNotEmpty();
    }

    // ---------------------------------------------------------------- 错误文案 catalog

    /**
     * 反向核对：注册表与客户端那份词表的
     * 每个 code 在前端 catalog 里<b>有且只有一条</b> {@code error.<CODE>}，两份语言都要有，值不许是空串。
     *
     * <p>过去这三边只核到「码本身」，文案那一格没人管——于是「加了码忘了加文案」是一种
     * <b>没有任何东西会报错</b>的漏法：前端 TS 侧的 {@code error-keys.ts} 用
     * {@code satisfies Record<code, AppKitMessageKey>} 挡住了「有码无 key」，但 key 指向的 JSON
     * 条目是不是真写着句子，类型系统看不见（{@code import.meta.glob} 不读内容）。
     * 反过来 catalog 里多出一条词表没有的 {@code error.X}，也只有这里能看见——那条会静静地
     * 进每一条 bundle 与 key 联合。
     *
     * <p>按行扫而不是解析 JSON：本类是纯文本门禁（无库、不起 Spring、不引 Jackson），
     * 与读注册表同一把尺子。
     */
    @Test
    void 每个code在两份语言恰有一条error文案() throws Exception {
        Set<String> catalogCodes =
                registryCards().stream().map(Card::code).collect(Collectors.toCollection(TreeSet::new));
        catalogCodes.addAll(clientLocalCodes());
        assertThat(catalogCodes).as("注册表 + 客户端那份空了，本测试空转").isNotEmpty();

        for (Path file : ERROR_CATALOGS) {
            List<String> keys = new ArrayList<>();
            List<String> blank = new ArrayList<>();
            for (String line : read(file)) {
                Matcher m = ERROR_KEY.matcher(line);
                if (!m.find()) {
                    continue;
                }
                keys.add(m.group(1));
                if (m.group(2).isBlank()) {
                    blank.add(m.group(1));
                }
            }
            Set<String> unique = new TreeSet<>(keys);
            assertThat(keys).as(rel(file) + " 有重复的 error.<CODE> 条目").doesNotHaveDuplicates();
            assertThat(blank).as(rel(file) + " 这些 code 的文案是空串").isEmpty();
            assertThat(unique)
                    .as(rel(file) + " 与注册表 ∪ 客户端那份词表必须两向相等：少一条是「加了码忘了加文案」，多一条是凭空造文案")
                    .isEqualTo(catalogCodes);
        }
    }

    // ---------------------------------------------------------------- 词汇表规模

    @Test
    void 词汇表规模不退坡() throws Exception {
        // 删码是接口变更：状态码与 detail 还在，只有前端那条分支会静静地永不命中。
        assertThat(javaConstants()).as("Java owner 的码数").hasSizeGreaterThanOrEqualTo(23);
        assertThat(registryCards()).as("注册表的卡数").hasSizeGreaterThanOrEqualTo(24);
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

    /**
     * 解析注册表的码卡。不引 YAML/JS 引擎也不 eval：本类是纯文本门禁，且要的只有三栏。
     *
     * <p>注册表是 YAML 块序列：每张卡一段、以行首 {@code - } 起始，按此切块——头部注释（不以 {@code - }
     * 开头）落进第一段、因没有 {@code code} 键而被跳过。当前值是 YAML 判定安全后省略引号的单行 plain
     * 标量；{@link #scalar} 顺手剥可选的一层引号并反解转义，序列化器哪天改主意也不会读歪。
     */
    private static List<Card> registryCards() throws IOException {
        String source = String.join("\n", read(REGISTRY));
        List<Card> cards = new ArrayList<>();
        for (String item : ITEM_START.split(source)) {
            String code = matcher(CARD_CODE, item);
            if (code == null) {
                continue;
            }
            String status = matcher(CARD_STATUS, item);
            String behavior = matcher(CARD_BEHAVIOR, item);
            assertThat(status).as("%s 没有 status（必填：它是 HTTP 与抛码站点那条等式的左边）", code).isNotNull();
            assertThat(behavior).as("%s 没有 behavior（必填：这句是分支声明，不是注释）", code).isNotNull();
            cards.add(new Card(code, Integer.parseInt(status), scalar(behavior)));
        }
        assertThat(cards).as("注册表解析出 0 张卡——多半是 YAML 换形状了").isNotEmpty();
        return cards;
    }

    /** 行为前缀 → 这条码是否按码分支；两个前缀都没写就返回 null（调用方按漂移处理，不在这里抛） */
    private static Boolean branchClaim(Card card) {
        if (card.behavior().startsWith(DOES_NOT_BRANCH)) {
            return false;
        }
        if (card.behavior().startsWith(BRANCHES)) {
            return true;
        }
        return null;
    }

    /** 剥掉 YAML 标量可选的一层双引号；带引号时反解 {@code \"} / {@code \\} 转义（值当前无引号，走原样返回） */
    private static String scalar(String value) {
        String trimmed = value.trim();
        if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
            return trimmed.substring(1, trimmed.length() - 1)
                    .replace("\\\"", "\"")
                    .replace("\\\\", "\\");
        }
        return trimmed;
    }

    private static Card registryCard(String code) throws IOException {
        return registryCards().stream()
                .filter(c -> c.code().equals(code))
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "contracts/error-codes.yaml 里没有 " + code + "（前端读了注册表没登记的码，或 Java 抛了一个没登记的码）"));
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

    /**
     * 客户端本地失败那四个码，从 owner 文件扫出来（与 {@link #tsCodes} 同一把尺子）。
     *
     * <p>扫而不是手写清单：清单只有一行内容时，「加一个码」要改的是一份不属于它的事实；
     * 扫完之后这份集合与 TS 那份词表同源，不可能对不上。
     */
    private static Set<String> clientLocalCodes() throws IOException {
        Set<String> out = new TreeSet<>();
        for (String line : read(CLIENT_FAILURE_OWNER)) {
            Matcher m = TS_ENTRY.matcher(line);
            if (m.find()) {
                assertThat(m.group(2)).as("client-failure.ts 里每个键的值必须等于键本身").isEqualTo(m.group(1));
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
        // 声明文件的判据是那个点：写成 endsWith("d.ts") 会把 card.ts / forbidden-word.ts 这类
        // 以 d 结尾的**源码**一起排掉，且排得无声无息（扫描少了文件不会报错，只会让门禁变松）
        return fileName.contains(".test.") || fileName.contains(".gen.") || fileName.endsWith(".d.ts");
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
                        // badRequest / forbidden / conflict：第 0 参是码，末参多少由工厂册内决定（带 errors 明细的那族也在这条）
                        default -> args.size() >= 2 ? args.get(0) : null;
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
     * {@code (String code, String detail)} 且函数体是 {@code new BusinessException(INT, code, detail)}；
     * 再带一格字段级明细的 {@code (String code, String detail, List errors)} 同族（码位与状态码的来源一样，
     * 多出去的那参是 COM-01 的参数通道）。
     * 状态码因此不是测试里抄的一张表——工厂改状态，文档那一列就得跟着改，否则「逐处相等」那条红。
     */
    private static Map<String, Integer> codedFactories() throws IOException {
        Matcher m = Pattern.compile("publicstaticBusinessException(\\w+)\\(Stringcode,Stringdetail"
                        + "(?:,(?:List<Map<String,String>>|Map<String,\\?>)\\w+)?\\)"
                        + "\\{returnnewBusinessException\\((\\d+),code,detail(?:,(?:errors|null,\\w+))?\\);")
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
        // 这正当；「又带 code 又带 errors 明细」「又带 code 又带 params」的第三种签名已经落地（COM-01 违禁词、
        // 两条地址上限码），它们算带码族的一格——codedFactories 认它们，所以真要找的是第四种形状（码不在第 0 参、
        // 或状态码不从 new 那一行出来），它两族都进不去。
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

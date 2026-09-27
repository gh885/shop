package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.account.model.StaffRole;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.web.RequestPaths;
import com.shop.platform.shop.service.SellerGrants;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
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
 * 权限码词汇表门禁（无库、不起 Spring）：一份码名一个 owner，其余各处只许引用。
 *
 * <p>权限码与错误码同罪：写错的代价不是报错，而是「那道判权静默换了一个形状」——注解里少写一个字母，
 * 请求照样 200/403，只是再没人要求那个岗位了。细则见 docs/conventions/permission-codes.md 与 GEN-63。
 *
 * <p>本门禁核对五件事，全部是等式或结构禁令，不是登记表：
 * <ol>
 *   <li>{@link Permissions} 的常量名与值逐字节相同（值 == 名 ⇒ 「改常量名不动值」这种半改当场红）；
 *   <li>本文档那张表 ⇄ Java 常量 ⇄ {@link Permissions#all()} 同一集合，且「授予」「消费端点」两列
 *       分别由 {@link StaffRole} / {@link SellerGrants} 与注解扫描**推出来**，不是谁抄谁；
 *   <li>结构禁令：字面量只许住在 owner 里，注解码位只许是 {@code Permissions.X}；
 *   <li>命名空间守卫只有一处定义（清单 + 判定都在 {@link RequestPaths}），并且匿名白名单与它在真实路由上
 *       不分歧——落在缝里的路由等于「匿名且无判权」；
 *   <li>受保护命名空间的每条路由都声明了权限码（静态版启动自检，没有库也仍在跑）。
 * </ol>
 */
class PermissionVocabularyTest {

    private static final Path MAIN_JAVA = Path.of("src", "main", "java");
    private static final Path REPO_ROOT = Path.of("..", "..");
    private static final Path DOC = REPO_ROOT.resolve(Path.of("docs", "conventions", "permission-codes.md"));
    private static final Path CONTRACT = REPO_ROOT.resolve(Path.of("openapi", "api-docs.json"));
    private static final Path PERMISSIONS_OWNER =
            MAIN_JAVA.resolve(Path.of("com", "shop", "platform", "common", "Permissions.java"));
    private static final Path REQUEST_PATHS_OWNER =
            MAIN_JAVA.resolve(Path.of("com", "shop", "platform", "infra", "web", "RequestPaths.java"));
    private static final Path JWT_PROPERTIES =
            MAIN_JAVA.resolve(Path.of("com", "shop", "platform", "infra", "security", "JwtProperties.java"));

    /** 只有文档登记、无 Java 常量也无挂点的占位码（OWNER 固有能力，故意不入可授予集合） */
    private static final Set<String> DOC_ONLY_CODES = Set.of("MEMBER_MANAGE", "SHOP_MANAGE");

    /** 没有任何岗位授予、只有 SUPER_ADMIN 通配可达的码 */
    private static final Set<String> WILDCARD_ONLY_CODES = Set.of("STAFF_MANAGE");

    /** 前端权限码唯一 owner；其余前端源码只许引用这里的值。 */
    private static final Path FRONTEND_PERMISSION_OWNER =
            REPO_ROOT.resolve(Path.of("packages", "common", "src", "permission-codes.ts"));

    /** 已在 packages/common 建 owner 的权限码；新增消费点时两向核对。 */
    private static final Set<String> FRONTEND_PERMISSION_CODES =
            Set.of("STAFF_MANAGE", "COUPON_OPS", "AUDIT_VIEW", "SHOP_GOVERNANCE", "LOGISTICS_MANAGE");

    /** 前端源码目录：权限码字面量只许住在 FRONTEND_PERMISSION_OWNER。 */
    private static final List<Path> FRONTEND_SOURCE = List.of(
            REPO_ROOT.resolve("apps/web/src"),
            REPO_ROOT.resolve("apps/seller/src"),
            REPO_ROOT.resolve("apps/admin/src"),
            REPO_ROOT.resolve("packages/common/src"),
            REPO_ROOT.resolve("packages/app-kit/src"),
            REPO_ROOT.resolve("packages/ui-web/src"));

    private static final Pattern CODE_SHAPE = Pattern.compile("^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$");
    private static final Pattern CODE_IN_BACKTICKS = Pattern.compile("`([A-Z][A-Z0-9_]+)`");
    private static final Pattern QUOTED = Pattern.compile("\"([^\"]*)\"");
    private static final Pattern DECLARATION = Pattern.compile("@RequestMapping\\(\\s*\"([^\"]*)\"\\)"
            + "|@RequirePermission\\(\\s*\\{?([^)]*?)\\}?\\s*\\)"
            + "|@(?:Get|Post|Put|Patch|Delete)Mapping\\b(?:\\(\\s*(?:value\\s*=\\s*)?\"([^\"]*)\"\\s*\\))?");
    private static final Pattern PERMISSIONS_REF = Pattern.compile("Permissions\\.([A-Z][A-Z0-9_]+)");
    private static final Pattern SKIP_LIST =
            Pattern.compile("skipPaths\\s*=\\s*List\\.of\\(([^)]*)\\)", Pattern.DOTALL);
    private static final Pattern CLASS_NAME = Pattern.compile("\\bclass\\s+(\\w+)");

    /** 一条真实路由：命名空间守卫与自检测试共用的最小事实 */
    private record Route(String path, String controller, boolean declared) {}

    /** 权限码挂点：注解所在文件（按控制器类名报告） */
    private record Site(String code, String controller, String at) {}

    private record DocRow(String domain, String code, Set<String> grant, Set<String> consumers) {}

    @Test
    void 权限码常量名与值逐字节相同且形状为SCREAMING_SNAKE() throws Exception {
        Map<String, String> constants = constants();
        assertThat(constants).as("owner 里的码量不退坡").hasSizeGreaterThanOrEqualTo(10);
        for (Map.Entry<String, String> each : constants.entrySet()) {
            assertThat(each.getValue()).as("常量名与值必须同字（%s）", each.getKey()).isEqualTo(each.getKey());
            assertThat(each.getKey()).as("形状：%s", each.getKey()).matches(CODE_SHAPE);
        }
    }

    @Test
    void 全量清单与常量集合相等且通配展开不引入新码() throws Exception {
        Set<String> declared = new LinkedHashSet<>(constants().keySet());
        List<String> all = Permissions.all();

        assertThat(new LinkedHashSet<>(all))
                .as("all() 与常量同一集合（漏一格 = 超管的 me 出参少一码）")
                .containsExactlyInAnyOrderElementsOf(declared);
        assertThat(all).as("all() 不得有重复码").hasSameSizeAs(declared);
        assertThat(StaffRole.SUPER_ADMIN.declaredPermissions())
                .as("SUPER_ADMIN 展开通配的结果就是 all()")
                .containsExactlyInAnyOrderElementsOf(declared);
        for (StaffRole role : StaffRole.values()) {
            if (role == StaffRole.SUPER_ADMIN) {
                continue;
            }
            assertThat(role.permissions()).as("%s 授予的码都在 owner 里", role).allMatch(declared::contains);
        }
    }

    @Test
    void 权限码字面量只许住在owner里() throws Exception {
        Set<String> declared = constants().keySet();
        Map<String, Integer> inOwner = new LinkedHashMap<>();
        List<String> copies = new ArrayList<>();

        for (Path file : mainJavaFiles()) {
            String stripped = withoutComments(read(file));
            for (String literal : quotedLiterals(stripped)) {
                if (!declared.contains(literal)) {
                    continue;
                }
                if (FILE_OWNER.equals(rel(file))) {
                    inOwner.merge(literal, 1, Integer::sum);
                } else {
                    copies.add(rel(file) + " → \"" + literal + "\"");
                }
            }
        }

        assertThat(copies).as("判权码被抄第二遍：注解改字面量等于把那道判权换个名字继续跑").isEmpty();
        // 反证不空转：owner 里每个码都真的以字面量存在，扫描才不会是哑弹
        assertThat(inOwner).as("owner 里每个码各出现一次字面量").hasSize(declared.size());
        assertThat(inOwner.values()).as("owner 不重复登记同一个码").allMatch(count -> count == 1);
    }

    @Test
    void RequirePermission的码位只许是Permissions常量且每码都有挂点() throws Exception {
        List<Site> sites = sites();
        Map<String, String> declared = constants();
        List<String> literals = new ArrayList<>();
        List<String> unknown = new ArrayList<>();

        for (Site site : sites) {
            if (site.code.startsWith("\"")) {
                literals.add(site.at);
            } else if (!declared.containsKey(site.code)) {
                unknown.add(site.at + " → " + site.code);
            }
        }

        assertThat(literals).as("@RequirePermission 里写字符串字面量 = 绕过 owner").isEmpty();
        assertThat(unknown).as("注解引用了 owner 里没有的码").isEmpty();
        assertThat(sites).as("挂点规模不退坡").hasSizeGreaterThanOrEqualTo(16);

        Set<String> referenced = new LinkedHashSet<>();
        for (Site site : sites) {
            referenced.add(site.code());
        }
        assertThat(referenced)
                .as("每个码都真的挂在某个端点上（无挂点的码 = 只有通配能命中的死码）")
                .containsExactlyInAnyOrderElementsOf(declared.keySet());
    }

    @Test
    void 文档表与Java常量双向相等除登记过的占位码() throws Exception {
        List<DocRow> rows = docRows();
        Set<String> inDoc = new LinkedHashSet<>();
        for (DocRow row : rows) {
            assertThat(inDoc.add(row.code())).as("文档表里 %s 出现两次", row.code()).isTrue();
        }
        Set<String> declared = new LinkedHashSet<>(constants().keySet());

        assertThat(inDoc)
                .as("文档表 = Java 常量 ∪ 占位码")
                .containsExactlyInAnyOrderElementsOf(union(declared, DOC_ONLY_CODES));
        assertThat(rows).as("表规模不退坡：10 个消费码 + 2 个占位").hasSizeGreaterThanOrEqualTo(12);

        List<String> placeholders = new ArrayList<>();
        for (DocRow row : rows) {
            if (DOC_ONLY_CODES.contains(row.code())) {
                placeholders.add(row.code());
                assertThat(row.grant()).as("%s 是占位行", row.code()).containsExactly("预留未消费");
                assertThat(row.consumers()).as("%s 无挂点", row.code()).isEmpty();
                assertThat(row.domain()).as("%s 属卖家域", row.code()).isEqualTo("seller");
            }
        }
        assertThat(placeholders)
                .as("占位行登记成等式：新增一行「文档说有、代码没有」必须同时进 DOC_ONLY_CODES")
                .containsExactlyInAnyOrderElementsOf(DOC_ONLY_CODES);

        List<String> referenced = new ArrayList<>();
        for (Path file : mainJavaFiles()) {
            for (String literal : quotedLiterals(withoutComments(read(file)))) {
                if (DOC_ONLY_CODES.contains(literal)) {
                    referenced.add(rel(file) + " → \"" + literal + "\"");
                }
            }
        }
        assertThat(referenced).as("占位码只活在文档里：Java 侧一旦被引用，它就该有常量并进门禁等式").isEmpty();
    }

    @Test
    void 授予列由岗位映射与卖家白名单推出() throws Exception {
        for (DocRow row : docRows()) {
            if (DOC_ONLY_CODES.contains(row.code())) {
                continue;
            }
            assertThat(row.grant()).as("%s 的「授予」这一格", row.code()).isEqualTo(grantedFromCode(row.code()));
            assertThat(row.domain())
                    .as("%s 的域与是否可授予子账号一致", row.code())
                    .isEqualTo(SellerGrants.GRANTABLE.contains(row.code()) ? "seller" : "admin");
        }
    }

    @Test
    void 消费端点列是扫描结果不是声明() throws Exception {
        Map<String, Set<String>> scanned = new LinkedHashMap<>();
        for (Site site : sites()) {
            scanned.computeIfAbsent(site.code(), key -> new LinkedHashSet<>()).add(site.controller());
        }

        for (DocRow row : docRows()) {
            Set<String> expected = scanned.getOrDefault(row.code(), Set.of());
            assertThat(row.consumers()).as("%s 的「消费端点」这一格", row.code()).isEqualTo(expected);
        }
        // 每一处挂点都必须在表上现身：挂错码、或借用别的域的码（历史上券运营借过 CMS_MANAGE，
        // 现改挂 COUPON_OPS）都会在这一格里露出来——散文可以撒谎，扫描结果不行
        assertThat(scanned.values().stream().mapToInt(Set::size).sum())
                .as("表上出现的控制器数 = 扫描出的挂点数")
                .isEqualTo(sites().size());
    }

    @Test
    void 岗位映射不退坡且只有通配可达的码登记为等式() throws Exception {
        Set<String> grantedSomewhere = new LinkedHashSet<>();
        for (StaffRole role : List.of(StaffRole.REVIEWER, StaffRole.OPS)) {
            assertThat(role.permissions()).as("%s 至少授予一个码（空岗位是废岗位）", role).isNotEmpty();
            grantedSomewhere.addAll(role.permissions());
        }
        grantedSomewhere.addAll(SellerGrants.GRANTABLE);

        Set<String> wildcardOnly = new LinkedHashSet<>(constants().keySet());
        wildcardOnly.removeAll(grantedSomewhere);

        assertThat(wildcardOnly)
                .as("既无岗位授予、也不可授予子账号的码 = 只有 SUPER_ADMIN 通配可达，新增必须登记理由")
                .containsExactlyInAnyOrderElementsOf(WILDCARD_ONLY_CODES);
        assertThat(SellerGrants.GRANTABLE)
                .as("可授予白名单就是那五个卖家侧码（OWNER 固有码不入集合，防自我繁殖）")
                .containsExactlyInAnyOrder(
                        Permissions.PRODUCT_MANAGE,
                        Permissions.ORDER_FULFILL,
                        Permissions.ADDRESS_MANAGE,
                        Permissions.SHIPPING_MANAGE,
                        Permissions.COUPON_MANAGE);
    }

    @Test
    void 命名空间守卫只有一处定义() throws Exception {
        assertThat(RequestPaths.GUARDED_NAMESPACES)
                .as("受保护命名空间清单（新增一项 = 判权与自检同时扩容）")
                .containsExactly("/admin", "/seller");
        assertThat(RequestPaths.ADMIN_SELF_SERVICE_PREFIX)
                .as("自服务豁免由管理端命名空间拼出，不另抄一个前缀")
                .isEqualTo(RequestPaths.ADMIN_NAMESPACE + "/auth/");

        List<String> secondGuardList = new ArrayList<>();
        List<String> secondPredicate = new ArrayList<>();
        for (Path file : mainJavaFiles()) {
            String at = rel(file);
            String stripped = withoutComments(read(file));
            if (FILE_REQUEST_PATHS.equals(at)) {
                continue;
            }
            for (String line : stripped.lines().toList()) {
                // 自己再立一份前缀清单：判权扩容时这份不会跟着长
                if (line.contains("List.of(\"/") || line.contains("Set.of(\"/")) {
                    secondGuardList.add(at);
                }
                // 命名空间名抄第二遍：路由注解里的值是路由声明，别处的字面量是复制
                boolean routeDeclaration = line.contains("Mapping(");
                if (!routeDeclaration) {
                    for (String literal : quotedLiterals(line)) {
                        if (literal.startsWith("/admin") || literal.startsWith("/seller")) {
                            secondPredicate.add(at + " → \"" + literal + "\"");
                        }
                    }
                }
                if (line.contains("inNamespace(\"")) {
                    secondPredicate.add(at + " → inNamespace 的第二参写成了字面量");
                }
            }
        }

        assertThat(secondGuardList).as("第二份命名空间清单（清单只许住在 RequestPaths）").isEmpty();
        assertThat(secondPredicate)
                .as("命名空间字面量只许住在 RequestPaths 与 @RequestMapping 路由值里")
                .isEmpty();
    }

    @Test
    void 路由注解里的命名空间仍允许字面量() throws Exception {
        // 上一条禁令的尺度证明：控制器确实写了字面量路由，扫描没有把整条命名空间判成违规
        List<String> mapped = new ArrayList<>();
        for (Path file : mainJavaFiles()) {
            String stripped = withoutComments(read(file));
            for (String line : stripped.lines().toList()) {
                if (!line.contains("@RequestMapping(")) {
                    continue;
                }
                for (String literal : quotedLiterals(line)) {
                    if (literal.startsWith("/admin") || literal.startsWith("/seller")) {
                        mapped.add(literal);
                    }
                }
            }
        }
        assertThat(mapped).as("控制器上的命名空间路由声明（禁令的放行侧样本）").hasSizeGreaterThanOrEqualTo(10);
    }

    @Test
    void 匿名白名单与命名空间守卫在真实路由上不分歧() throws Exception {
        List<String> skip = skipPaths();
        List<Route> routes = routes();
        List<String> seam = new ArrayList<>();

        for (Route route : routes) {
            for (String prefix : skip) {
                // startsWith 命中而命名空间不命中 = 该路由被当成匿名，而判权不认它属于受保护命名空间
                if (route.path().startsWith(prefix) && !RequestPaths.inNamespace(route.path(), prefix)) {
                    seam.add(route.controller() + " " + route.path() + " 落在 \"" + prefix + "\" 的前缀缝里");
                }
            }
        }

        assertThat(seam).as("匿名白名单按前缀匹配、判权按命名空间匹配，缝里的路由既无认证也无判权").isEmpty();
        assertThat(routes).as("路由清单规模不退坡").hasSizeGreaterThanOrEqualTo(100);
    }

    @Test
    void 受保护命名空间的每条路由都声明了权限注解() throws Exception {
        List<Route> guarded = new ArrayList<>();
        List<String> missing = new ArrayList<>();
        for (Route route : routes()) {
            if (!RequestPaths.inGuardedNamespace(route.path()) || RequestPaths.isAdminSelfService(route.path())) {
                continue;
            }
            guarded.add(route);
            if (!route.declared()) {
                missing.add(route.controller() + " " + route.path());
            }
        }

        assertThat(guarded).as("受保护路由清单非空（空清单会让下面那条断言空转）").hasSizeGreaterThanOrEqualTo(30);
        assertThat(missing).as("受保护命名空间里缺 @RequirePermission 的路由（静态版启动自检）").isEmpty();
    }

    @Test
    void 权限码不进契约也不在前端各写一份() throws Exception {
        Set<String> declared = union(constants().keySet(), DOC_ONLY_CODES);
        String contract = Files.readString(CONTRACT);
        List<String> inContract = new ArrayList<>();
        for (String code : declared) {
            if (contract.contains(code)) {
                inContract.add(code);
            }
        }
        assertThat(inContract)
                .as("权限码不出现在 openapi 契约里（与错误码同罪但都不进契约），改它不需要 gen:sdk")
                .isEmpty();

        List<String> inFrontend = new ArrayList<>();
        for (Path dir : FRONTEND_SOURCE) {
            if (!Files.isDirectory(dir)) {
                continue;
            }
            try (Stream<Path> walk = Files.walk(dir)) {
                for (Path file : walk.filter(p ->
                                p.toString().endsWith(".ts") || p.toString().endsWith(".tsx"))
                        .filter(p -> !p.getFileName().toString().contains(".test."))
                        .filter(p -> !p.equals(FRONTEND_PERMISSION_OWNER))
                        .toList()) {
                    for (String literal : quotedLiterals(withoutComments(Files.readString(file)))) {
                        if (declared.contains(literal)) {
                            inFrontend.add(REPO_ROOT.relativize(file) + " → \"" + literal + "\"");
                        }
                    }
                }
            }
        }
        assertThat(inFrontend).as("前端权限码字面量只许住在 packages/common 的唯一 owner").isEmpty();

        Set<String> ownerCodes = new LinkedHashSet<>();
        for (String literal : quotedLiterals(withoutComments(Files.readString(FRONTEND_PERMISSION_OWNER)))) {
            if (declared.contains(literal)) {
                ownerCodes.add(literal);
            }
        }
        assertThat(ownerCodes)
                .as("前端权限码 owner 与已登记消费集合双向相等")
                .containsExactlyInAnyOrderElementsOf(FRONTEND_PERMISSION_CODES);
    }

    // ---------- owner 读取 ----------

    private static final String FILE_OWNER = "com/shop/platform/common/Permissions.java";
    private static final String FILE_REQUEST_PATHS = "com/shop/platform/infra/web/RequestPaths.java";

    /** {@link Permissions} 的公开常量：名 → 值，按声明顺序 */
    private static Map<String, String> constants() throws Exception {
        Map<String, String> out = new LinkedHashMap<>();
        for (Field field : Permissions.class.getDeclaredFields()) {
            if (!Modifier.isPublic(field.getModifiers())
                    || !Modifier.isStatic(field.getModifiers())
                    || field.getType() != String.class) {
                continue;
            }
            out.put(field.getName(), (String) field.get(null));
        }
        // 反射读到的字段顺序按 JVM 实现稳定，但等式全部按集合比对，不依赖顺序
        return out;
    }

    /** 匿名白名单默认值（JwtProperties.skipPaths），RequestPaths 常量按名解析回值 */
    private static List<String> skipPaths() throws IOException {
        String stripped = withoutComments(read(JWT_PROPERTIES));
        Matcher m = SKIP_LIST.matcher(stripped);
        if (!m.find()) {
            throw new IllegalStateException("没在 JwtProperties 里找到 skipPaths = List.of(...)，扫描器需要跟着改");
        }
        List<String> out = new ArrayList<>();
        for (String cell : m.group(1).split(",")) {
            String entry = cell.trim();
            if (entry.isEmpty()) {
                continue;
            }
            if (entry.startsWith("\"")) {
                out.add(entry.substring(1, entry.length() - 1));
            } else if (entry.startsWith("RequestPaths.")) {
                out.add(namespaceConstant(entry.substring("RequestPaths.".length())));
            } else {
                throw new IllegalStateException("skipPaths 里出现了不认识的写法：" + entry);
            }
        }
        assertThat(out).as("白名单非空").isNotEmpty();
        return out;
    }

    private static String namespaceConstant(String name) {
        try {
            return (String) RequestPaths.class.getDeclaredField(name).get(null);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("RequestPaths 里没有常量 " + name + "，白名单指向了不存在的 owner", e);
        }
    }

    // ---------- 扫描 ----------

    private static List<Site> sites() throws IOException {
        List<Site> out = new ArrayList<>();
        for (Path file : mainJavaFiles()) {
            String stripped = withoutComments(read(file));
            Matcher decl = DECLARATION.matcher(stripped);
            while (decl.find()) {
                String args = decl.group(2);
                if (args == null) {
                    continue;
                }
                if (args.contains("\"")) {
                    // 码位写成字面量：整串带引号当码交出去，由测试判红
                    out.add(new Site(args.trim(), controllerOf(file), rel(file)));
                    continue;
                }
                Matcher ref = PERMISSIONS_REF.matcher(args);
                boolean referenced = false;
                while (ref.find()) {
                    out.add(new Site(ref.group(1), controllerOf(file), rel(file)));
                    referenced = true;
                }
                if (!referenced) {
                    out.add(new Site(args.trim(), controllerOf(file), rel(file)));
                }
            }
        }
        return out;
    }

    /** 真实路由清单：类级 @RequestMapping 与前缀拼上方法级映射 */
    private static List<Route> routes() throws IOException {
        List<Route> out = new ArrayList<>();
        for (Path file : mainJavaFiles()) {
            String stripped = withoutComments(read(file));
            Matcher decl = DECLARATION.matcher(stripped);
            String base = null;
            boolean classLevelPermission = false;
            boolean methodPermission = false;
            List<Route> local = new ArrayList<>();
            while (decl.find()) {
                if (decl.group(1) != null) {
                    if (base == null) {
                        base = decl.group(1);
                    }
                    continue;
                }
                if (decl.group(2) != null) {
                    if (local.isEmpty()) {
                        classLevelPermission = true;
                    } else {
                        methodPermission = true;
                    }
                    continue;
                }
                String path = (base == null ? "" : base) + (decl.group(3) == null ? "" : decl.group(3));
                local.add(new Route(path, controllerOf(file), classLevelPermission || methodPermission));
                methodPermission = false;
            }
            out.addAll(local);
        }
        return out;
    }

    private static String controllerOf(Path file) {
        String name = file.getFileName().toString();
        return name.substring(0, name.length() - ".java".length());
    }

    private static List<DocRow> docRows() throws IOException {
        List<DocRow> out = new ArrayList<>();
        for (String line : Files.readAllLines(DOC)) {
            String trimmed = line.trim();
            if (!trimmed.startsWith("|")) {
                continue;
            }
            String[] cells = trimmed.split("\\|");
            if (cells.length < 6) {
                continue;
            }
            String domain = cells[1].trim();
            if (!domain.equals("admin") && !domain.equals("seller")) {
                continue;
            }
            List<String> codes = new ArrayList<>();
            Matcher cm = CODE_IN_BACKTICKS.matcher(cells[2]);
            while (cm.find()) {
                codes.add(cm.group(1));
            }
            assertThat(codes).as("文档「码」这一列每行恰好一个码：" + trimmed).hasSize(1);
            out.add(new DocRow(domain, codes.get(0), cellTokens(cells[3]), cellTokens(cells[4])));
        }
        return out;
    }

    /** 反引号包起来的枚举格：{@code `岗位:OPS`} / {@code `A`, `B`} → 令牌集；{@code —} → 空集 */
    private static Set<String> cellTokens(String cell) {
        Set<String> out = new LinkedHashSet<>();
        Matcher m = Pattern.compile("`([^`]+)`").matcher(cell);
        while (m.find()) {
            out.add(m.group(1));
        }
        return out;
    }

    /** 「授予」列的期望值：由生产代码求值，不从文档读第二遍 */
    private static Set<String> grantedFromCode(String code) {
        Set<String> tokens = new LinkedHashSet<>();
        for (StaffRole role : List.of(StaffRole.REVIEWER, StaffRole.OPS)) {
            if (role.permissions().contains(code)) {
                tokens.add("岗位:" + role.name());
            }
        }
        if (SellerGrants.GRANTABLE.contains(code)) {
            tokens.add("子账号");
        }
        if (tokens.isEmpty()) {
            tokens.add("仅超管");
        }
        return tokens;
    }

    // ---------- 文本工具 ----------

    private static List<Path> mainJavaFiles() throws IOException {
        try (Stream<Path> walk = Files.walk(MAIN_JAVA)) {
            return walk.filter(p -> p.toString().endsWith(".java")).sorted().toList();
        }
    }

    private static String read(Path file) throws IOException {
        return Files.readString(file);
    }

    private static String rel(Path file) {
        return MAIN_JAVA.relativize(file).toString().replace('\\', '/');
    }

    private static List<String> quotedLiterals(String text) {
        List<String> out = new ArrayList<>();
        Matcher m = QUOTED.matcher(text);
        while (m.find()) {
            out.add(m.group(1));
        }
        return out;
    }

    private static Set<String> union(Set<String> left, Set<String> right) {
        Set<String> out = new LinkedHashSet<>(left);
        out.addAll(right);
        return out;
    }

    /** 去掉注释但保留换行结构（行号与原文对齐，逐行扫描才不会把两行并成一行） */
    private static String withoutComments(String source) {
        StringBuilder out = new StringBuilder(source.length());
        int i = 0;
        while (i < source.length()) {
            char c = source.charAt(i);
            char next = i + 1 < source.length() ? source.charAt(i + 1) : 0;
            if (c == '/' && next == '/') {
                while (i < source.length() && source.charAt(i) != '\n') {
                    i++;
                }
                continue;
            }
            if (c == '/' && next == '*') {
                i += 2;
                while (i < source.length()
                        && !(source.charAt(i) == '*' && i + 1 < source.length() && source.charAt(i + 1) == '/')) {
                    if (source.charAt(i) == '\n') {
                        out.append('\n');
                    }
                    i++;
                }
                i = Math.min(source.length(), i + 2);
                continue;
            }
            if (c == '"' || c == '\'' || c == '`') {
                out.append(c);
                i++;
                while (i < source.length()) {
                    char d = source.charAt(i);
                    out.append(d);
                    i++;
                    if (d == '\\' && i < source.length()) {
                        out.append(source.charAt(i));
                        i++;
                        continue;
                    }
                    if (d == c) {
                        break;
                    }
                    if (d == '\n' && c != '`') {
                        break;
                    }
                }
                continue;
            }
            out.append(c);
            i++;
        }
        return out.toString();
    }
}

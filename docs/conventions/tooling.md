# 工具链与数据面（仓库特定口径）

这份从 `AGENTS.md` 下沉：AGENTS.md 每次自动进 AI 上下文，只留骨架与指针；这里是按需读的细节。行为与本文件不符时，跑 `pnpm exec vp env doctor` 带上输出求助。

## Vite+（`vp`）在本仓库的口径

通用文档在 `node_modules/vite-plus/docs`（线上 https://viteplus.dev/guide/ ）。下面全是**本仓库特有**、通用文档没有的约定：

- **一份入口**：lint / fmt / 类型检查 / 测试 / 任务只有 `vp`。**全局 `vp` 可以装**（本机已装，跑 `vp upgrade` 升级）——`vp dev/build/test/check` 会自动委托到项目本地 `vite-plus` 的版本，不因全局版本而分叉，用 `vp toolchain` 可看当前选中的是哪套。唯一要钉死的是**别让 `vp env` 接管 Node 和包管理器**：本仓库 Node 归 mise、包管理归 pnpm 12，跑 `vp env off` 设成系统优先即可，否则 vp 的 shim 会和 mise/pnpm 抢 ownership。命令出口照旧：`package.json` script 里裸 `vp`（从 `node_modules/.bin` 解析），CI 与 hooks 走 `pnpm <script>` / `pnpm exec vp`。
- **`vp <name>` 是内建、`vp run <name>` 才跑 script/task**，同名不同命（`vp dev` ≠ `vp run dev`）。
- **配置只住根 `vite.config.ts` 的 `lint`/`fmt` 块**：包级块对逐文件不生效（Oxlint 在 Vite+ 模式下禁用嵌套配置）；从子包目录跑 `vp check` 用的仍是根设置（包级配置不能替换根的 `lint`/`fmt` 块）。`-c`/`--config` 这条路**是有的**（`vp lint -c <path>` / `vp fmt -c <path>`；注意两边的 `--help` 都没列它，实测 v1.0.0 才确认——`vp lint --help` 里的 `--print-config` 不是同一个东西），但它选的是 **Oxlint / Oxfmt 的原生配置文件**，不是带 `lint`/`fmt` 块的 `vite.config.ts`；迁移前 `lint:web` 里那条 `oxlint --config packages/config/oxlint.config.ts` 是原生 CLI 的形态，两者不是一回事。忽略口径的唯一出口是根配置的 `lint.ignorePatterns` / `fmt.ignorePatterns`（仓库根那两份 ignore 文件已删——oxc 按配置文件所在目录解析 ignore，只有根配置能匹配全仓路径）。fallow 两边都不读，用它自己的 `.fallowrc.json`。
- **`defaultPackage: "./apps/web"`**：根目录裸 `vp build` 只构建买家端，另两端要显式 `-C`（`pnpm exec vp -C apps/seller build`）。
- **git hooks 归 Lefthook**（`lefthook.yml`），别跑 `vp config --hooks`。
- **`vp check --fix` 别指望它只给 safe fix**：oxlint 把 fix 分 safe/dangerous 两档，文档契约是 `--fix` 只应用 safe、dangerous 要 `--fix-dangerously`；但实测随包的 oxlint 1.85.0 在**纯 `--fix`** 下就把官方标为 dangerous 的 `unicorn/prefer-set-has` 应用了（把 `readonly string[]` 数组改成 `new Set(...)` 却不改注解 → tsc `TS2740/TS2339`）。这是 Vite+/oxlint 的 `--fix` 语义问题，不是本仓库规则配错（`oxlint.config.ts` 从没要求跑 dangerous）。已把 `prefer-set-has` 顶层关闭消掉这个元凶；其余 dangerous fix 仍可能泄漏，所以 `--fix` 跑完必跟 `pnpm exec vp check` + `pnpm typecheck` + `pnpm test`。完整机制与 A/B 实测见 [frontend.md](frontend.md)「自动修复」。
- **`vp` 会往 `AGENTS.md` 的 `<!--VITE PLUS START/END-->` 区间写它的通用说明并整段覆盖**，所以本仓库的 Vite+ 约定一律写在正文，不要塞进那个区间。

## CI 门禁与诊断

配置入口是 `.github/workflows/ci.yml`。保持独立并行 job，不按前后端目录跳过检查：后端词表测试也读取前端共享资源和 OpenAPI。现有 6 个：`security` / `frontend` / `frontend-test` / `frontend-i18n` / `backend` / `e2e`。

- 同一个 PR / 分支的新运行会取消旧运行，不影响其他 PR。超时上限：安全门禁 / 前端检查各 10 分钟，前端单测 / 三端 i18n 各 15 分钟，后端 / 业务 E2E 各 20 分钟。E2E 就绪轮询预算 120 秒，单次 HTTP 请求最多 5 秒，该步骤另有 3 分钟硬上限。
- `security` 排在第一个：它不装项目依赖、不连数据面，最便宜（~1 分钟），也最适合最先失败。
- 前端检查跑 `pnpm exec vp check`（fmt + lint），保留独立的 `pnpm typecheck`；`pnpm contract:audit` 与体积预算（`pnpm perf:bundle`，放最后——要构建三端，是本 job 最贵的一步）并入同一 job，省去独立 runner 的 checkout / 工具链 / 依赖安装。单测仍独立并行，不改用串行的 `vp run verify`。
- 后端先显式跑 `mvn -B -ntp -f apps/server/pom.xml spotless:check -q`，再跑 `mvn -B -ntp -f apps/server/pom.xml verify -q`。CI 不使用 `--fix` / `spotless:apply`，失败时上传 Surefire / Failsafe 报告到 `backend-diagnostics`。
- Playwright HTML、失败现场与服务日志的路径见 [E2E 失败诊断](../../e2e/README.md#失败诊断)。业务测试没启动时不要求 HTML；启动后没有报告则报错。

### 安全与体积门禁（2026-10 接入）

门禁二进制没有 npm 发行版，版本钉在仓库根 **`mise.toml`** 里（`gitleaks` / `actionlint` / **`shellcheck`** / `zizmor` / `osv-scanner` / `lychee` / `sherif`）；本地 `mise install` 一次，CI 由 `jdx/mise-action` 装同一份。这样本地 lefthook 与 CI 跑的是同一版本，不必两处维护。仓库的 Node 本来就归 mise 管（见上「Vite+ 口径」），不引入第二套工具管理。**`shellcheck` 也要钉**：actionlint 会静默使用 PATH 上的 shellcheck 去查 `run:` 里的内联 bash，不钉它就会出现「同一个 actionlint 在装了 shellcheck 的机器上查得多、没装的查得少」。
把 `lychee` / `sherif` 也放 mise 而不是 npm，是为了让它们留在 **`security` job**：那个 job 只 checkout + mise、不跑 `vp install`，门禁因此在「依赖装没装好」之外独立成立。（`sherif` 其实有 npm 发行版，放 mise 纯粹是为了不为了跑它去 `frontend` job 装一遍依赖，也不给 lockfile / catalog 添条目。）

| 门禁        | 管什么                                    | 在哪跑                                                               | 放行 / 配置                                                       |
| ----------- | ----------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| gitleaks    | 密钥泄漏                                  | pre-commit（`--staged` 只扫暂存）+ CI（`gitleaks git` 扫**全历史**） | `.gitleaks.toml` 按**值的形状**放行误报；`.gitleaksignore` 放历史 |
| osv-scanner | 依赖漏洞（pnpm 锁文件 + Maven 依赖树）    | CI `security`（本 job 最慢的一步，放最后）                           | `osv-scanner.toml` 逐条放行（带理由 + 到期日）                    |
| actionlint  | workflow 语法 / 表达式 / shellcheck       | CI `security`                                                        | —                                                                 |
| zizmor      | workflow 安全（权限 / 凭据 / 未固定 SHA） | CI `security`（`--offline`，结果确定、不限流）                       | 修 workflow 本身                                                  |
| lychee      | 文档本地链接（相对路径 / 跨文档 / 锚点）  | pre-push `docs-links` + CI `security`                                | `lychee.toml`（离线、查锚点、只收 md）                            |
| sherif      | monorepo 一致性（版本 / 依赖字段 / 排序） | pre-push `monorepo-lint` + CI `security`                             | 根 `package.json` 的 `sherif` 字段                                |
| 体积预算    | JS/CSS gzip 绝对预算（Size Limit）        | CI frontend（`pnpm perf:bundle` 构建后检查）                         | `perf/size-limit.json`；调高预算须写理由                          |

几条不能忘的口径：

- **密钥只进 `apps/server/.env`（gitignored）或部署平台的环境变量**，不落代码 / yml / 仓库。gitleaks 的 `--staged` 模式只扫暂存，所以工作区里那个 `.env` 不会被本地钩子报（它本来就进不了仓库）；CI 扫全历史，管的是「曾经提交过、后来删掉」那种。
- **`.gitleaksignore` 只放历史残留，且必须逐条写理由**；误报一律走 `.gitleaks.toml` 的 allowlist（按值形状放行，覆盖当前与将来）。写不出理由的就该去改代码或**轮换密钥**——删提交没用，值已经进过历史。
- **CI 里所有 action 按 commit SHA 固定**（zizmor `unpinned-uses`），注释里留版本号供人读；升级由 `.github/dependabot.yml` 的 `github-actions` 生态每周提 PR。Dependabot **只开这一个生态**：npm / maven 的升级面会淹没在噪音里，而依赖漏洞那半边已由 osv-scanner 管住（它报的是「确实有 CVE」，信号密度高得多）。
- **osv 的 Maven 侧有四条要记牢**：
    - **它不用 `mvn`**：osv-scanner 走 deps.dev 的 resolver 库 + **deps.dev API（联网）**算依赖图，所以 `security` job 不需要装 Java / Maven。代价是这条门禁**依赖网络与上游数据**——deps.dev 抖动、限流或数据更新都会影响结果，而且它算出的图与 Maven 自己的 mediation 未必逐字一致，所以**判断「到底修没修」以 `mvn dependency:list` 为准**，osv 只是门禁信号。想改走 Maven Central 加 `--data-source=native`。
    - **`--config` 必须显式写**：osv 的配置发现是按**扫描根**找 `osv-scanner.toml` 的，而 `--lockfile=apps/server/pom.xml` 的扫描根是 `apps/server/`，自动发现够不到仓库根那份（实测不写就照报）。
    - **忽略清单当前为空**。唯一一次放行是 `GHSA-3cqm-mf7h-prrj`（okhttp 3.14.4）/ `GHSA-w33c-445m-f8w7`（okio 1.17.2），都由 `com.qiniu:qiniu-java-sdk:7.19.0` 传递引入（已是最新版，它自己就把 okhttp 钉在 3.14.4、上游无修复版）。当时按「**漏洞路径运行时不可达**」放行：本仓库只用该 SDK 的 `com.qiniu.util.Auth` / `StringMap` 两个本地签名类（`QiniuClient.issueUploadToken`），**从不发起 HTTP**（文件走浏览器 presigned 直传，服务端只签凭证）。后来改在 `apps/server/pom.xml` 的该依赖上 `<exclusion>` 掉 okhttp——**依赖没用到就不该进产物，连 CVE 一起不带**，比写在忽略清单里干净。okio 只由 okhttp 传递引入，排除后随之消失；gson 必须留着（`Auth.uploadToken` → `Json.encode` 走 gson）。
    - **这类「传递引入但自己用不到」的优先去 `<exclusion>`，不要写进忽略清单**。清单只留给真正「有 CVE、上游没修、且路径可达」的硬骨头。回归护栏 `QiniuClientTest`（纯单测，不连库）用真实 `Auth` 签一张凭证并解回 policy 校验——SDK 哪天把 okhttp 变成签名路径的必需依赖，它会红。Controller 那两处（`ProductAdminControllerTest` / `AuthControllerTest`）验不了这件事：它们把整个 `QiniuClient` 换成了 `@MockitoBean`，真实签名路径一行都没跑到。
    - Jackson 在 Boot 4 里是**两条独立的线**，只顶一条会漏另一半：`jackson-bom.version` 管 3.x（`tools.jackson.*`），`jackson-2-bom.version` 管 2.x（`com.fasterxml.jackson.*`）。
- **osv 的 pnpm 侧：能顶就顶，不攒豁免债**。锁文件那半边只扫 `pnpm-lock.yaml` 一个文件，报出来的**全是传递依赖**。处置顺序：
    1. **先看区间放不放得下**（`pnpm view <父包> dependencies.<包>`）：`^` / `~` 允许就直接重解析，零 override——`source-map-js` 1.2.1→1.2.2 就是这么修的（`css-tree` 声明 `^1.2.1`）。
    2. **区间放不下、但修复版存在** → 写进 `pnpm-workspace.yaml` 的 `overrides`，且**按受影响区间顶**（`'pkg@<修复版': ^修复版`）而不是按包名整包顶：整包顶会把大版本不同的另一份消费者一起拽走（`brace-expansion` 就有 1.x 消费者）。
    3. **确实没有修复版、或路径真的可达** 才轮到 `osv-scanner.toml` 的 `[[IgnoredVulns]]`（逐条理由 + `ignoreUntil`）。
    - **overrides 只能写在 `pnpm-workspace.yaml`**：pnpm 12 已不读 `package.json` 的 `pnpm` 字段（实测 warning：`The "pnpm" field in package.json is no longer read by pnpm`），写在那儿是**静默失效**——install 会「成功」而漏洞一个不少。
    - 2026-10-06 第二批（`seroval` / `seroval-plugins` / `shell-quote` / `source-map-js`）走的是第 2 条。四条都**只在开发/构建期可达**：`seroval` 只被 solid-js 的 **SSR 产物**（`solid-js/web/dist/server.js`）引用，客户端产物零引用，而仓库里没有任何地方调 solid 的 `renderToString`（solid-js 只是 React devtools 内部 UI 的传递依赖，且 devtools 在生产构建里已被剥离）；`source-map-js` 在构建期读自己产出的 sourcemap；`shell-quote` 那条 CVE 在 `quote()`，concurrently 的 `expand-arguments.js` 确实 import 了它（顶 `{}` 占位符）——但我们不传额外参数、命令串是仓库里写死的，攻击面为零。**即便不可达也顶上去**：豁免债要付利息，有修复版就没有理由留清单。
    - **`seroval` 与 `seroval-plugins` 必须一起顶**：上游 lockstep 发版（1.5.6/1.5.6、1.6.8/1.6.8），只顶一半等于让 1.5.6 的插件 API 跑在 1.6.8 的核心上，比整对顶更险。
- **lychee 只查本地链接，外部 URL 一律不查**（`lychee.toml` 里 `offline = true`）。这是刻意的：联网查外链会因上游抖动 / 限流 / 站点临时下线而红，那种红没有可行动的信号，只会训练人忽略这条门禁——和 zizmor 选 `--offline` 同一个理由。**代价必须记住**：这条门禁过了不等于「所有链接都能打开」，它保证的只是「本地引用没有断」。想顺带查外链（人工、非门禁）：`mise exec -- lychee --no-progress docs`。
    - **`include_fragments = "anchor-only"` 是这份配置里最值钱的一项**：没有它，「标题被改名、链接还指着旧锚点」查不出来——那种坏法连 `File not found` 都不会报，只在点下去时跳到页首。文档标题重排是常事，靠人眼复核锚点不现实。
    - **`extensions = ["md"]` 也是刻意的**：仓库里被跟踪的 html 只有三个 SPA 入口模板和一个 perf 夹具，入口模板里的 `/assets/*.js` 是构建期才存在的绝对路径，检查它得配 `root_dir`、配了也只是在验证「构建产物在不在」；不限定扩展名还会让 lychee 把 `apps/server/pom.xml` 当 sitemap 读，刷一条无意义的 WARN。
- **sherif 与 pnpm 的 `catalogMode: strict` 是同一件事的两侧**：`catalogMode` 管的是 `pnpm add` 的**写入**（新依赖自动进 catalog），手改 `package.json` 塞一个显式版本它拦不住——那一格由 sherif 的 `multiple-dependency-versions` / `unordered-dependencies` / `empty-dependencies` 补上。`failOnWarnings` 开在根 `package.json` 的 `sherif` 字段里（不是命令行），这样本机钩子与 CI 读的是同一份配置，不会两处漂移。
    - 它接入时立刻报出两个真问题：根 `package.json` 缺 `private: true`（不设的话根包可能被误发布到 registry），以及 `pnpm-workspace.yaml` 的 `apps/*` 会把 `apps/server`（Maven 模块、没有 `package.json`）算成一个「缺 package.json 的 workspace 包」。后者改成显式列出三个前端应用——通配符在这里描述的是「意图」而意图是「只收 JS 应用」，显式写出来更诚实。**改 workspace 列表后 `pnpm install --frozen-lockfile` 仍通过**（workspace 项目数不变，10 个），lockfile 不受影响。
- **`security` 这个 job 名比它的实际范围窄**（现在也管文档链接与 monorepo 一致性），但**别为了改名去动它**：远端 ruleset / branch protection 是按 job 名设 required check 的，改名要同步改远端设置，否则 PR 会一直等一个不存在的检查。同理见下面「分支保护注意」。
- **体积预算由 Size Limit 判定**：`perf/size-limit.json` 保存逐类 JS/CSS 的 gzip 绝对上限。阈值来源与压缩参数见 [perf/README.md](../../perf/README.md#产物体积size-limit)。不再自动重冻基准；有意增大在同一个 PR 修改预算并说明原因。
- **必需产物分组缺失也失败**：Size Limit 对任一未匹配到文件的 JS/CSS 分组返回非零，不使用 `--ignore-missing`。真实 CLI 的超限、缺配置、缺产物与 sourcemap 排除由 `scripts/size-limit.test.mjs` 验证。
- **不把静态依赖叫作首屏**：门禁守全量 JS/CSS，不校验页面实际请求了哪些 chunk。图片、字体、动态路由加载和文件引用完整性要由浏览器测试负责。
- **本地钩子里的「判定 + 调用」逻辑一律写成 Node 脚本，不写在 lefthook 的多行 `run:` 里**。`secret-scan` 就是踩过这个坑：内联多行 shell（`if ! command -v gitleaks …; then …; fi` + 调用）在 Windows 上被 lefthook 交给 `sh -c` 时脚本被拆坏，实测报 `-c: line 3: syntax error: unexpected end of file from 'if' command on line 1`——于是这条钩子在 Windows 上**必然失败**，且失败得毫无信息量（根本没开始扫就拦住了提交）。现在 `run: node scripts/secret-scan.mjs`，判定是纯函数 `decide()`，有单测（`scripts/secret-scan.test.mjs`，跑在 vitest 的 `scripts` project 里）。

### 后端静态分析 / 迁移 / 前端无障碍门禁（2026-10 接入）

这三道是「零自动化 → 有门禁」的空白补齐；与前两道（密钥 / 漏洞 / 文档 / 一致性）不同，它们跑的是**业务正确性**而不是供应链。

| 门禁                   | 管什么                                                                                             | 在哪跑                                           | 配置 / 放行                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| NullAway + Error Prone | 编译期把 NPE 变错误（JSpecify `@NullMarked` 作用域）                                               | `mvn compile` / `verify`（后端全量门禁内）       | `apps/server/pom.xml` 的 `maven-compiler-plugin`；`OnlyNullMarked` + `JSpecifyMode` |
| squawk                 | 迁移停机风险（非并发建/删索引、NOT NULL 无默认、加列锁表、改列类型、缺 lock/statement_timeout 等） | pre-push `db-migrations` + CI `db-migrations`    | `.squawk.toml`（只留停机风险类，剔纯风格）；`scripts/db-migrations-lint.mjs`        |
| @axe-core/playwright   | 入口页无障碍（wcag2a/aa/21a/21aa 的 critical/serious）                                             | CI `frontend-i18n`（随 `pnpm test:e2e:i18n` 跑） | `e2e/i18n/a11y.spec.ts`，复用 i18n 的 webServer                                     |

**NullAway + Error Prone 的坑（都是实测踩出来的）**：

- **`-Xep*` / `-XepOpt*` 必须全部拼进同一条 `-Xplugin:ErrorProne` 参数**；拆成多条 `<arg>` 会被 javac 当成独立的 `-X` 开关，报 `无效的标记: -XepDisableAllChecks`。`fork=true` + Windows 下还不能用多行 `<arg>`（Error Prone issue 4256），所以那一条 arg 是单行。
- **Error Prone 要求两条 javac flag，缺一不可**：`-XDcompilePolicy=simple`（默认 by-todo 策略它不支持、直接拒载插件）与 `--should-stop=ifError=FLOW`（默认 INIT 策略它也不支持）。但**绝不能**画蛇添足加别的 `--should-stop`——一旦在 FLOW 前截断分析，Error Prone / NullAway 根本不跑，编译会「假绿」（全绿但门禁形同虚设），这是最阴的失效方式。
- **JDK 25（JEP 396）强封装**，fork 出的 javac 要加 `--add-exports` / `--add-opens` 开放 `jdk.compiler/com.sun.tools.javac.*`；这些用 `-J` 前缀透传给 fork 进程（仅 fork 模式有效，in-process 模式要写 `.mvn/jvm.config`，本仓库环境会让 `mvn` 整体起不来，故走 fork）。
- **`@NullMarked` 不沿子包继承**（JSpecify 语义）：标 `com.foo` 不会覆盖 `com.foo.bar`，**每个子包各持一份 `package-info.java`**。只标根包、类却在子包里，等于没标——NullAway 静默零检查，门禁又是假绿。recommend 就是 4 个 `package-info.java`（root / service / controller / dto / controller.response）各一份。
- **jspecify 不要塞进 `annotationProcessorPaths`**：放普通 `compile` 依赖即可（Spring Boot 4.1 顺带带来 `org.jspecify:jspecify:1.0.1`），NullAway 从编译 classpath 读 `@NullMarked`。放处理器路径反而引入两份 jspecify「同名不同类」的隐患。
- **增量采纳就是价值**：`OnlyNullMarked=true` 只查标了 `@NullMarked` 的包，所以门禁不会一次性把存量代码全判红；想纳入哪个包，给它加 `@NullMarked` 即可，逐步推进。
- **真实收益**：recommend 标完 `@NullMarked` 立刻抓出两个真 bug——`FeedPage` 与 `FeedResponse` 的 `nextCursor` 末页为 null，却因没标 `@Nullable` 被当成 `@NonNull`（FeedController 把 nullable 的 `nextCursor()` 传进 @NonNull 形参，NullAway 直接红）。改完两处 `@Nullable` 才绿。验证手法：标 `@NullMarked` 后故意解引用 `@Nullable` 参数 → 编译红；删掉 → 绿。

**squawk 的口径**：

- **只查增量**，不查历史已上生产的迁移。迁移按「脚本一旦合入不允许修改」的仓库铁律是不可变的，历史迁移早跑过生产，即便 squawk 说它「非并发建索引」你也改不了——全量查只会让 CI 在 V9 这类老迁移上**永远红**，等于没有门禁。基线由 `scripts/db-migrations-lint.mjs` 算：CI 的 PR 用 `GITHUB_BASE_REF`，本地 pre-push 用 `origin/main`，都没有就优雅跳过（不是退化成全量）。
- **纯风格规则已剔除**：`prefer-text-field` / `prefer-bigint-*` / `prefer-identity` 这类不改停机风险的规则在 `.squawk.toml` 的 `excluded_rules` 里，只留「非并发建/删索引、加非空列无默认、改列类型、加约束不 NOT VALID、删列/表/非空、缺 lock/statement_timeout、迁移不可幂等重跑（缺 IF [NOT] EXISTS）」这类真正会让你半夜被叫醒的规则。
- 静态分析不连库、~3s、确定；失败本地能复现（pre-push 先拦），CI 的 `db-migrations` job 是硬门禁、晚一轮才到。

**axe 无障碍门禁的口径**：

- 第一梯队只拦 **critical / serious**（`withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])` 后按 impact 过滤），moderate / minor 留给后续分层收紧——避免一次性把历史存量全判红。规则集是能调的：要更严就去掉 impact 过滤，要更松就 `disableRules([...])`。
- **复用 i18n 的 webServer 与 mock**：`a11y.spec.ts` 放进 `e2e/i18n/`，`i18n.config.ts` 的 `testDir: "./i18n"` 会自动把它收进 `pnpm test:e2e:i18n`，三端 preview 已在 4310/4311/4312 起好、业务 API 被 `mockAnonymousApi` 替身，所以**不连后端、不写库**。CI 的 `frontend-i18n` job 装了 chromium，自然覆盖这条，无需另起 job。
- 跑前 `await expect(page.locator("html")).toHaveAttribute("lang")` 等 SPA 挂载，否则 axe 扫到的是空白壳、零违规假绿。

**分支保护注意**：独立检查 `SDK 契约一致性` 已合入 `前端 lint / typecheck / 死代码`。若 GitHub ruleset / branch protection 把旧名称设为 required check，需移除旧要求并保留前端检查，否则 PR 会一直等待不存在的检查。仓库文件不能修改这项远端设置。

验证：本地跑 `pnpm exec vp check`、`pnpm typecheck:e2e`、`pnpm contract:audit`、`mvn -f apps/server/pom.xml spotless:check -q`，以及门禁：`gitleaks git --redact`、`actionlint`、`zizmor --offline .github/workflows`、`lychee .`、`sherif`、`osv-scanner scan source --lockfile=pnpm-lock.yaml --config=osv-scanner.toml`、`osv-scanner scan source --lockfile=apps/server/pom.xml --config=osv-scanner.toml`、`pnpm perf:bundle`、`mvn -f apps/server/pom.xml compile -DskipTests`（NullAway 在此跑）、`pnpm db:migrations:lint`、`pnpm test:e2e:i18n`（含 axe）。推送后确认 7 个 job（security / frontend / frontend-test / frontend-i18n / backend / e2e / db-migrations）、同 PR 连推取消旧轮、失败时诊断产物齐全。回滚时一起还原 workflow、pom.xml 编译参数、Playwright reporter 路径配置和对应 required check 设置。

## 开发日志转发

买家端保留 Vite+ 的浏览器 → 终端日志转发，关闭 `@tanstack/devtools-vite` 的 `consolePiping`（`apps/web/vite.config.ts`）。Devtools 的其他能力不变。两套管道同时开启时，Vite+ 打印的客户端日志会被 Devtools 当成服务端日志送回浏览器，再被 Vite+ 收回，反复叠加 `[Server]`，造成日志持续膨胀。不要靠降低日志级别掩盖这个循环。

验证：启动买家端，在后端暂未启动时打开首页触发网络错误；错误应正常输出，但不应不断嵌套 `[Server]`。后端就绪后刷新首页并搜索商品，确认页面恢复。

## 数据库与 Redis（默认在云主机）

**默认走云**（`SHOP_DATASTORE=remote`）：PG 18 / Redis 7 在云主机的容器里（清单 `deploy/dataplane.compose.yml`），本机持有的是一条 ssh 端口隧道——本地 `15432/6379` → 云 `5433/6379`（主机别名 `SHOP_SSH_HOST`，默认 `aliyun`）。`dev:server` / `db:up` / `db:down` / `test:server` 四条命令用法不变，换数据面不改肌肉记忆。本地端口沿用 15432/6379，所以 JDBC URL、`application-test.yml`、seed、e2e 一处都不用改。

- **本机 WSL 里的 PG / Redis 已 `systemctl disable --now`**（2026-10 起）。这是有意的：它们原先 `enabled`，WSL 一启动就抢 15432/6379，于是「隧道没起」时会静默落到本地库——backend 跑起来、数据也是真的，看着一切正常，实则写进了另一台库。现在这两个端口没有第二个属主，隧道不在就是 connection refused，**错库不再可能静默发生**。
- **端口是 15432 不是 5432**（GameViewerServer 绑死了 Windows 的 `0.0.0.0:5432`）。CI 的 PG service 仍在 5432，由 workflow 里 `SHOP_DB_PORT=5432` 覆盖。全链口径收在 `SHOP_DB_*` / `SHOP_REDIS_*` 变量族（application{,-test}.yml / scripts / e2e，含 host / user / password）。
- **认端口属主那道闸还在**：remote 下起隧道前会查本地这两个端口是谁在听，认不出属主就拒绕起隧道，绝不静默接到别的库上。
- **隧道是自愈的**：`pnpm db:up` 拉起的不是一个裸 ssh，而是一个后台守护进程（`--tunnel-guard`）——ssh 自己不会重连，断线后没人补就是「断了要手动重跑 db:up」。守护盯着端口、断了退避补一条，所以合盖 / 切 Wi-Fi / 云主机重启都能自己恢复（实测断线后 ~3s 回来）。日志在 `~/.shop-datastore/tunnel-guard.log`。
- **守护已注册为 Windows 计划任务「shop-tunnel-guard」**（`pnpm guard:install`）：登录时由系统以你的身份拉起，父进程是 Task Scheduler 的 svchost，**与任何终端无关**——关掉跑过 `db:up` 的窗口不影响它。任务用 XML 注册是为了改掉几个会坑死常驻进程的默认行为（默认拔电不启动、默认 72h 强杀、默认仅在空闲时运行）。装了它之后日常不需要跑任何数据面命令；`pnpm db:down` 仍能临时断一次，但下次登录守护会自己回来（要彻底停用跑 `pnpm guard:uninstall`）。
- **node 路径不写死**：任务调的是 `scripts/tunnel-guard.cmd`，它在运行时按 mise shim → PATH → mise installs 解析 node，所以 mise 升 node 大版本不需要重装任务。那个 .cmd 有两条硬约束：必须**纯 ASCII**、且 `rem` 注释里不能出现 `<` `>` `&` `|` `(` `)`（cmd 会当重定向/命令分隔符，然后**静默**退出，不报错不写日志）。它还必须以 CRLF 存盘（已在 `.gitattributes` 里给 `*.cmd` 声明 `eol=crlf`），因为 cmd 对 LF-only 的批处理解析不可靠。这几条都踩过，**改它之前先读文件头注释**（那里是真相源）。
- **云机有公网 IP，所以库与 Redis 只 bind `127.0.0.1`，安全组只留 22/80/443**。
- **跑后端测试前先让数据面在位**：接口契约测试（`WebControllerTestSupport` 子类）起真实上下文连专用库 `shop_test`，库没起时整类红，Spring 的 failure threshold 还会带走后面几百个用例——看着像代码坏了，其实只是连不上。`pnpm test:server` 已内置探针（毫秒级，库不在就跳过并给修法）；直跑 `mvn test` 请自己先 `pnpm db:up`。
- **`wsl` 只作为退路保留**，要显式 `SHOP_DATASTORE=wsl` 才走。它那套坑（VM 空闲几十秒被回收、网络流量不算会话、~1.2GB vmmemWSL 要挂会话按着）都写在 `scripts/ensure-datastore.mjs` 头注释；真要用得先在 WSL 里 `systemctl enable --now postgresql redis-server` 把端口还回去。
- `apps/server/.env`（gitignored）是 dev 数据面配置的唯一本地来源：口令 `SHOP_DB_PASSWORD` / `SHOP_REDIS_PASSWORD` 与偏好 `SHOP_DATASTORE` 都写这里，接法在 `scripts/dotenv.mjs`（Spring dev 段、seed、e2e、`db:up` 读同一份）。命令行显式导出永远压得过它，删掉那行则回到默认 `remote`，所以 `SHOP_DATASTORE=wsl pnpm db:up` 随时能切到本地退路一次。

## 刷新令牌的响应类型

`packages/common/src/contract/sdk-client.ts` 的刷新请求显式发送 `Accept: application/json`。读取时用 `.text()` 是为了统一处理成功/错误体，不代表接口返回文本；Ky 2 会给 `.text()` 自动设置 `Accept: text/*`，导致 Spring 无法返回 JSON（`No acceptable representation`）。不要去掉这条请求头。

import { defineConfig } from "vite-plus"
import { oxlintConfig } from "./packages/config/oxlint.config"
import { oxfmtConfig } from "./packages/config/oxfmt.config"

/**
 * 忽略口径的唯一出口：oxlint 与 oxfmt 各自的 `ignorePatterns`，都写在这份根配置里。
 *
 * 为什么原来住在仓库根的 `.eslintignore` / `.prettierignore`，现在不必了：那两份文件头记的都是
 * **迁移前**的限制——那时生效的 lint/fmt 配置在 `packages/config/*.config.ts`，而 oxc 两个工具的
 * `ignorePatterns` 都按**配置文件所在目录**解析、匹配不到目录之外的路径（实测：写在那里等于没写）。
 * Vite+ 要求 lint/fmt 块只住在根 `vite.config.ts`，配置文件与仓库根同目录之后这条限制自然消失。
 * 实测等价（点文件移走、只靠这里的 ignorePatterns）：`vp lint --type-aware .` 同为 621 文件 /
 * 49 warnings / 0 errors，`vp fmt --check .` 同为 706 文件全通过，且显式点名生成物
 * （`vp lint packages/api/src/sdk/`、`vp fmt --check pnpm-workspace.yaml`）仍被挡在门外。
 *
 * 两个工具的忽略文件不能改名也不通用：oxlint 只认 `.eslintignore`（改 `.oxlintignore` 实测不生效），
 * oxfmt 只认 `.gitignore` + `.prettierignore`（另有一份 `.oxfmtignore` 实测不生效）；现在既然写进配置，
 * 这两个默认名就都不再被读取。oxfmt 仍会连带读 `.gitignore`，所以 `dist/`、`node_modules/` 那类
 * 由 git 自己挡掉的路径不用在这里重复。
 *
 * fallow **不读这里，也不读上面那两份**：它的忽略在 `.fallowrc.json`（四套：ignorePatterns /
 * ignoreFindings / health.ignore / duplicates.ignore），口径本就不同——fallow 排 apps/server 与
 * vendored reui，这里排生成物与 components/ui。改一边记得看另一边是否需要跟。
 */

/** 生成物与 vendor 代码：不参与 lint，也不参与 format（两边共有） */
const GENERATED = [
    // @hey-api 从 openapi/api-docs.json 生成（pnpm gen:sdk）；漏挡的代价实测 sdk 目录 81 errors / 131 warnings
    "**/*.gen.ts",
    "**/*.generated.*",
    "**/generated/**",
    "**/sdk/**",
    // TanStack Router 插件在 dev/build 时生成；被 oxfmt 改写后会被插件再生成回去，来回抖动
    "**/routeTree.gen.ts",
    // shadcn/base-ui 组装出来的组件库
    "**/components/ui/**",
]

/** 只给 lint：oxlint 会读进这些文件，格式化不认 */
const LINT_ONLY = ["**/migrations/**", "**/*.d.ts"]

/** 只给 format：谁写的谁排版，脚本不去改它的风格 */
const FMT_ONLY = [
    // openapi/api-docs.json 由后端 /v3/api-docs 导出、gen:sdk 覆盖写入
    "openapi/api-docs.json",
    // pnpm 按 2 空格序列化 catalog，oxfmt 是 tabWidth 4：跑一次 pnpm format 就把整篇重排，
    // pre-commit 的 fmt-web 还会 stage_fixed 把它带进提交，下次 pnpm 改动时再翻回去。
    // pnpm-lock.yaml 同类，但实测不被 `vp fmt` 改写（lefthook 侧另有 exclude），不重复声明。
    "pnpm-workspace.yaml",
]

export default defineConfig({
    // 根目录裸跑 `vp dev` / `vp build` / `vp preview` 的目标（Vite+ 静态读这一行，必须是字面量）。
    // 不配时它会把候选包列一遍再 exit 1（非交互 shell 下就是直接失败）。
    // 明确的取舍：`vp build` 在根目录从此只构建买家端；另两端一直要显式指目标
    // （`pnpm build:seller` / `build:admin`，或 `vp -C apps/seller build`，显式 -C 永远盖过这里），
    // 连带后端才是 `pnpm build`（= build:web + mvn compile，本就不含 seller/admin）。
    defaultPackage: "./apps/web",
    run: {
        tasks: {
            /**
             * 前端门禁一把过，可缓存：`pnpm exec vp run verify`。
             * 数组按 `&&` 语义串行，且每个子命令单独指纹缓存（Vite Task 的 compound command），
             * 所以改前端代码只让 vp check 那一段失效，40s 的测试段仍走缓存重放。
             * 命令与 lefthook 的 pre-push 三项逐字相同，跑的就是门禁同一套东西。
             */
            verify: {
                command: ["pnpm exec vp check", "pnpm typecheck", "pnpm test"],
                cache: {
                    // 零改动热跑时 typecheck 与 test 两段原本恒不命中，原因是「自己写的记账文件」
                    // 被判成输入变更（`vp run --last-details` 实测）：每个 `pnpm` 子进程都换名重写
                    // node_modules/.pnpm-task-run-state-v1/.tmpXXXX（注意是 task-run，不是
                    // task-runner，写错一个词就白排），Vitest 写 node_modules/.vite/**。
                    // 只排这两个具体路径，不排 node_modules/** —— 那个会把依赖变更一起排掉，
                    // 装完新依赖仍重放旧绿。
                    input: [
                        { auto: true },
                        "!node_modules/.pnpm-task-run-state-v1/**",
                        "!node_modules/.vite/**",
                    ],
                },
            },
        },
    },
    // 测试配置不在这份文件里：根 `vitest.config.ts` 的 `projects` 逐个点名了各包的

    // `vitest.config.ts`，Vitest 读到它就不会再看同目录的 `vite.config.ts`（那里写 test 块是死配置）。
    fmt: {
        ...oxfmtConfig,
        ignorePatterns: [...GENERATED, ...FMT_ONLY],
    },
    lint: {
        ...oxlintConfig,
        // 覆盖 oxlint.config.ts 里的 `ignorePatterns: []`（那份配置现在不写忽略，见其尾部注释）
        ignorePatterns: [...GENERATED, ...LINT_ONLY],
        // vite-plus 自带的插件：把「还从 vite / vitest 裸导入」判成错误，
        // 迁移期它是守门人（源文件应改走 vite-plus / vite-plus/test）。
        jsPlugins: [
            ...oxlintConfig.jsPlugins,
            { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
        ],
        rules: {
            ...oxlintConfig.rules,
            "vite-plus/prefer-vite-plus-imports": "error",
        },
        options: { typeAware: true, typeCheck: true },
    },
})

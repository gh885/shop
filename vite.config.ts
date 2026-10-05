import { defineConfig } from "vite-plus"
import { oxlintConfig } from "@shop/config/oxlint"
import { oxfmtConfig } from "@shop/config/oxfmt"

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
             *
             * 它同时是 lefthook pre-push 那个 `verify` 作业的命令（本地手动验证与 push 前
             * 门禁同一条路径、同一套指纹），所以「手动验完再 push」不会把全量测试重跑一遍。
             * `vp check` 是 `lint:web` 的超集（多了 fmt 与 tsgolint 的类型判读）。
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
    test: {
        projects: ["apps/*/vite.config.ts", "packages/*/vite.config.ts", "scripts/vite.config.ts"],
        /**
         * 这里只留 projects 清单，不放任何 test 选项：`projects` 引用的是各包自己的 config 文件，
         * 而 config 文件形式的 project **不继承**根配置的任何 test 选项（只有 inline project 才继承）。
         * `isolate: false` 曾写在这一层，一直没生效——Vitest 结尾那行 `Isolate 162 workers spawned`
         * 才戳破它（162 个文件起了 162 个 worker，一文件一隔离）。现在它写在各 project 自己的 test 块。
         * 理由、代价与实测见 docs/conventions/frontend.md「迭代性能」。
         */
    },
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

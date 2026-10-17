import type { OxlintConfig } from "vite-plus/lint"

// `z-*` 与 `layout` 同源：层叠是调用方的职责（DESIGN.md §2.4 四档 token），组件不该替调用方决定自己在第几层。no-restyle 的语法表只认 Tailwind 内置刻度，自造 token（z-sticky/chrome/overlay/toast 由 --z-index-* 生成）一律报 "grammar does not recognize it"——不放行这条，`<Button className="… z-chrome">` 这种正确写法会被判红。裸数值那侧由 pnpm z-index:guard 单独拦。
const NO_RESTYLE_ALWAYS_ALLOWED = ["layout", "space-*", "z-*", "required-mark", "tabular-nums"]

const BOUNDARIES_ELEMENTS = [
    // 横切资源与页面层各自成元素类型，否则会被下面的 `apps/*/src/*` 吃成 domain、「域→shared 深路径」和「routes→域内文件」这两类合法导入被误判。
    { type: "shared", pattern: ["apps/*/src/shared", "apps/*/src/locales"] },
    { type: "routes", pattern: "apps/*/src/routes" },
    { type: "shell", pattern: ["apps/*/src/app", "apps/*/src/layout"] },
    // 兜底：剩下的顶层目录都是领域。元素描述符首个匹配生效，故这条必须放最后。
    { type: "domain", pattern: "apps/*/src/*" },
]

const BOUNDARIES_SETTINGS = {
    "boundaries/elements": BOUNDARIES_ELEMENTS,
    "import/resolver": {
        typescript: { project: ["apps/*/tsconfig.json"] },
        node: { extensions: [".ts", ".tsx", ".js", ".jsx"] },
    },
}

/** 由根 `vite.config.ts` 的 `lint` 块消费（Vite+ 要求 lint 设置只住根配置，包内 `lint` 块对逐文件不生效——见 docs 的 monorepo 一节）。展开时追加 vite-plus 自己的 jsPlugins/rules，故这里是独立具名导出、不是默认导出。 */
export const oxlintConfig = {
    // JS 插件（Oxlint 1.80+ 的 JS plugin API，官方标注 alpha）：@shadcn/lint 是面向 agent 的设计系统 linter，报错文本带"该用什么"、建议直接来自 packages/ui-web 的组件 variants/sizes 与 styles.css 的 theme token。
    jsPlugins: [
        "@shadcn/lint",
        // React Doctor：命名空间 react-doctor/*（287 条规则）。必须用 { name, specifier } 对象形式注册，否则 oxlint 认不出命名空间、静默不加载。
        { name: "react-doctor", specifier: "oxlint-plugin-react-doctor" },
        // TanStack 官方 ESLint 插件：官方命名空间是 @tanstack/query 与 /router（带 `/`），oxlint 侧一律改成 tanstack-query / tanstack-router。实测 8/9 条可用，no-void-query-fn 不可用（见 rules 段）。
        { name: "tanstack-query", specifier: "@tanstack/eslint-plugin-query" },
        { name: "tanstack-router", specifier: "@tanstack/eslint-plugin-router" },
        // 架构边界（跨域只许 barrel）：默认插件名就叫 boundaries，规则写在 boundaries/dependencies，元素划分见上方 BOUNDARIES_*。
        { name: "boundaries", specifier: "eslint-plugin-boundaries" },
    ],
    plugins: [
        "eslint",
        "oxc",
        "typescript",
        "unicorn",
        "import",
        "promise",
        "react",
        "vitest",
        "jsx-a11y",
    ],
    categories: {
        correctness: "error",
        suspicious: "warn",
        perf: "warn",
        restriction: "off",
        pedantic: "off",
        style: "off",
        nursery: "off",
    },

    env: {
        browser: true,
        node: true,
    },

    settings: {
        react: {
            version: "19",
        },
        // eslint-plugin-boundaries 的元素划分 + 别名解析器（见上方长注释）。
        ...BOUNDARIES_SETTINGS,
        shadcn: {
            // 识别设计系统组件：apps 一律从 @shop/ui-web 导入（110 个文件）
            ui: "@shop/ui-web",
            // 追加到每一条 shadcn/* 报错末尾：DESIGN.md 是视觉规则唯一真相源，让 agent 拿到报错时同时拿到"去哪儿查"。
            note: "See packages/ui-web/DESIGN.md for design rules and approved exceptions.",
        },
    },

    rules: {
        "import/no-cycle": "warn",

        // ── 架构边界（eslint-plugin-boundaries）── 跨域只许对方 barrel；细节与「为什么不用 fallow 的 boundaries」见上方 BOUNDARIES_* 注释。值就地写而不抽 const：抽出去会丢这里的上下文类型（规则值是 `[severity, options]` 元组，脱离 DummyRuleMap 会被推成联合数组而报 TS2322）。
        "boundaries/dependencies": [
            "error",
            {
                default: "allow",
                policies: [
                    // 先禁「域→域」所有深路径，再放行 barrel——策略按序处理、后写覆盖先写。同元素内导入（`./mapper`、`#/order/queries` 从 order 自引）不参与判定，所以不用给域内自引用开口子（实测 seller/order 里有 56 处这种别名自引用）。
                    {
                        from: { element: { type: "domain" } },
                        to: { element: { type: "domain" } },
                        disallow: { to: { element: { fileInternalPath: "**" } } },
                        message:
                            "跨域只能取对方的公开入口（对方的 index.ts），不能深入域内部文件：" +
                            "把 `#/<域>/<文件>` 改成 `#/<域>`。域内部文件是私有实现，绕过 barrel 会让对方无法重构" +
                            "（约定见 docs/conventions/frontend.md）。" +
                            "违规边：{{from.element.path}} → {{to.element.path}}",
                    },
                    {
                        from: { element: { type: "domain" } },
                        to: { element: { type: "domain" } },
                        allow: { to: { element: { fileInternalPath: "index.ts" } } },
                    },
                ],
            },
        ],

        // ── @shadcn/lint ── 全量开启。no-restyle 基线 allow 见 NO_RESTYLE_ALWAYS_ALLOWED：页面可定位置与宽度、外观（间距/形状/颜色/字体）归组件自己管——与 DESIGN.md 的「复用优先/primary 纪律」同源。
        "shadcn/no-restyle": [
            "error",
            {
                allow: NO_RESTYLE_ALWAYS_ALLOWED,
                // 只给「结构上必须由调用方定」的类别开口子（Skeleton 圆角要跟替身一致、Empty 垂直留白随语境变、truncate 是单行省略且行数档已由 ItemTitle/ItemDescription 的 lines prop 承接）。
                // 坑：contract 的 allow 是「整值替换」不是「向顶层 allow 追加」，所以每条都得显式带上 NO_RESTYLE_ALWAYS_ALLOWED，否则一写 contract 就把 required-mark/tabular-nums 的全局放行弄丢。
                contracts: [
                    { pattern: "^Skeleton$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "shape"] },
                    { pattern: "^Empty$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "spacing"] },
                    { pattern: "^ItemTitle$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "truncate"] },
                    {
                        pattern: "^ItemDescription$",
                        allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "truncate"],
                    },
                    // ItemActions 只有一处要更宽横向间隔：结账页把两列 w-20 金额并排放动作槽里，基类 gap-2 会挤成一块。为 1 处加 variant 不值得，按类名开口子。
                    { pattern: "^ItemActions$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "gap-6"] },
                    // CardContent 基类只有左右内边距（px-(--card-spacing)）、无 display 无 gap，调用方给 flex/grid 就必然要给 gap——flex 已放行、gap 拦，是同一件事，故 gap-* 归 layout。（Card 不在此列：它自己 flex flex-col gap，gap 归它管。）
                    { pattern: "^CardContent$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "gap-*"] },
                    // DropdownMenuTrigger 是纯透传（无 cva、无基类 className），没有任何自己的皮肤可"拥有"，插件那句「<X> owns its shape」在这里是空的——调用方写的每个类都被误判越权。而调用方本就该是它的皮肤（SiteNav 导航项与相邻 <Link> 共用同一 navItemClass；SiteHeader 的是 Avatar 外壳）。故这个组件上放行全部类名。
                    { pattern: "^DropdownMenuTrigger$", allow: ["*"] },
                    // 登录表单 size="lg" 那行的内部水平节奏（14px）："+86" 前缀、验证码输入、发送按钮共用同一内边距才像一体。不塞进 size="lg" 的类里——那会连带改掉该尺寸下所有子件（含密码框），而这里是「这一行的三个位置」不是「这个尺寸的通用值」。
                    {
                        pattern: "^(InputGroupInput|InputGroupText|InputGroupButton)$",
                        allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "px-3.5"],
                    },
                    // 店铺 logo 的占位首字要更醒目（"字母当 logo 用"，非正文）。只放行这一个字重，不往 AvatarFallback 基类加——那会连带改掉四处用户头像。
                    {
                        pattern: "^AvatarFallback$",
                        allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "font-bold"],
                    },
                    // Spinner 是 size-4 animate-spin 的裸 lucide 图标、颜色走 currentColor，永远是「替身的那个颜色」（替图标是 muted-foreground、替 CTA 是 primary，由上下文定）；组件自身无从自持，只放行这两个语义色。
                    {
                        pattern: "^Spinner$",
                        allow: [
                            ...NO_RESTYLE_ALWAYS_ALLOWED,
                            "text-primary",
                            "text-muted-foreground",
                        ],
                    },

                    // ── 容器类：`gap-*` 在这里是「子元素排布」而非「自身外观」──
                    // 判据同 space-*：这些组件基类不自己定 display（CardTitle 只有字体、RadioGroup 是 grid gap-2、SidebarMenu 是 ul、TopBar 家族是顶栏三段排布），调用方给了 flex/grid 就必然要给 gap——flex 已放行、gap 却拦，是同一件事。自带皮肤的叶子组件（Button/Badge/Input/ItemActions…）继续拦。
                    { pattern: "^CardTitle$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "gap-*"] },
                    { pattern: "^RadioGroup$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "gap-*"] },
                    { pattern: "^SidebarMenu$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "gap-*"] },
                    {
                        pattern: "^(TopBar|TopBarBrand|TopBarActions)$",
                        allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "gap-*"],
                    },

                    // ── 一次性：窄到具体类名，每条都写清来源 ──
                    // 欢迎页的「悬停上浮」卡片（位移由调用方给，过渡跟着它一起写在这一处）
                    {
                        pattern: "^Card$",
                        allow: [
                            ...NO_RESTYLE_ALWAYS_ALLOWED,
                            "transition-transform",
                            "duration-200",
                        ],
                    },
                    // 登录弹窗是自定义排版的对话框：整块内容自带 padding 与节奏（顶部还有绝对定位的环境光），故外层要 `p-0 gap-0`。DialogContent 没有 variant 维度，1 个站点不值得为它加。
                    {
                        pattern: "^DialogContent$",
                        allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "p-0", "gap-0"],
                    },
                    // 账号菜单里的用户名可能很长，截断是「显示能力」（同 ItemTitle/ItemDescription 的 truncate）
                    {
                        pattern: "^DropdownMenuLabel$",
                        allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "truncate"],
                    },
                    // 外层绝对定位了一个前置搜索图标，输入框得让出左侧位置（同上，图标由调用方管）
                    { pattern: "^Input$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "pl-8"] },
                    // 智能粘贴框：多行输入要四周 12px（基类只给 py-2 + 单行内边距）
                    {
                        pattern: "^InputGroupTextarea$",
                        allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "p-3"],
                    },
                    // 购物车数量步进器的中间格：两边是 − / + 按钮，只要左右描边、白底，且格子是固定宽度（w-8）居中的数字，不能有内边距。
                    {
                        pattern: "^ButtonGroupText$",
                        allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "border-x", "bg-background", "px-0"],
                    },
                ],
            },
        ],
        // shadow-float/lift 是主题声明的自定义阴影 token（ui-web/styles.css @theme），插件只认 Tailwind 内置 shadow-sm/md/lg、认不出自定义 --shadow-* 命名空间，于是当成"未声明颜色"报错。只放行这两个具体 token，不用 shadow-* 通配——shadow-<color> 是合法颜色用法，通配会关掉真检查。
        "shadcn/no-raw-colors": ["error", { allow: ["shadow-float", "shadow-lift"] }],
        "shadcn/no-arbitrary-values": "error",
        "shadcn/no-inline-styles": "error",
        // 同 no-raw-colors 那个插件局限：主题构建器认不出 Tailwind v4 自定义命名空间的 token（--container-page→max-w-page、--z-index-sticky→z-sticky、--min-height-page-center、--max-height-dialog-body）和 tw-animate-css 的 animate-in，一律报 "unknown class"。已逐个用三端构建产物验过这些类真生成了规则、报错全是误报。只放行这九个具体 token，不用 max-w-*/z-* 通配——通配会把真拼写错误的检查一起关掉。
        "shadcn/no-unknown-classes": [
            "error",
            {
                allow: [
                    "max-w-page",
                    "max-w-narrow",
                    "z-sticky",
                    "z-raised",
                    "z-chrome",
                    "z-overlay",
                    "min-h-page-center",
                    "max-h-dialog-body",
                    "animate-in",
                ],
            },
        ],
        "shadcn/require-static-classes": "error",

        // ── type-aware（需 lint 脚本带 --type-aware，依赖 oxlint-tsgolint）── 防止「死防御」回流（类型已保证非空还写 ?./?? 0/恒真条件）。前置：tsconfig 已开 noUncheckedIndexedAccess（否则 arr[i]/record[k] 存在性检查全量误报）。仅存 2 处豁免（use-product-draft 的 cancelled）是 tsgolint 不追踪跨闭包赋值窄化的已知局限，已用行内 oxlint-disable 注明。
        "typescript/no-unnecessary-condition": "error",
        // 忘了 await/void 的 Promise：error（存量 17 处已补 void，回归即拦）
        "typescript/no-floating-promises": "error",
        // 类型感知的断言体检：多余的断言删掉；护栏式断言（带 in 检查的 as ShopReviewStatus 等）保留为 warn
        "typescript/no-unnecessary-type-assertion": "warn",
        "typescript/no-unsafe-type-assertion": "warn",
        "typescript/no-unnecessary-boolean-literal-compare": "warn",
        "typescript/no-meaningless-void-operator": "warn",
        // SDK 生成的方法不用 this，作为回调传递（useCaptcha(AuthApi.getCaptcha)）会误报，降 warn
        "typescript/unbound-method": "warn",
        // 与仓库惯例冲突：组件里 `return;`（undefined）与 `return <JSX>` 混用是常见早退模式
        "typescript/consistent-return": "off",

        // ── error — 安全无争议 ──
        "unicorn/error-message": "error",
        "unicorn/throw-new-error": "error",
        "unicorn/no-typeof-undefined": "error",
        "unicorn/no-negation-in-equality-check": "error",
        "unicorn/no-static-only-class": "error",
        "unicorn/no-this-assignment": "error",
        "unicorn/prefer-date-now": "error",
        "unicorn/prefer-node-protocol": "error",
        "unicorn/prefer-optional-catch-binding": "error",
        "unicorn/require-array-join-separator": "error",
        "unicorn/require-number-to-fixed-digits-argument": "error",
        "unicorn/no-object-as-default-parameter": "error",

        // ── @tanstack/eslint-plugin-query（官方 recommended 集合）──
        // exhaustive-deps：queryFn 里引用了没写进 queryKey 的变量（错 key 缓存 + 不重取）
        "tanstack-query/exhaustive-deps": "error",
        // 组件体内 new QueryClient()（每次渲染新缓存，React Query 最常见的坑）
        "tanstack-query/stable-query-client": "error",
        // 把 useQuery 返回对象整个塞进依赖数组（该对象逐次渲染不稳定 → 无限循环）
        "tanstack-query/no-unstable-deps": "error",
        // 属性顺序：queryFn 必须排在 getNextPageParam 之前，否则类型推断失效（--fix 可自动重排）
        "tanstack-query/infinite-query-property-order": "error",
        // 属性顺序：onMutate 必须排在 onError / onSettled 之前（--fix 可自动重排）
        "tanstack-query/mutation-property-order": "error",
        // rest 解构整个 query 结果会观察所有变更 → 多余重渲染（官方 recommended 给 warn）
        "tanstack-query/no-rest-destructuring": "warn",
        // 要求 queryKey + queryFn 收进 queryOptions() 共置。官方只在 recommendedStrict 里给 error，本仓库本就是 options 收敛口径（域内 queries.ts 一个真相源），故直接开 warn 当护栏。
        "tanstack-query/prefer-query-options": "warn",
        // no-void-query-fn 不注册：该规则靠 parserServices.program 拿 TS 类型，oxlint 的 JS plugin API 不提供类型信息（--type-aware 也无效，实测静默空转），注册只会给人"已检查"的错觉。

        // ── @tanstack/eslint-plugin-router（官方 recommended 两条都开）── createFileRoute 属性顺序（beforeLoad→loader→…，错序 loader 拿不到 beforeLoad 上下文类型，--fix 可重排）；路由参数名必须是合法 JS 标识符（`$bad-name` 这类在 param 解析处静默变 undefined）。
        "tanstack-router/create-route-property-order": "error",
        // 路由参数名必须是合法 JS 标识符（`$bad-name` 这类在 param 解析处静默变 undefined）
        "tanstack-router/route-param-names": "error",

        // React 19 自动 JSX 转换，不需要显式 import React
        "react/react-in-jsx-scope": "off",

        // ── React Doctor ── 从官方 RECOMMENDED_RULES（566 条）中先全量跑过项目，按命中分布挑「真问题」warn 暴露，噪音源显式 off。注意 React Compiler 已启用（reactCompilerPreset），内联函数/对象/数组 prop 由编译器自动 memo，故 jsx-no-new-* 属过时建议，不开。
        "react-doctor/jsx-no-new-function-as-prop": "off",
        "react-doctor/jsx-no-new-object-as-prop": "off",
        "react-doctor/jsx-no-new-array-as-prop": "off",
        "react-doctor/jsx-no-jsx-as-prop": "off",
        // react-refresh 风格规则，与仓库「组件+逻辑+常量同文件混出」的领域层惯例冲突
        "react-doctor/only-export-components": "off",
        // ── warn：真实问题，先暴露后清理 ──
        "react-doctor/no-adjust-state-on-prop-change": "warn",
        "react-doctor/button-has-type": "warn",
        "react-doctor/no-high-complexity-react-function": "warn",
        "react-doctor/js-set-map-lookups": "warn",
        "react-doctor/prefer-tag-over-role": "warn",
        "react-doctor/no-array-index-key": "warn",
        "react-doctor/no-giant-component": "warn",
        "react-doctor/role-supports-aria-props": "warn",
        "react-doctor/no-pass-data-to-parent": "warn",
        "react-doctor/no-transition-all": "warn",
        "react-doctor/no-reset-all-state-on-prop-change": "warn",
        // SSR 安全：模块顶层/渲染期裸用浏览器全局会炸服务端
        "react-doctor/no-unguarded-browser-global-at-module-scope": "warn",
        "react-doctor/no-unguarded-browser-global-in-render-or-hook-init": "warn",
        // 中文输入法：回车提交需 IME composition 守卫，否则拼音上屏即误提交
        "react-doctor/no-enter-submit-without-ime-composition-guard": "warn",

        // ── warn — 推荐写法 ──
        // 领域层约定：对外兼容 null，对内只用 undefined（用 ?./?? 判空，不写 null 字面量）。存量 98 处 null（多为 useState(null)/|| null 兜底），先 warn 暴露，清完再升 error。
        "no-null": "warn",
        // React Compiler 诊断规则（oxlint 1.81 起默认 error）：代码库大量有意用 setState-in-effect 做防抖/同步、第三方 hook 不可 memo、deps 排他——属推荐性建议非正确性错误，降 warn 不阻断。
        "react/set-state-in-effect": "warn",
        "react/incompatible-library": "warn",
        "react/exhaustive-effect-dependencies": "warn",
        // 命名约定是两级的（槽位名 kebab / 专名 Pascal，判据见 docs/conventions/frontend.md），一个 case 设置表达不了：选 kebab 把 web/seller 组件文件全判违规，选 pascal 把 admin 全判违规；per-directory override 也切不开同目录内混住的 queries.ts 与 OrderCard.tsx。开它就是几百条恒定噪音，故 off，靠 review 与文档收敛。
        "unicorn/filename-case": "off",
        "unicorn/prefer-includes": "warn",
        "unicorn/prefer-string-slice": "warn",
        "unicorn/prefer-string-replace-all": "warn",
        "unicorn/prefer-array-some": "warn",
        "unicorn/prefer-regexp-test": "warn",
        "unicorn/prefer-structured-clone": "warn",
        "unicorn/prefer-native-coercion-functions": "warn",
        "unicorn/prefer-default-parameters": "warn",
        "unicorn/prefer-logical-operator-over-ternary": "warn",
        "unicorn/prefer-number-properties": "warn",
        // 浏览器/SSR 下 window 是标准且正确的写法，globalThis 属误报
        "unicorn/prefer-global-this": "off",
        "unicorn/prefer-class-fields": "warn",
        "unicorn/prefer-export-from": "warn",
        "unicorn/prefer-negative-index": "warn",
        "unicorn/prefer-spread": "warn",
        "unicorn/catch-error-name": "warn",
        "unicorn/prefer-top-level-await": "warn",
        "unicorn/prefer-import-meta-properties": "warn",
        "unicorn/no-unreadable-array-destructuring": "warn",
        "unicorn/no-zero-fractions": "warn",
        "unicorn/number-literal-case": "warn",
        "unicorn/no-console-spaces": "warn",
        // 与 oxfmt 冲突：oxfmt 会剥掉嵌套三元的外层括号，本规则又要括号，同文件无法同时满足。排版交给 formatter
        "unicorn/no-nested-ternary": "off",
        "unicorn/no-await-expression-member": "warn",
        "unicorn/no-useless-promise-resolve-reject": "warn",
        "unicorn/no-useless-switch-case": "warn",
        "unicorn/no-anonymous-default-export": "warn",
        // unicorn --fix 的 prefer-set-has 把只读常量数组改成 new Set([...])，却不动它的 `: readonly string[]` 注解、调用点改成 .has()——改完 tsc 直接 TS2740/TS2339。fixer 不跑类型检查，对带显式类型注解的目标必然改坏（实测 sdk-client.ts）。判据同下方 no-useless-type-assertion：会破坏类型安全的自动修复一律 off。
        "unicorn/prefer-set-has": "off",
        "unicorn/prefer-at": "warn",
        "unicorn/prefer-array-flat": "warn",
        "unicorn/prefer-type-error": "warn",
        "unicorn/no-new-buffer": "warn",
        "unicorn/no-lonely-if": "warn",
        "unicorn/explicit-length-check": "warn",
        "unicorn/no-negated-condition": "warn",
        "unicorn/prefer-string-trim-start-end": "warn",
        "unicorn/prefer-single-call": "warn",
        // oxlint --fix 会误删 React 19 类型签名必需的 undefined（如 useRef<T>(undefined)、getServerSnapshot 返回值），删后直接 typecheck 报错。关闭以免自动修复破坏类型安全的代码。
        "unicorn/no-useless-undefined": "off",
    },

    overrides: [
        {
            // 组件自己就是设计系统的定义处，必须允许自我造型：官方要求 no-restyle/no-arbitrary-values/require-static-classes 三条在组件目录内关闭（no-raw-colors 等仍生效，组件也该用 token）。
            // ⚠️ oxlint glob 语义（实测）：override.files 的相对路径不认 `..`、也不按本配置文件目录解析——本配置在 packages/config/，写 `packages/...` 或 `../../packages/...` 都匹配不到任何文件（静默失效不报错），必须用 `**/packages/...` 前缀；目录通配要写 `dir/**/*`，`dir/**` 匹配不到 dir 下一层文件。
            files: ["**/packages/ui-web/src/components/**/*"],
            rules: {
                "shadcn/no-restyle": "off",
                "shadcn/no-arbitrary-values": "off",
                "shadcn/require-static-classes": "off",
            },
        },
        {
            // reui Cascader / DataGrid / Tree 等第三方 vendored 组件：只过类型检查，不过本仓库面向「第一方 UI」的 lint 规则。下面每条都经实测核过「不是缺陷」：no-unnecessary-condition 命中的是刻意运行时防御或直接误报（HTMLElement.textContent 在 lib.dom 就是 string|null）；jsx-a11y/* 是手写 WAI-ARIA 复合控件，模式匹配会在刻意正确写法上报（role=group 不该换 fieldset、group+onKeyDown 合法、chevron span 刻意不给 keydown 因下钻已在 listbox/option 层接管）；no-inline-styles/no-raw-colors 是虚拟列表动态高度与组件自有配色，改它就是 fork；exhaustive-deps 全是有意依赖选择；const-comparisons 是 `icon && icon` 惯用误报；no-base-to-string 是有意的 unknown 回退；no-autofocus 是编辑器浮层打开即聚焦的功能本身。
            files: ["**/packages/ui-web/src/components/reui/**/*"],
            rules: {
                "typescript/no-unnecessary-condition": "off",
                "jsx-a11y/prefer-tag-over-role": "off",
                "jsx-a11y/no-noninteractive-element-interactions": "off",
                "jsx-a11y/click-events-have-key-events": "off",
                "jsx-a11y/no-static-element-interactions": "off",
                "jsx-a11y/aria-role": "off",
                "jsx-a11y/no-autofocus": "off",
                "shadcn/no-inline-styles": "off",
                "shadcn/no-raw-colors": "off",
                "react-hooks/exhaustive-deps": "off",
                "oxc/const-comparisons": "off",
                "typescript/no-base-to-string": "off",
                "unicorn/no-useless-fallback-in-spread": "off",

                // 正确性仍由 tsc（strict + noUncheckedIndexedAccess）全程把关。
                // ── 风格与建议类整族关闭（实测 581 条噪音的全部来源）── 上面那 13 条按"逐条核过不是缺陷"关；这批不同：即便成立也不是我们的债。reui/** 只有 data-grid 与 cascader 两处，命中项 100% 落这俩目录，第一方同类规则不受影响。判据：这些建议要么改它就是 fork（prefer-at/spread/no-shadow），要么是第三方无义务遵守的第一方约定（no-null），要么是对既有第三方代码的架构点评（no-giant-component/复杂度）。留着 618 条 warning 里 581 条是别人的，告警面读不出趋势。⚠️ key 写法必须对得上（输出是 `unicorn(no-null)`，顶层却写裸 `no-null`）——写错不报错、静默不匹配，改完这块要复跑 `vp check` 数 reui 命中数。
                "unicorn/no-null": "off",
                "unicorn/prefer-export-from": "off",
                "unicorn/explicit-length-check": "off",
                "unicorn/prefer-at": "off",
                "unicorn/prefer-spread": "off",
                "unicorn/prefer-logical-operator-over-ternary": "off",
                "unicorn/consistent-function-scoping": "off",
                "unicorn/no-negated-condition": "off",
                "unicorn/no-lonely-if": "off",
                "unicorn/prefer-string-replace-all": "off",
                "unicorn/no-array-sort": "off",
                "unicorn/no-array-reverse": "off",
                "eslint/no-shadow": "off",
                "eslint/no-underscore-dangle": "off",
                "promise/always-return": "off",
                "typescript/no-unsafe-type-assertion": "off",
                "typescript/no-unnecessary-type-assertion": "off",
                "typescript/no-unnecessary-type-arguments": "off",
                "typescript/no-unnecessary-type-conversion": "off",
                "typescript/no-unnecessary-type-parameters": "off",
                "typescript/no-meaningless-void-operator": "off",
                "typescript/no-unnecessary-boolean-literal-compare": "off",
                "react/no-array-index-key": "off",
                "react/jsx-no-constructed-context-values": "off",
                "react/set-state-in-effect": "off",
                "react-doctor/no-array-index-key": "off",
                "react-doctor/no-giant-component": "off",
                "react-doctor/no-high-complexity-react-function": "off",
                "react-doctor/no-adjust-state-on-prop-change": "off",
                "react-doctor/js-set-map-lookups": "off",
                "react-doctor/prefer-tag-over-role": "off",
            },
        },
        {
            // ImageUploadGrid 的空位瓦片是纯占位槽（无数据、无增删重排语义），索引 key 是唯一合理选择。原写法 `packages/.../image-upload.tsx` 因下述 glob 语义（相对路径不解析）一直是死配置，此处补 `**/` 前缀修好。
            files: ["**/packages/ui-web/src/components/image-upload.tsx"],
            rules: {
                "react/no-array-index-key": "off",
                "react-doctor/no-array-index-key": "off",
            },
        },
        {
            // 测试夹具与 MSW handler 必须镜像 wire 契约：SDK 生成类型是 `T | null`（required+nullable，undefined 不可赋值）、zod schema 是 `.nullable()`（同样不接受 undefined）、MSW 空响应也要 `new HttpResponse(null,…)`。夹具不写 null 就过不了类型/契约校验——属「对外兼容 null」的正当使用，no-null 只约束内部代码，对测试整体豁免。
            files: ["**/*.test.ts", "**/*.test.tsx", "**/packages/test-utils/**"],
            rules: { "no-null": "off" },
        },
        {
            // 造数脚本的列值数组直接拼进 SQL VALUES，null 就是字面量 NULL 的唯一写法（undefined 会被序列化丢失语义）；领域层的 no-null 约定不适用。
            files: ["**/scripts/**/*"],
            rules: { "no-null": "off" },
        },
        {
            // subs 分组/词条在契约（NavGroup）里没有行身份，编辑器又是受控输入+整段有序移动：内容 key 会撞名重挂载丢焦点，索引 key 在这里是正确选择（值全受控，重排后渲染仍对得上数据）。与 image-upload 豁免同理。
            files: ["**/apps/admin/src/cms/nav/subs-editor.tsx"],
            rules: {
                "react/no-array-index-key": "off",
                "react-doctor/no-array-index-key": "off",
            },
        },
        {
            // 前台导航是纯展示（无输入状态、会话内不重排），分组同样没有行身份；内容 key 反而可能在重名分组上撞 key。索引 key 按展示语义豁免。
            files: ["**/apps/web/src/home/HomeCategoryNav.tsx"],
            rules: {
                "react/no-array-index-key": "off",
                "react-doctor/no-array-index-key": "off",
            },
        },
    ],

    // 忽略不在这份文件、也不在仓库根 `.eslintignore`（已删）：oxlint 的 ignorePatterns 按配置文件所在目录解析，而生效的配置是根 `vite.config.ts` 的 `lint` 块，故忽略住那里才对（见其 GENERATED/LINT_ONLY 与判据）。`overrides` 里的 `**/` 前缀不受影响——那按仓库根匹配。fallow 也不读那一份，它有自己的 .fallowrc.json。
} satisfies OxlintConfig

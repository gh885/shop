import { defineConfig } from "oxlint"

/** no-restyle 里「全局都放行」的类名，任何组件上都成立：
 *  - layout：位置与宽度由页面定，外观归组件 —— 官方推荐基线
 *  - space-*：`space-y-*` / `space-x-*` 改的是**子元素之间的间隔**（给子元素加 margin），
 *    永远不可能是在描述元素自己的外观，所以它就是布局原语，和 `flex` / `w-*` 同类。
 *    注意 `gap-*` 不在此列：`gap-1` 在 Button 上就是"图标与文字的距离"，那是自身外观，
 *    只有「连 display 都不自己定的容器」才另开。
 *  - required-mark：ui-web 自带的必填星号伪元素 utility（styles.css @utility），
 *    属设计系统提供的类名（语义同 sr-only），不是调用方手搓的样式
 *  - tabular-nums：只让数字等宽，改不了字号/字重/字族，DESIGN.md 第 70 行
 *    本就要求 B 端数字列用它 */
const NO_RESTYLE_ALWAYS_ALLOWED = ["layout", "space-*", "required-mark", "tabular-nums"]

export default defineConfig({
    // JS 插件（Oxlint 1.80+ 的 JS plugin API，官方标注 alpha）：
    // @shadcn/lint 是面向 agent 的设计系统 linter —— 报错文本里带"该用什么"，
    // 建议直接来自 packages/ui-web 的组件 variants / sizes 与 styles.css 的 theme token。
    jsPlugins: [
        "@shadcn/lint",
        // React Doctor：命名空间 react-doctor/*（287 条规则：架构/性能/正确性/安全/a11y/包体积 + react-builtins）。
        // 必须用 { name, specifier } 对象形式注册，否则 oxlint 认不出命名空间、静默不加载。
        { name: "react-doctor", specifier: "oxlint-plugin-react-doctor" },
        // ── TanStack 官方 ESLint 插件（经 oxlint JS plugin API 加载）──
        // 官方命名空间是 @tanstack/query 与 @tanstack/router（带 `/`），oxlint 侧一律改成
        // `tanstack-query` / `tanstack-router`。实测：8/9 条规则可用，no-void-query-fn 不可用（见 rules 段）。
        { name: "tanstack-query", specifier: "@tanstack/eslint-plugin-query" },
        { name: "tanstack-router", specifier: "@tanstack/eslint-plugin-router" },
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
        shadcn: {
            // 识别设计系统组件：apps 一律从 @shop/ui-web 导入（110 个文件）
            ui: "@shop/ui-web",
            // 追加到每一条 shadcn/* 报错末尾。DESIGN.md 是视觉规则唯一真相源，
            // 让 agent 拿到报错时同时拿到"去哪儿查"。
            note: "See packages/ui-web/DESIGN.md for design rules and approved exceptions.",
        },
    },

    rules: {
        "import/no-cycle": "warn",

        // ── @shadcn/lint ──
        // 全量开启。no-restyle 基线 allow: ["layout"]：
        // 页面可以定位置与宽度，外观（间距/形状/颜色/字体）归组件自己管 ——
        // 与 DESIGN.md 的「复用优先 / primary 纪律」同源。
        "shadcn/no-restyle": [
            "error",
            {
                allow: NO_RESTYLE_ALWAYS_ALLOWED,
                // 只给「结构上必须由调用方定」的类别开口子：
                // Skeleton 的圆角要跟它替身一致；Empty 的垂直留白随页面语境变。
                // truncate 是单行省略（内容显示能力），行数档已由 ItemTitle/ItemDescription 的
                // lines prop 承接（line-clamp-* 不再放行）。
                //
                // 坑：contract 的 allow 是「整值替换」而不是「向顶层 allow 追加」，
                // 所以每条都得显式带上 NO_RESTYLE_ALWAYS_ALLOWED，否则一写 contract
                // 就把 required-mark / tabular-nums 的全局放行弄丢了。
                contracts: [
                    { pattern: "^Skeleton$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "shape"] },
                    { pattern: "^Empty$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "spacing"] },
                    { pattern: "^ItemTitle$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "truncate"] },
                    {
                        pattern: "^ItemDescription$",
                        allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "truncate"],
                    },
                    // ItemActions 只有一处要更宽的横向间隔：结账页把两列 w-20 的金额并排放在
                    // 动作槽里，基类 gap-2 会把两列挤成一块。为 1 处加 variant 不值得，按类名开口子。
                    { pattern: "^ItemActions$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "gap-6"] },
                    // CardContent 的基类**只有左右内边距**（`px-(--card-spacing)`），
                    // 既没有 display 也没有 gap —— 调用方必然要自己给 `flex`/`grid`，给了 display
                    // 就必然要自己给 `gap`。`flex` 是 layout 已放行、`gap` 却要拦，这两者是同一件事，
                    // 所以 CardContent 上的 gap-* 同属 layout。
                    // （`Card` 不在此列：它自己是 `flex flex-col gap-(--card-spacing)`，gap 归它管。）
                    { pattern: "^CardContent$", allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "gap-*"] },
                    // DropdownMenuTrigger 自身是**纯透传**
                    // （`<MenuPrimitive.Trigger {...props} />`，无 cva、无基类 className），
                    // 它没有任何自己的皮肤可"拥有"——插件的「<X> owns its shape」这句话在这里是空的，
                    // 于是调用方写的每一个类都被判成越权。而调用方本来就该是它的皮肤：
                    //   · SiteNav 的导航项与旁边的普通 <Link> 共用同一个 `navItemClass` 常量
                    //     （同一个导航项，只是"有子菜单的那个"恰由 Trigger 承载）——
                    //     给 Trigger 加 variant 会把这套样式抄成第二份，反而制造漂移；
                    //   · SiteHeader 的是 Avatar 的外壳（圆形焦点环）。
                    // 结论：这个组件上放行全部类名，并在注释里留下结构性理由。
                    { pattern: "^DropdownMenuTrigger$", allow: ["*"] },
                    // 登录表单 size="lg" 那一行的**内部水平节奏**（14px）："+86" 前缀、
                    // 验证码输入、发送按钮三者共用同一个内边距，整行看起来才是一体。
                    // 不把它塞进 size="lg" 的类里：那会连带改掉该 size 下所有子件（含密码框），
                    // 而这里是「这一行的三个位置」而不是「这个尺寸的通用值」。
                    {
                        pattern: "^(InputGroupInput|InputGroupText|InputGroupButton)$",
                        allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "px-3.5"],
                    },
                    // 店铺 logo 的占位首字要更醒目（它是"字母当 logo 用"，不是正文）。
                    // 只放行这一个字重，不往 AvatarFallback 基类加——那会连带改掉四处用户头像。
                    {
                        pattern: "^AvatarFallback$",
                        allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "font-bold"],
                    },
                    // Spinner 是 `size-4 animate-spin` 的裸 lucide 图标，颜色走 currentColor，
                    // 永远是「它替身的那个颜色」：替掉的图标是 muted-foreground、替掉的 CTA 是
                    // primary，都由上下文决定，组件自身无从自持。只放行这两个语义色。
                    {
                        pattern: "^Spinner$",
                        allow: [
                            ...NO_RESTYLE_ALWAYS_ALLOWED,
                            "text-primary",
                            "text-muted-foreground",
                        ],
                    },

                    // ── 容器类：`gap-*` 在这里是「子元素排布」而不是「自身外观」 ──
                    // 判据同 `space-*`：这些组件的基类**不自己定 display**（或整条就是一条 flex 排布），
                    // 调用方给了 `flex`/`grid` 就必然要给 `gap`——`flex` 是 layout 已放行、
                    // `gap` 却要拦，这两件事是同一件。叶子/自带皮肤的组件（Button、Badge、Input、
                    // ItemActions、PanelHeader…）继续拦，那里 `gap` 就是图标与文字的距离。
                    //   · CardTitle 基类只有字体，没有 display；
                    //   · RadioGroup 基类是 `grid gap-2`，调用方改成 `flex` 后 gap 必须跟着走；
                    //   · SidebarMenu 是 `<ul>`，gap 就是菜单项的排布；
                    //   · TopBar 家族（TopBar/TopBarBrand/TopBarActions）是顶栏的三段排布。
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
                    // 登录弹窗是自定义排版的对话框：整块内容自带 padding 与节奏（顶部还有绝对定位的环境光），
                    // 所以外层要 `p-0 gap-0`。`DialogContent` 没有 variant 维度，1 个站点不值得为它加。
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
                    // 购物车数量步进器的中间格：两边是 − / + 按钮，所以只要左右描边、白底，
                    // 且格子是固定宽度（w-8）居中的数字，不能有内边距
                    {
                        pattern: "^ButtonGroupText$",
                        allow: [...NO_RESTYLE_ALWAYS_ALLOWED, "border-x", "bg-background", "px-0"],
                    },
                ],
            },
        ],
        // shadow-float / shadow-lift 是主题里声明的自定义阴影 token（ui-web/styles.css @theme），
        // 但插件只认 Tailwind 内置的 shadow-sm/md/lg，认不出自定义 --shadow-* 命名空间，
        // 于是把它当成"未声明的颜色"报错（实测：shadow-sm/md/lg 通过，shadow-float/lift 被报）。
        // 只放行这两个具体 token，不用 shadow-* 通配——shadow-<color> 是合法的颜色用法，通配会关掉真检查。
        "shadcn/no-raw-colors": ["error", { allow: ["shadow-float", "shadow-lift"] }],
        "shadcn/no-arbitrary-values": "error",
        "shadcn/no-inline-styles": "error",
        "shadcn/no-unknown-classes": "error",
        "shadcn/require-static-classes": "error",

        // ── type-aware（需 lint 脚本带 --type-aware，依赖 oxlint-tsgolint）──
        // 防止「死防御」回流：类型已保证非空还写 ?. / ?? 0 / 恒真条件。
        // 前置：tsconfig 已开 noUncheckedIndexedAccess（否则 arr[i] / record[k] 的存在性检查会全量误报）。
        // 仅存的 2 处豁免（use-product-draft 的 cancelled）是 tsgolint 不追踪跨闭包赋值窄化的已知局限，
        // 已用行内 oxlint-disable 注明原因。
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
        // 要求 queryKey + queryFn 收进 queryOptions() 共置。官方只在 recommendedStrict 里给 error，
        // 本仓库本就是 options 收敛口径（域内 queries.ts 一个真相源），故直接开 warn 当护栏。
        "tanstack-query/prefer-query-options": "warn",
        // no-void-query-fn 不注册：该规则靠 context.sourceCode.parserServices.program 拿 TS 类型，
        // oxlint 的 JS plugin API 不提供类型信息（--type-aware 也无效，实测规则静默空转），
        // 注册只会给人"已检查"的错觉。

        // ── @tanstack/eslint-plugin-router（官方 recommended 集合：两条都开）──
        // createFileRoute / createRoute 的属性顺序（beforeLoad → loader → …），顺序错会让
        // loader 拿不到 beforeLoad 的上下文类型；--fix 可自动重排
        "tanstack-router/create-route-property-order": "error",
        // 路由参数名必须是合法 JS 标识符（`$bad-name` 这类在 param 解析处静默变 undefined）
        "tanstack-router/route-param-names": "error",

        // React 19 自动 JSX 转换，不需要显式 import React
        "react/react-in-jsx-scope": "off",

        // ── React Doctor（oxlint-plugin-react-doctor，命名空间 react-doctor/*）──
        // 从官方 RECOMMENDED_RULES（566 条）中精选：先全量跑过一遍项目，
        // 按命中分布挑出「真问题」warn 暴露；5 条噪音源显式 off（理由如下）。
        // 注意：React Compiler 已启用（reactCompilerPreset），内联函数/对象/数组
        // prop 由编译器自动 memo，以下 jsx-no-new-* 属 compiler 时代的过时建议，不开。
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
        // 领域层约定：对外兼容 null，对内只用 undefined（用 ?. / ?? 判空，不写 null 字面量）。
        // 存量 98 处 null（多为 useState(null) / || null 兜底），先 warn 暴露，清完再升 error
        "no-null": "warn",
        // React Compiler 诊断规则（oxlint 1.81 起默认 error）：代码库大量有意用 setState-in-effect
        // 做防抖/同步、第三方 hook 不可 memo、deps 排他——属推荐性建议，非正确性错误，降为 warn 不阻断
        "react/set-state-in-effect": "warn",
        "react/incompatible-library": "warn",
        "react/exhaustive-effect-dependencies": "warn",
        // 仓库混用 PascalCase 组件 + kebabCase 工具/hook/路由，单一 case 规则无法满足全部，关闭以免恒定噪音
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
        "unicorn/prefer-at": "warn",
        "unicorn/prefer-array-flat": "warn",
        "unicorn/prefer-type-error": "warn",
        "unicorn/no-new-buffer": "warn",
        "unicorn/no-lonely-if": "warn",
        "unicorn/explicit-length-check": "warn",
        "unicorn/no-negated-condition": "warn",
        "unicorn/prefer-string-trim-start-end": "warn",
        "unicorn/prefer-single-call": "warn",
        // oxlint --fix 会误删 React 19 类型签名必需的 undefined（如 useRef<T>(undefined)、
        // getServerSnapshot 返回值），删后直接 typecheck 报错。关闭以免自动修复破坏类型安全的代码
        "unicorn/no-useless-undefined": "off",
    },

    overrides: [
        {
            // 组件自己就是设计系统的定义处，必须允许自我造型。
            // 官方要求：no-restyle / no-arbitrary-values / require-static-classes
            // 三条在组件目录内关闭。no-raw-colors 等仍生效（组件也该用 token）。
            // 注意两点（oxlint 的 glob 语义，实测）：
            // 1) override.files 里的相对路径不认 `..`，也不按本配置文件目录解析。
            //    本配置放在 packages/config/，写 `packages/...` 或 `../../packages/...`
            //    都匹配不到任何文件（静默失效，不报错）。必须用 `**/packages/...` 前缀。
            // 2) 目录通配要写 `dir/**/*`，`dir/**` 匹配不到 dir 下的一层文件。
            files: ["**/packages/ui-web/src/components/**/*"],
            rules: {
                "shadcn/no-restyle": "off",
                "shadcn/no-arbitrary-values": "off",
                "shadcn/require-static-classes": "off",
            },
        },
        {
            // reui Cascader / DataGrid / Tree 等第三方 vendored 组件：只过类型检查，
            // 不过本仓库面向「第一方 UI」的 lint 规则。逐条理由：
            //
            // typescript/no-unnecessary-condition：要么命中刻意的运行时防御（声明类型说非空、
            //   实际拿未类型化数据，如 `node?.label`），要么直接误报（`HTMLElement.textContent`
            //   在 lib.dom 就是 `string | null`，`item.textContent ?? ""` 是必要写法）。
            //
            // jsx-a11y/*：这批组件是手写 WAI-ARIA 复合控件（combobox / listbox / tree / group），
            //   规则做的是模式匹配，会在这些刻意的正确写法上报：
            //   - prefer-tag-over-role：`role="group"` 被要求换成 <fieldset>，但它是工具栏/
            //     分组容器而非表单字段集；
            //   - no-noninteractive-element-interactions：`role="group"` + onKeyDown 是合法的
            //     复合控件键盘模式，规则不识别；
            //   - click-events-have-key-events：drill 用的 chevron <span> 刻意不给 keydown
            //     （键盘下钻在 listbox/option 层已接管），给它加 keydown 反而是错的。
            //   真实 a11y 缺陷该在第一方代码里拦，这些是第三方的既定模式。
            //
            // shadcn/no-inline-styles：虚拟列表的动态高度/位移。规则要求走 CSS 变量
            //   （项目确有 CSSVars 出口），但那要改 vendored 渲染代码；按「尽量不改第三方」留给上层。
            //
            // shadcn/no-raw-colors：reui 组件内部的自有配色（badge 的 focus 系变体等）。
            //   设计系统的 token 纪律管的是实际发布的 UI；第三方组件的内部配色改它就是 fork。
            //
            // 以下几条是这批 data-grid 代码实测逐条核过的「不是缺陷」：
            // - react-hooks/exhaustive-deps：全是**有意的**依赖选择，不是漏写。
            //     data-grid.tsx 的 autoSize 刻意以 table.store 为 key 而非 table（v9 里
            //     store 终身稳定、table 每次状态变更都重建；改回 table 会在拖拽中途重置
            //     applied-once 记账，真引入 bug）；虚拟化的无限滚动 effect 依赖每次滚动都变的
            //     virtualItems 正是触发条件本身，且有 fetchMoreFiredAtCountRef 去重。
            //     列头的 useMemo 是纯渲染优化，陈旧也只多渲染一次、不会算错。
            // - oxc/const-comparisons：`icon && icon`，React 惯用的条件渲染写法，误报。
            // - typescript/no-base-to-string：`String(value ?? "")` 是单元格无 format 时的
            //     有意回退（value 类型为 unknown），不是误 stringify。
            // - unicorn/no-useless-fallback-in-spread：`...(props.x || {})` 防御性合并。
            // - jsx-a11y/no-autofocus：单元格编辑器浮层打开即聚焦是功能本身，去掉即坏。
            //
            // 正确性仍由 tsc（strict + noUncheckedIndexedAccess）全程把关。
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
            },
        },
        {
            // ImageUploadGrid 的空位瓦片是纯占位槽（无数据、无增删重排语义），
            // 索引 key 是唯一合理选择，规则对该文件豁免。
            // 原写法 "packages/ui-web/src/components/image-upload.tsx" 因上述 glob
            // 语义（相对路径不解析）一直是死配置，此处补 `**/` 前缀修好。
            files: ["**/packages/ui-web/src/components/image-upload.tsx"],
            rules: {
                "react/no-array-index-key": "off",
                "react-doctor/no-array-index-key": "off",
            },
        },
        {
            // 测试夹具与 MSW handler 必须镜像 wire 契约：SDK 生成类型是 `T | null`
            // （required + nullable，undefined 不可赋值）、zod schema 是 `.nullable()`
            // （同样不接受 undefined）；MSW 空响应也要 `new HttpResponse(null, …)`。
            // 夹具不写 null 就过不了类型/契约校验——属「对外兼容 null」的正当使用，
            // no-null 只约束内部代码（领域层约定），对测试代码整体豁免。
            files: ["**/*.test.ts", "**/*.test.tsx", "**/packages/test-utils/**"],
            rules: { "no-null": "off" },
        },
        {
            // 造数脚本的列值数组直接拼进 SQL VALUES，null 就是字面量 NULL 的唯一写法
            // （undefined 会被序列化丢失语义）；领域层的 no-null 约定不适用。
            files: ["**/scripts/**/*"],
            rules: { "no-null": "off" },
        },
        {
            // subs 分组/词条在契约（NavGroup）里没有行身份，编辑器又是受控输入 +
            // 整段有序移动：内容 key 会撞名重挂载丢焦点，索引 key 在这里是正确选择
            // （值全部受控，重排后渲染仍对得上数据）。与 image-upload 豁免同理。
            files: ["**/apps/admin/src/cms/nav/subs-editor.tsx"],
            rules: {
                "react/no-array-index-key": "off",
                "react-doctor/no-array-index-key": "off",
            },
        },
        {
            // 前台导航是纯展示（无输入状态、会话内不重排），分组同样没有行身份；
            // 内容 key 反而可能在重名分组上撞 key。索引 key 按展示语义豁免。
            files: ["**/apps/web/src/home/HomeCategoryNav.tsx"],
            rules: {
                "react/no-array-index-key": "off",
                "react-doctor/no-array-index-key": "off",
            },
        },
    ],

    // ignorePatterns 相对本配置文件目录解析，无法匹配 config 目录之外的真实项目路径
    // （sdk / generated / *.gen.ts / routeTree 等）。项目级忽略统一写根级 .eslintignore。
    ignorePatterns: [],
})

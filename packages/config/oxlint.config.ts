import { defineConfig } from "oxlint"

export default defineConfig({
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
    },

    rules: {
        "import/no-cycle": "warn",

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

        // React 19 自动 JSX 转换，不需要显式 import React
        "react/react-in-jsx-scope": "off",

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

    overrides: [],

    // ignorePatterns 相对本配置文件目录解析，无法匹配 config 目录之外的真实项目路径
    // （sdk / generated / *.gen.ts / routeTree 等）。项目级忽略统一写根级 .eslintignore。
    ignorePatterns: [],
})

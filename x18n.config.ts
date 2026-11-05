// oxfmt-ignore
import { defineConfig } from '@x18n/core'

export default defineConfig({
    presets: ["i18next"],
    sourceLocale: "zh-Hans-CN",
    keyStyle: "flat",
    keySeparator: false,
    resources: [
        { pattern: "packages/i18n/src/locales/{locale}/{namespace}.json", namespace: "shared" },
        { pattern: "apps/*/src/locales/{locale}/{namespace}.json", namespace: "app" },
    ],
    namespace: {
        default: "app",
        fallback: ["shared"],
    },
    usage: {
        include: ["apps/*/src/**/*", "packages/*/src/**/*"],
        exclude: [
            "**/locales/**",
            "**/*.gen.ts",
            "**/node_modules/**",
            "**/*.test.*",
            // 草稿持久化等 localStorage key 形似翻译 key，非词典引用
            "**/domains/product/create/draft-persist.ts",
            // 监控信封的 event 名空间（shop.fe.v1），非翻译 key
            "packages/monitoring/src/**",
        ],
        calls: [
            { callee: "t", key: 0 },
            { callee: "i18n.t", key: 0 },
            { callee: "sharedMessage", factory: true, key: 0, returns: ["t"] },
            { callee: "message", factory: true, key: 0, returns: ["t"] },
            { callee: "err", key: 0 },
            { callee: "translate", key: 0 },
            { callee: "translateShared", key: 1 },
        ],
        keysInUse: [
            // 只被 e2e 断言引用的 title key（usage 排除了测试文件，这里显式记为在用；键带 namespace 前缀）
            "app:route.title.search",
        ],
        regex: [
            {
                extensions: ["ts", "tsx"],
                patterns: ['"([a-z][a-zA-Z0-9_]*(?:\\.[a-zA-Z0-9_]+)+)"'],
            },
        ],
    },
    extract: {
        autoDetect: true,
        // 提取只关心业务代码里的用户可见文案；vendored reui 与 ui 原语（自带英文标签经
        // labels prop 注入）、承运商词表（域数据，非 UI 文案）、SDK/测试基建不在此列。
        // 值的写法同 extract.ignore：精确串或 /regex/flags——`/./` 匹配任意非空串 = 整文件豁免
        ignoreByFile: {
            "**/*.test.*": ["/./"],
            "**/reui/**": ["/./"],
            "**/components/ui/**": ["/./"],
            "**/carriers.ts": ["/./"],
            "**/sdk-client.ts": ["/./"],
            "**/test-utils/**": ["/./"],
        },
    },
    glossary: [
        // 术语表：SKU 不翻译，en-US 允许复数词形 SKUs
        { term: "SKU", doNotTranslate: true, forms: { "en-US": ["SKUs"] } },
        { term: "Shop", translations: { "en-US": "shop" }, forms: { "en-US": ["shop", "shops"] } },
    ],
    ignoreKeys: [],
    checks: {
        "missing-key": "warning",
        "invalid-syntax": "warning",
        "placeholder-mismatch": "warning",
        "param-mismatch": "warning",
        "key-conflict": "off",
        "missing-translation": "warning",
        "stale-translation": "warning",
        "review-changes-requested": "warning",
        "empty-translation": "warning",
        "redundant-translation": "warning",
        "unused-key": "warning",
        "locale-code-conflict": "warning",
        "dynamic-key": "off",
        "identical-to-source": "info",
        "key-style": "off",
        "hard-string": "info",
        glossary: "warning",
        "invalid-resource": "warning",
    },
})

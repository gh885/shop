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
        "unicorn/filename-case": ["warn", { case: "kebabCase" }],
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
        "unicorn/prefer-global-this": "warn",
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
        "unicorn/no-nested-ternary": "warn",
        "unicorn/no-await-expression-member": "warn",
        "unicorn/no-useless-undefined": "warn",
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
    },

    overrides: [],

    ignorePatterns: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.output/**",
        "**/.git/**",
        "**/coverage/**",
        "**/*.d.ts",
        "**/generated/**",
        "**/*.generated.*",
        "**/routeTree.gen.ts",
        "**/migrations/**",
    ],
})

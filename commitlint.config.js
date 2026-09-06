/**
 * 通用 Commitlint 配置 — 新项目直接复制
 *
 * 最佳实践：只写与 @commitlint/config-conventional 预设不同的规则
 * 预设升级时自动继承，不会因 override 冲突。
 *
 * 项目专属需求：
 *   - scope-enum：根据项目模块自行增减
 *
 * 不写 ignores：预设默认已忽略 Merge / Revert / Reapply / fixup! / squash!
 * / amend! 与纯 semver 提交，见 @commitlint/is-ignored/lib/defaults.js。
 *
 * @see https://commitlint.js.org/reference/rules.html
 */

/** @type {import('@commitlint/types').UserConfig} */
export default {
    extends: ["@commitlint/config-conventional"],

    rules: {
        // ── 中文支持 ────────────────────────────────────
        // 关闭英语 casing 检查，允许中文 subject
        "subject-case": [0],

        // ── 可选空字段 ──────────────────────────────────
        "scope-empty": [0],
        "body-empty": [0],
        "footer-empty": [0],

        // ── 范围收口：新增 app/package 时同步维护此表 ────
        "scope-enum": [
            2,
            "always",
            [
                // apps/
                "web",
                "seller",
                "admin",
                "server",
                // packages/
                "api",
                "app-kit",
                "ui-web",
                "config",
                // 跨切面
                "deps",
                "ci",
                "docs",
                "repo",
                "release",
            ],
        ],

        // ── 标题 ────────────────────────────────────────
        // 预设 100 对中文过宽（1 字 ≈ 2 列显示宽度），收到 72
        "header-max-length": [2, "always", 72],
        "subject-min-length": [2, "always", 5],

        // ── 正文／脚注 ──────────────────────────────────
        // 预设按 error 卡 100 列，粘贴 URL、堆栈时必炸，降为提示
        "body-max-line-length": [1, "always", 100],
        "footer-max-line-length": [1, "always", 100],
        // 缺空行会让 changelog 解析器错位，预设只给 warning，提到 error
        "body-leading-blank": [2, "always"],
        "footer-leading-blank": [2, "always"],

        // 禁止 AI 协作者签名进入提交历史
        "trailer-exists": [2, "never", "Co-Authored-By:"],
    },

    helpUrl: "https://www.conventionalcommits.org/zh-hans/v1.0.0/",
}

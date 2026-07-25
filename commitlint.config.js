/**
 * 通用 Commitlint 配置 — 新项目直接复制
 *
 * 最佳实践：只写与 @commitlint/config-conventional 预设不同的规则
 * 预设升级时自动继承，不会因 override 冲突。
 *
 * 项目专属需求：
 *   - scope-enum：根据项目模块自行增减
 *   - prompt 中文：可按需翻译或删除
 *
 * @see https://commitlint.js.org/#/reference-configuration
 */

/** @type {import('@commitlint/types').UserConfig} */
export default {
    extends: ['@commitlint/config-conventional'],

    rules: {
        // ── 中文支持 ────────────────────────────────────
        // 关闭英语 casing 检查，允许中文 subject
        'subject-case': [0],

        // ── 可选空字段 ──────────────────────────────────
        'scope-empty': [0],
        'body-empty': [0],
        'footer-empty': [0],
    },

    ignores: [
        (commit) => commit.startsWith('Merge '),
        (commit) => commit.startsWith('Revert "'),
        (commit) => /^chore\(release\):/iu.test(commit),
        (commit) => /^v?\d+\.\d+\.\d+/u.test(commit),
    ],

    helpUrl: 'https://www.conventionalcommits.org/zh-hans/v1.0.0/',
};

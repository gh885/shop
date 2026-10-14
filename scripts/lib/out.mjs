/**
 * 门禁统一输出层 —— 唯一真相：所有 drift / guard / audit 脚本的状态结论都从这里出。
 *
 * 两档，刻意分开：
 * - **结论行**（`ok` / `info` / `warn` / `err`）走 consola：TTY 下彩色 + tag 前缀，
 *   检测到 CI/测试环境（consola 内部用 std-env）自动降级成 plain，日志不被 ANSI 码糊住。
 * - **多行明细**（`raw` / `rawErr`）原样写，不贴 reporter 前缀——diff / 违规清单 / 文件转储
 *   一旦被逐行贴标就没法读，这类内容保持朴素缩进。
 *
 * 约定：一次失败只点 **一条** 结论行（`err`），其下的逐条明细一律 `rawErr`。
 * 这里只放输出，不放任何判定逻辑。
 */
import { createConsola } from "consola"

const consola = createConsola()

/**
 * @param {string} tag 归属标签，通常用 pnpm 命令名（如 `routing:drift`），输出里带上好定位是谁说的
 */
export function out(tag) {
    const c = tag ? consola.withTag(tag) : consola
    const nl = (msg) => (msg.endsWith("\n") ? msg : `${msg}\n`)
    return {
        ok: (msg) => c.success(msg),
        info: (msg) => c.info(msg),
        warn: (msg) => c.warn(msg),
        err: (msg) => c.error(msg),
        raw: (msg) => process.stdout.write(nl(msg)),
        rawErr: (msg) => process.stderr.write(nl(msg)),
    }
}

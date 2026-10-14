/**
 * 词表 codegen 的公共小工具 —— error-codes / permissions 两份「注册表 → Java + TS」脚本共用。
 *
 * 只收**逐字节相同**的纯函数，不收 main() 流程：两份的 audit / 少码拒写 / drift 有真实的按域分叉
 * （permissions 滤 reserved、error-codes 的少码提示截断），那点差异现在不值得抽象，等第三个词表
 * 落地、分叉显形了再谈 harness。
 */
import { readFile } from "node:fs/promises"

/**
 * 注释归一：去掉每行 javadoc 的前导 `*` 与空白、把连续空白压成一个空格。
 * `--check` 靠它做「按语义比而不是按字节比」——spotless 会重排 javadoc 换行，按字节比必然假红。
 * 幂等：对已归一的字符串再归一结果不变。
 */
export const normalizeDoc = (raw) =>
    raw
        .replace(/^\s*\*?\s?/gm, "")
        .replace(/\s+/g, " ")
        .trim()

/** 从已有 Java 里抽出「码 → { doc(已归一), value }」，供 --audit 与 --check 用 */
export function extractJava(text) {
    const map = new Map()
    const pattern =
        /(?:\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*)?public static final String ([A-Z0-9_]+) = "([A-Z0-9_]+)";/g
    for (const match of text.matchAll(pattern)) {
        map.set(match[2], { doc: normalizeDoc(match[1] ?? ""), value: match[3] })
    }
    return map
}

/** 从已有 TS 里抽出「码 → { doc(已归一), value }」 */
export function extractTs(text) {
    const map = new Map()
    const pattern = /(?:\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*)?([A-Z0-9_]+): "([A-Z0-9_]+)"/g
    for (const match of text.matchAll(pattern)) {
        map.set(match[2], { doc: normalizeDoc(match[1] ?? ""), value: match[3] })
    }
    return map
}

/** 读文件，不存在返回 null（生成物可能还没落盘，--check 要能对着空靶跑） */
export function readIfExists(path) {
    return readFile(path, "utf8").catch((error) => {
        if (error.code === "ENOENT") return null
        throw error
    })
}

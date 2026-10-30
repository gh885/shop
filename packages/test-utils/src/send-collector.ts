/**
 * 监控测试的假「最后一跳」：给 createMonitor 的 `send` 用的收集器。
 * body 是事件对象数组（不是字符串数组——双重编码会让 body 大一倍），事件形状由调用方的泛型钉住。
 * 六个测试文件曾各抄一份带 `as` 断言的 send，这里收成一处；测试夹具不值得为此上 zod 校验。
 */
// T 只出现在返回位、由调用方显式指定事件形状（各测试自己的契约夹具类型）——刻意的类型注入工厂
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- 见上
export function createSendCollector<T>(): {
    send: (endpoint: string, body: string) => boolean
    readonly events: readonly T[]
    clear: () => void
} {
    const events: T[] = []
    return {
        send: (_endpoint, body) => {
            // JSON.parse 返回 any，元素形状由调用方泛型保证
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 测试夹具，形状由泛型钉住
            events.push(...(JSON.parse(body) as T[]))
            return true
        },
        events,
        clear: () => {
            events.length = 0
        },
    }
}

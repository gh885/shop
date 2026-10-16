/** 结构化校验事实：`message` 是 catalog key、`params` 是要插进句子的数据。形状与 Zod issue 的 `{ message, params }` 逐字相同，渲染边界认形状不认生产方；句子换算按 locale 走，所以生产方不该收 locale（时机与口径见 docs/conventions/i18n.md §4）。 */
export interface MessageFact<K extends string = string> {
    message: K
    /** 槽位收 `string | number`，比 `translate` 的 `MessageParams` 窄一档：这是契约不是插值入参，`@shop/common/domain` 的 `FieldRuleIssue`、Zod issue、渲染层全按这份窄形状读；窄一档换来能直接当 `FieldRuleIssue` 用，不必在两包间转换。 */
    params?: Record<string, string | number>
}

/** 只有经过 catalog 类型检查的工厂才能构造；运行时仍是普通 MessageFact。 */
declare const checkedMessage: unique symbol
export type CheckedMessageFact<K extends string = string> = MessageFact<K> & {
    readonly [checkedMessage]: true
}

/**
 * 「key ↔ params 两向绑着」的工厂类型：逐条消息的参数集合由 codegen 产出的 `{P}ParamsByKey` 把着。
 *
 * - **要参数的 key 少传参数 → 编译不过**（不像 `err(key)` 那种「key 收窄了但参数没约束」的半截安全）；
 * - **参数名/类型对不上 → 编译不过**（`{ maximum: 365 }` 配 `{ max }` 那条句子直接红）；
 * - **无参 key 多传参数 → 编译不过**（args 是空元组）。
 *
 * 用可变参数元组而不是 `params?: P`：可选参数位拦不住「漏传」，而漏传的后果是 `translate` 降级为 key 本身，用户得不到可读提示。
 */
export type MessageFactFactory<
    K extends string,
    ByKey extends Record<string, Record<string, string | number>>,
> = <T extends K>(
    key: T,
    ...args: T extends keyof ByKey ? [params: ByKey[T]] : []
) => CheckedMessageFact<T>

/**
 * 给某份 catalog 造一个事实工厂；各端用生成的 key / ParamsByKey 在 locales/message.ts 绑定类型。
 *
 * 类型全在上面的 `MessageFactFactory` 上，`ByKey` 传错一份就等于把绑定弄丢了——生成物会当场红（返回值类型对不上）。
 */
export function messageFactFactory<
    K extends string,
    ByKey extends Record<string, Record<string, string | number>>,
>() {
    return (<T extends K>(key: T, ...args: T extends keyof ByKey ? [params: ByKey[T]] : []) => {
        const [params] = args
        return params === undefined ? { message: key } : { message: key, params }
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 工厂签名已检查 key/params；此处只授予编译期标记，不增加运行时字段
    }) as MessageFactFactory<K, ByKey>
}

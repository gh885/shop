/**
 * 结构化校验事实：`message` 是 catalog key、`params` 是要插进句子的数据。
 *
 * 形状与 Zod issue 里那套（`{ message, params }`）逐字相同，所以渲染边界（ui-web 的 `FieldError`
 * → app-kit 的 `FormErrorTranslateProvider`）认它与本地 Zod 那条，不认「谁产的」。
 * 句子的换算按 locale 走，所以生产这份东西的代码**不该收 locale**（docs/conventions/i18n.md §6.1）。
 */
export interface MessageFact<K extends string = string> {
    message: K
    /**
     * 槽位的值收在 `string | number`，比 `translate` 的 `MessageParams` 窄一档：那是**插值**的入参，
     * 而这里是**契约**——`@shop/common/domain` 的 `FieldRuleIssue`、Zod issue、渲染层的翻译器
     * 全都按这份窄形状读（渲染层只把它交给 `translate`，那边照样吃更宽的类型）。窄一档换来的是
     * 「这份事实能直接当 `FieldRuleIssue` 用」，不必在两包之间做一次转换。
     */
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
 * 用可变参数元组而不是 `params?: P`：可选参数位拦不住「漏传」，而漏传的后果是 `translate`
 * 降级为 key 本身，用户得不到可读提示。
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
 * 实现只有两行，**类型全在上面那个 `MessageFactFactory` 上**——所以这里的实参必须经得起
 * 编译器：`ByKey` 传错一份就等于把绑定弄丢了（生成物会当场红，因为返回值的类型对不上）。
 * 工厂不引入任何运行时依赖，也不读 locale：它只把「key + 参数」打包成一份事实。
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

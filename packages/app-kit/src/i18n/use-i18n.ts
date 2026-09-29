import { useContext } from "react"

import type { AppKitTranslate } from "../locales/messages.gen"

import { I18nContext, type I18nContextValue } from "./provider"

/** `t` 的形状下限：只要求「收一个 key、返回 string」。各 root 的 `XTranslate` 是它的细化 */
type TranslateShape = (key: never, params?: never) => string

export function useI18n(): I18nContextValue {
    const context = useContext(I18nContext)
    if (!context) {
        throw new Error("useI18n must be used within I18nProvider")
    }
    return context
}

/**
 * 本包内部组件的 `t`：key 收在生成物那份 `AppKitMessageKey` 上（`locales/<locale>/*.json` 的 31 条）。
 * 与三端的 `src/locales/use-t.ts` 是同一个机制、不同的 root。
 */
export function useT(): AppKitTranslate {
    return useTypedT<AppKitTranslate>()
}

/**
 * 把上下文里那个 `t` 交给本 root 声明的形状——**全仓唯一一处 `t` 的类型断言**。
 *
 * 需要断言的原因是这件事运行时成立、类型里说不清：`t` 先查本端资源、再查 `APP_KIT_MESSAGES`，
 * 所以「一个 key 属于哪份 catalog」由装配时挂上来的 resources 决定，而 context 的类型与
 * Provider 实例的泛型参数无关（React context 拿不到 root 的类型参数）。
 * 于是本端 key 集合由各 root 生成物里的 `XTranslate` 给出（§5.5 契约 3 的编译期那半），
 * 这里只负责把它盖到运行时的实现上。调用点不直接用它：三端各有一个 `src/locales/use-t.ts`
 * 实例化本端的形状，那三处加下面这一处就是这个断言的全部落点。
 */
export function useTypedT<T extends TranslateShape>(): T {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 见上：运行时解析链宽于任何一端的 key 集合，断言的落点就是本函数与三个 use-t.ts
    return useI18n().t as unknown as T
}

import { useTypedT } from "@shop/app-kit/i18n"
import type { SellerNamespace, SellerScopedT, SellerTranslate } from "./messages.gen"

/**
 * 卖家端的 `t`：key 与参数受 `pnpm gen:i18n` 生成物的约束（§5.5 契约 3 的编译期那半）——
 * 拼错 key、给无参消息塞参数、参数名对不上，都在这里变编译错误。带参消息整个漏传不拦：
 * `params` 保持可选是量过的取舍，改成必传元组后拼错 key 报的是「实参个数不对」而不是 key 本身。
 *
 * 两种签名：不传参数是整份（`SellerMessageKey ∪ app-kit 共享 key`），传一个 namespace
 * （`useT("nav")`）是收窄形态，key 位只收那个文件的 key——打错时报错只列本 namespace 的候选，
 * 而不是几百上千条的全集（§4.2 末段）。收窄形态**不含** app-kit 的共享文案：要那些用整份那份。
 *
 * 为什么不直接用 `@shop/app-kit` 的 `useT`：那个只认 app-kit 自己那份 catalog，
 * 本端的 key 不在它的集合里。断言本身只有一处（`useTypedT`，理由写在那里），
 * 本文件做的是把本端 catalog 的类型接到调用点上——三端各一份，因为 catalog 是三份。
 */
export function useT(): SellerTranslate
export function useT<N extends keyof SellerNamespace>(namespace: N): SellerScopedT<N>
export function useT(namespace?: keyof SellerNamespace): SellerTranslate {
    // namespace 只在类型层收窄 key（key 仍是完整字面量，解析链也只有一条），运行时无事可做；
    // 显式读掉它而不是靠 `_` 前缀，是为了让「这里收着一个只为类型存在的参数」在代码里可见
    void namespace
    return useTypedT<SellerTranslate>()
}

import { useTypedT } from "@shop/app-kit/i18n"
import type { WebTranslate } from "./messages.gen"

/**
 * 买家端的 `t`：key 与参数受 `pnpm gen:i18n` 生成物的约束（§5.5 契约 3 的编译期那半）——
 * 拼错 key、给无参消息塞参数、参数名对不上，都在这里变编译错误。带参消息整个漏传不拦：
 * `params` 保持可选是量过的取舍，改成必传元组后拼错 key 报的是「实参个数不对」而不是 key 本身。
 *
 * 为什么不直接用 `@shop/app-kit` 的 `useT`：那个只认 app-kit 自己那份 catalog，
 * 本端的 key 不在它的集合里。断言本身只有一处（`useTypedT`，理由写在那里），
 * 本文件做的是把本端 catalog 的类型接到调用点上——三端各一份，因为 catalog 是三份。
 */
export function useT(): WebTranslate {
    return useTypedT<WebTranslate>()
}

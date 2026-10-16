import { useI18n } from "@shop/app-kit/i18n"
import type { WebNamespace, WebScopedT, WebTranslate } from "./messages.gen"

/**
 * 买家端的 `t`：key 与参数受 `pnpm i18n:gen` 生成物的约束——
 * 拼错 key、给无参消息塞参数、参数名对不上，都在这里变编译错误。带参消息必须传参数：
 * 生成物通过参数元组同时约束名称、类型与必传性。
 *
 * 两种签名：不传参数是整份（`WebMessageKey ∪ app-kit 共享 key`），传一个 namespace
 * （`useT("nav")`）是收窄形态，key 位只收那个文件的 key——打错时报错只列本 namespace 的候选，
 * 而不是几百上千条的全集。收窄形态**不含** app-kit 的共享文案：要那些用整份那份。
 */
export function useT(): WebTranslate
export function useT<N extends keyof WebNamespace>(namespace: N): WebScopedT<N>
export function useT(namespace?: keyof WebNamespace) {
    void namespace
    return useI18n().t
}

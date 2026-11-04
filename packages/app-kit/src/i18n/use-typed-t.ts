import { useI18n } from "./use-i18n"

export { useI18n } from "./use-i18n"

// 共享词典的强类型 `t`：app-kit 内部用共享文案的就走这里；三端本端 key 走各 app 的 `src/locales/use-t.ts`
type TranslateShape = (...args: never[]) => string

// T 只出现在返回位、由调用方显式指定（三端把本端生成 catalog 的翻译器类型接进来）——
// 这是刻意的「类型注入」工厂，不是可推断的泛型
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- 见上
export function useTypedT<T extends TranslateShape>(): T {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 本端生成类型限定资源 key 与 ICU 参数，运行时由同一 i18next 实例解析
    return useI18n().t as unknown as T
}

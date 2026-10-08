import { localeOf } from "@shop/common/i18n"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"

import { createAppI18n } from "./runtime"
import { I18nProvider } from "./provider"
import { useI18n } from "./use-i18n"
import { SearchBar } from "@shop/ui-web"

const resources = {
    "zh-Hans-CN": {
        greeting: "你好，{name}",
    },
    "en-US": {
        greeting: "Hello, {name}",
        "only.en": "English only",
    },
} as const

function Probe() {
    const { locale, setLocale, t } = useI18n()
    return (
        <div>
            <span data-testid="locale">{locale}</span>
            <span>{t("greeting", { name: "Shop" })}</span>
            <span>{t("only.en")}</span>
            <button onClick={() => setLocale("en-US")}>switch</button>
        </div>
    )
}

function ShellProbe() {
    const { setLocale } = useI18n()
    return (
        <div>
            <SearchBar onSearch={() => {}} />
            <button onClick={() => setLocale("en-US")}>switch</button>
        </div>
    )
}

describe("I18nProvider", () => {
    it("renders the initial locale and interpolates messages", () => {
        render(
            <I18nProvider i18n={createAppI18n("zh-Hans-CN", resources)}>
                <Probe />
            </I18nProvider>,
        )

        expect(screen.getByTestId("locale")).toHaveTextContent("zh-Hans-CN")
        expect(screen.getByText("你好，Shop")).toBeInTheDocument()
    })

    it("falls back to en-US for missing zh-Hans-CN keys", () => {
        render(
            <I18nProvider i18n={createAppI18n("zh-Hans-CN", resources)}>
                <Probe />
            </I18nProvider>,
        )

        expect(screen.getByTestId("locale")).toHaveTextContent("zh-Hans-CN")
        expect(screen.getByText("你好，Shop")).toBeInTheDocument()
        expect(screen.getByText("English only")).toBeInTheDocument()
    })

    it("switches locale", () => {
        const i18n = createAppI18n("zh-Hans-CN", resources)
        render(
            <I18nProvider i18n={i18n}>
                <Probe />
            </I18nProvider>,
        )

        fireEvent.click(screen.getByText("switch"))
        expect(screen.getByTestId("locale")).toHaveTextContent("en-US")
        // i18n 是 locale 的唯一持有者：拿不到 hook 的消费者（请求头、全局 toast）
        // 全靠它跟着换，所以这里钉的不是「Provider 记得传了个对象」，而是「切完它确实变了」。
        expect(localeOf(i18n)).toBe("en-US")
    })

    // 改版前这九处壳层文案是模块级单例 + useEffect 写入：SSR 拿不到、首屏空、切语言滞后一帧。
    // 两条各钉一件事——首屏就有句子（SSR 那侧），切语言当场变（不留滞后）。
    it("壳层组件首屏就拿到当前语言的文案，切语言当场变（不靠 useEffect 写模块单例）", () => {
        render(
            <I18nProvider i18n={createAppI18n("zh-Hans-CN", resources)}>
                <ShellProbe />
            </I18nProvider>,
        )

        const zhButton = screen.getByRole("button", { name: /搜索/ })
        expect(zhButton).toHaveTextContent("搜索")

        fireEvent.click(screen.getByText("switch"))

        // 切完立刻是英文（没有等下一次交互才换）
        expect(screen.getByRole("button", { name: /Search/ })).toHaveTextContent("Search")
    })
})

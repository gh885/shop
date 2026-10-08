import { renderToString } from "react-dom/server"
import { hydrateRoot, type Root } from "react-dom/client"
import { act } from "@testing-library/react"
import { describe, expect, it, vi } from "vite-plus/test"
import { createAppI18n } from "./runtime"
import { I18nProvider } from "./provider"
import { useI18n } from "./use-i18n"
import { bindBrowserI18n } from "./browser"
import { readPreferredLocale } from "./locale"

function Content() {
    const { locale, t } = useI18n()
    return (
        <section lang={locale}>
            <h1>{t("confirm.confirm")}</h1>
        </section>
    )
}

describe("request instances and hydration", () => {
    it("renders each request with its own locale and hydrates without replacing the server text", async () => {
        const zh = createAppI18n("zh-Hans-CN")
        const en = createAppI18n("en-US")
        const [zhHtml, enHtml] = await Promise.all(
            [zh, en].map(async (i18n) => {
                await Promise.resolve()
                return renderToString(
                    <I18nProvider i18n={i18n}>
                        <Content />
                    </I18nProvider>,
                )
            }),
        )
        expect(zhHtml).toContain('lang="zh-Hans-CN"')
        expect(enHtml).toContain('lang="en-US"')
        expect(enHtml).toContain("Confirm")
        expect(zhHtml).not.toContain("Confirm")
        const container = document.createElement("div")
        container.innerHTML = enHtml ?? ""
        document.body.append(container)
        const onRecoverableError = vi.fn<(error: unknown) => void>()
        let root: Root | undefined
        try {
            await act(async () => {
                root = hydrateRoot(
                    container,
                    <I18nProvider i18n={createAppI18n("en-US")}>
                        <Content />
                    </I18nProvider>,
                    { onRecoverableError },
                )
            })
            expect(container.textContent).toBe("Confirm")
            expect(onRecoverableError).not.toHaveBeenCalled()
        } finally {
            await act(async () => root?.unmount())
            container.remove()
        }
    })
    it("synchronizes document language without persisting automatic changes", async () => {
        const i18n = createAppI18n("zh-Hans-CN")
        document.cookie = "locale=zh-Hans-CN; path=/"
        const unbind = bindBrowserI18n(i18n)
        await i18n.changeLanguage("en-US")
        expect(document.documentElement.lang).toBe("en-US")
        expect(readPreferredLocale()).toBe("zh-Hans-CN")
        unbind()
        await i18n.changeLanguage("zh-Hans-CN")
        expect(document.documentElement.lang).toBe("en-US")
    })
})

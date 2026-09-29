import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"

import { createLocaleScope } from "./scope"
import { I18nProvider } from "./provider"
import { useI18n } from "./use-i18n"

const resources = {
    "zh-CN": {
        greeting: "你好，{name}",
        "only.zh": "只有中文",
    },
    "en-US": {
        greeting: "Hello, {name}",
    },
} as const

function Probe() {
    const { locale, setLocale, t } = useI18n()
    return (
        <div>
            <span data-testid="locale">{locale}</span>
            <span>{t("greeting", { name: "Shop" })}</span>
            <span>{t("only.zh")}</span>
            <button onClick={() => setLocale("en-US")}>switch</button>
        </div>
    )
}

describe("I18nProvider", () => {
    it("renders the initial locale and interpolates messages", () => {
        render(
            <I18nProvider
                resources={resources}
                scope={createLocaleScope()}
                initialLocale="zh-CN"
            >
                <Probe />
            </I18nProvider>,
        )

        expect(screen.getByTestId("locale")).toHaveTextContent("zh-CN")
        expect(screen.getByText("你好，Shop")).toBeInTheDocument()
    })

    it("falls back to zh-CN for missing en-US keys", () => {
        render(
            <I18nProvider
                resources={resources}
                scope={createLocaleScope()}
                initialLocale="en-US"
            >
                <Probe />
            </I18nProvider>,
        )

        expect(screen.getByTestId("locale")).toHaveTextContent("en-US")
        expect(screen.getByText("Hello, Shop")).toBeInTheDocument()
        expect(screen.getByText("只有中文")).toBeInTheDocument()
    })

    it("switches locale", () => {
        const scope = createLocaleScope("zh-CN")
        render(
            <I18nProvider
                resources={resources}
                scope={scope}
                initialLocale="zh-CN"
            >
                <Probe />
            </I18nProvider>,
        )

        fireEvent.click(screen.getByText("switch"))
        expect(screen.getByTestId("locale")).toHaveTextContent("en-US")
        // scope 是 locale 的输出（§3.5 约束 4）：拿不到 hook 的消费者（请求头、全局 toast）
        // 全靠它跟着换，所以这里钉的不是「Provider 记得传了个对象」，而是「切完它确实变了」。
        expect(scope.locale).toBe("en-US")
    })
})

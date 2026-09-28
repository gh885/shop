import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"

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
        render(
            <I18nProvider
                resources={resources}
                initialLocale="zh-CN"
            >
                <Probe />
            </I18nProvider>,
        )

        fireEvent.click(screen.getByText("switch"))
        expect(screen.getByTestId("locale")).toHaveTextContent("en-US")
    })
})

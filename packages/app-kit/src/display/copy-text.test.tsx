import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { Toaster } from "@shop/ui-web"
import { createAppI18n } from "../i18n/runtime"
import { bindNotifyI18n } from "../data/notify"
import { copyWithNotify } from "./copy-text"

afterEach(() => vi.unstubAllGlobals())

describe("copyWithNotify", () => {
    it("复制等待期间切语言，完成时只显示新语言的通用提示", async () => {
        let finish!: () => void
        const pending = new Promise<void>((resolve) => {
            finish = resolve
        })
        const writeText = vi.fn<Clipboard["writeText"]>(() => pending)
        vi.stubGlobal("navigator", { clipboard: { writeText } })
        const i18n = createAppI18n("zh-Hans-CN")
        bindNotifyI18n(i18n)
        render(<Toaster />)
        const copying = copyWithNotify("123456")
        expect(writeText).toHaveBeenCalledExactlyOnceWith("123456")
        await i18n.changeLanguage("en-US")
        finish()
        await copying
        expect(await screen.findByText("Copied to clipboard")).toBeInTheDocument()
        expect(screen.queryByText(/123456|已复制/)).not.toBeInTheDocument()
    })

    it("中文界面成功提示不再需要调用处提供标签", async () => {
        vi.stubGlobal("navigator", { clipboard: { writeText: async () => {} } })
        bindNotifyI18n(createAppI18n("zh-Hans-CN"))
        render(<Toaster />)
        await copyWithNotify("原值")
        expect(await screen.findByText("已复制到剪贴板")).toBeInTheDocument()
    })

    it.each(["denied", "unavailable"])(
        "剪贴板 %s 时提示失败，调用者不收到 rejection",
        async (mode) => {
            vi.stubGlobal(
                "navigator",
                mode === "unavailable"
                    ? {}
                    : {
                          clipboard: {
                              writeText: async () => {
                                  throw new DOMException("Permission denied", "NotAllowedError")
                              },
                          },
                      },
            )
            bindNotifyI18n(createAppI18n("en-US"))
            render(<Toaster />)
            await expect(copyWithNotify("原值")).resolves.toBeUndefined()
            expect(
                await screen.findByText("Copy failed — select the text and copy manually"),
            ).toBeInTheDocument()
        },
    )
})

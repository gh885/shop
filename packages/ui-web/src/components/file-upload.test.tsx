import { act, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FileUpload, FileUploadDropzone } from "./file-upload"

/**
 * 选文件后的校验链：maxFiles 超额 → onFileValidate（命中即短路）→ accept → maxSize，
 * 拒绝走 onFileReject 并闪一次 data-invalid，通过的走 onAccept / onFileAccept / onValueChange / onUpload。
 */

function makeFile(name: string, type: string, size = 1): File {
    return new File(["x".repeat(size)], name, { type })
}

type Props = React.ComponentProps<typeof FileUpload>
type Handler<K extends keyof Props> = NonNullable<Props[K]>

function setup(props: Props) {
    const { container } = render(
        <FileUpload {...props}>
            <FileUploadDropzone />
        </FileUpload>,
    )
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    const dropzone = container.querySelector('[data-slot="file-upload-dropzone"]')
    if (!input || !dropzone) throw new Error("期望渲染 input 与 dropzone")
    const select = (files: File[]) => fireEvent.change(input, { target: { files } })
    return { dropzone, select }
}

afterEach(() => {
    vi.useRealTimers()
})

describe("FileUpload 校验链", () => {
    it("accept 支持 MIME 通配与扩展名；类型与大小同时不符时各报一次；invalid 2s 后复位", () => {
        vi.useFakeTimers()
        const onFileReject = vi.fn<Handler<"onFileReject">>()
        const onAccept = vi.fn<Handler<"onAccept">>()
        const onFileAccept = vi.fn<Handler<"onFileAccept">>()
        const onValueChange = vi.fn<Handler<"onValueChange">>()
        const { dropzone, select } = setup({
            accept: "image/*, .pdf",
            maxSize: 5,
            onFileReject,
            onAccept,
            onFileAccept,
            onValueChange,
        })
        const png = makeFile("a.png", "image/png")
        const pdf = makeFile("b.pdf", "")
        const txt = makeFile("c.txt", "text/plain", 10)
        const jpg = makeFile("d.jpg", "image/jpeg", 10)

        select([png, pdf, txt, jpg])

        expect(onFileReject.mock.calls).toEqual([
            [txt, "File type not accepted"],
            [txt, "File too large"],
            [jpg, "File too large"],
        ])
        expect(onAccept).toHaveBeenCalledExactlyOnceWith([png, pdf])
        expect(onFileAccept.mock.calls).toEqual([[png], [pdf]])
        expect(onValueChange).toHaveBeenCalledExactlyOnceWith([png, pdf])
        expect(dropzone.hasAttribute("data-invalid")).toBe(true)

        act(() => {
            vi.advanceTimersByTime(2000)
        })
        expect(dropzone.hasAttribute("data-invalid")).toBe(false)
    })

    it("onFileValidate 命中即短路，不再报类型/大小", () => {
        const onFileReject = vi.fn<Handler<"onFileReject">>()
        const onAccept = vi.fn<Handler<"onAccept">>()
        const onFileValidate = vi.fn<Handler<"onFileValidate">>((file) =>
            file.name === "bad.txt" ? "自定义" : null,
        )
        const { dropzone, select } = setup({
            accept: "image/*",
            maxSize: 5,
            onFileReject,
            onAccept,
            onFileValidate,
        })
        const bad = makeFile("bad.txt", "text/plain", 10)

        select([bad])

        expect(onFileReject.mock.calls).toEqual([[bad, "自定义"]])
        expect(onAccept).not.toHaveBeenCalled()
        expect(dropzone.hasAttribute("data-invalid")).toBe(true)
    })

    it("超出 maxFiles 剩余名额的先拒（onFileValidate 有信息时优先），名额内的再走校验", () => {
        const onFileReject = vi.fn<Handler<"onFileReject">>()
        const onAccept = vi.fn<Handler<"onAccept">>()
        const onFileValidate = vi.fn<Handler<"onFileValidate">>((file) =>
            file.name === "v.png" ? "自定义" : null,
        )
        const { select } = setup({ maxFiles: 2, onFileReject, onAccept, onFileValidate })
        const first = makeFile("first.png", "image/png")
        const kept = makeFile("kept.png", "image/png")
        const v = makeFile("v.png", "image/png")
        const over = makeFile("over.png", "image/png")

        select([first])
        select([kept, v, over])

        expect(onFileReject.mock.calls).toEqual([
            [v, "自定义"],
            [over, "Maximum 2 files allowed"],
        ])
        expect(onAccept.mock.calls).toEqual([[[first]], [[kept]]])
    })

    it("受控时 onValueChange 额外再上抛一次；有 onUpload 时下一帧上传通过的文件", async () => {
        const onValueChange = vi.fn<Handler<"onValueChange">>()
        const onUpload = vi.fn<Handler<"onUpload">>()
        const { select } = setup({ value: [], onValueChange, onUpload })
        const png = makeFile("a.png", "image/png")

        select([png])

        expect(onValueChange.mock.calls).toEqual([[[png]], [[png]]])
        await waitFor(() => {
            expect(onUpload).toHaveBeenCalledWith([png], expect.any(Object))
        })
    })

    it("disabled 时忽略选择", () => {
        const onFileReject = vi.fn<Handler<"onFileReject">>()
        const onAccept = vi.fn<Handler<"onAccept">>()
        const { select } = setup({ disabled: true, maxSize: 1, onFileReject, onAccept })

        select([makeFile("a.png", "image/png", 10), makeFile("b.png", "image/png")])

        expect(onFileReject).not.toHaveBeenCalled()
        expect(onAccept).not.toHaveBeenCalled()
    })
})

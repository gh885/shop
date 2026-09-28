import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
    createFileUploadStore,
    getRejectionMessages,
    handleFilesChange,
    matchesAccept,
    storeReducer,
    type FileState,
    type FileUploadRequest,
    type FilesChangeCtx,
    type Store,
    type StoreState,
} from "./file-upload-store"

/**
 * 上传前的那条校验链（原先住 file-upload.tsx，只能渲染整块上传区才测得到）。
 * 钉的是三件事：名额怎么算、一条坏文件报几句、invalid 标记是不是自己会退。
 */

function makeFile(name: string, type: string, bytes = 8): File {
    return new File([new Uint8Array(bytes)], name, { type })
}

function makeStore(files = new Map<File, FileState>()) {
    return createFileUploadStore({ files, initialInvalid: false })
}

/** 几个回调的形状：vi.fn 要显式类型参数（oxlint vitest/require-mock-type-parameters） */
type FileListCb = (files: File[]) => void
type FileCb = (file: File) => void
type RejectCb = (file: File, message: string) => void

function makeCtx(overrides: Partial<FilesChangeCtx> = {}) {
    const store = makeStore()
    const rejectSpy = vi.fn<RejectCb>()
    const ctx: FilesChangeCtx = {
        disabled: false,
        store,
        triggerUpload: vi.fn<FileListCb>(),
        onAccept: vi.fn<FileListCb>(),
        onFileAccept: vi.fn<FileCb>(),
        onFileReject: rejectSpy,
        ...overrides,
    }
    return { ctx, store, rejectSpy }
}

const stateOf = (store: Store): StoreState => store.getState()

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe("matchesAccept", () => {
    it("精确 MIME 命中", () => {
        expect(matchesAccept(makeFile("a.png", "image/png"), ["image/png"])).toBe(true)
    })

    it("扩展名命中（.pdf 按名字尾段比，不看 MIME）", () => {
        expect(matchesAccept(makeFile("合同.PDF", "application/pdf"), [".PDF"])).toBe(true)
    })

    it("通配 MIME 命中同族：image/* 收得住 image/webp", () => {
        expect(matchesAccept(makeFile("a.webp", "image/webp"), ["image/*"])).toBe(true)
        expect(matchesAccept(makeFile("a.mp4", "video/mp4"), ["image/*"])).toBe(false)
    })

    it("accept 里有别的档位也不放宽：只按给定的每一条判", () => {
        expect(matchesAccept(makeFile("a.txt", "text/plain"), ["image/*", "application/pdf"])).toBe(
            false,
        )
    })
})

describe("getRejectionMessages", () => {
    it("onFileValidate 命中即短路：不再跑 accept 与大小那两条", () => {
        const { ctx } = makeCtx({
            acceptTypes: ["image/*"],
            maxSize: 1,
            onFileValidate: () => "文件名重复",
        })

        expect(getRejectionMessages(makeFile("a.mp4", "video/mp4", 9999), ctx)).toEqual([
            "文件名重复",
        ])
    })

    it("accept 与大小同时不符：两条都报，不吞掉后一条", () => {
        const { ctx } = makeCtx({ acceptTypes: ["image/*"], maxSize: 4 })

        expect(getRejectionMessages(makeFile("a.mp4", "video/mp4", 9999), ctx)).toEqual([
            "File type not accepted",
            "File too large",
        ])
    })

    it("没给 accept 与 maxSize 时不凭空设限", () => {
        const { ctx } = makeCtx()

        expect(getRejectionMessages(makeFile("a.zip", "application/zip", 10_000), ctx)).toEqual([])
    })
})

describe("handleFilesChange", () => {
    it("disabled：整条链不跑，一个回调都不发", () => {
        const { ctx } = makeCtx({ disabled: true })

        handleFilesChange([makeFile("a.png", "image/png")], ctx)

        expect(ctx.onFileReject).not.toHaveBeenCalled()
        expect(stateOf(ctx.store).files.size).toBe(0)
    })

    it("超出名额的那几个先拒，报的是「Maximum N files allowed」", () => {
        const { ctx, store, rejectSpy } = makeCtx({ maxFiles: 2 })
        store.dispatch({ type: "ADD_FILES", files: [makeFile("keep.png", "image/png")] })
        const extra = [makeFile("b.png", "image/png"), makeFile("c.png", "image/png")]

        handleFilesChange(extra, ctx)

        expect(ctx.onFileReject).toHaveBeenCalledTimes(1)
        expect(rejectSpy.mock.calls[0]?.[1]).toBe("Maximum 2 files allowed")
        expect(stateOf(store).files.size).toBe(2)
    })

    it("名额已满：全部按超额拒掉，通过的个数为 0", () => {
        const { ctx, store } = makeCtx({ maxFiles: 1 })
        store.dispatch({ type: "ADD_FILES", files: [makeFile("full.png", "image/png")] })

        handleFilesChange([makeFile("late.png", "image/png")], ctx)

        expect(ctx.onFileReject).toHaveBeenCalledTimes(1)
        expect(ctx.onAccept).not.toHaveBeenCalled()
    })

    it("通过的文件入 store 并上抛 onAccept / onFileAccept", () => {
        const a = makeFile("a.png", "image/png")
        const b = makeFile("b.png", "image/png")
        const { ctx, store } = makeCtx({ acceptTypes: ["image/*"] })

        handleFilesChange([a, b], ctx)

        expect([...stateOf(store).files.keys()]).toEqual([a, b])
        expect(ctx.onAccept).toHaveBeenCalledWith([a, b])
        expect(ctx.onFileAccept).toHaveBeenCalledTimes(2)
    })

    it("受控上抛只有一个出口：一次选择通知一次，收到 store 里的全集（含此前已有的文件）", () => {
        const old = makeFile("old.png", "image/png")
        const { ctx, store } = makeCtx()
        const onValueChange = vi.fn<FileListCb>()
        store.bindValueChange(onValueChange)
        store.dispatch({ type: "ADD_FILES", files: [old] })
        onValueChange.mockClear() // 播种存量那次不算
        const next = makeFile("new.png", "image/png")

        handleFilesChange([next], ctx)

        expect(onValueChange).toHaveBeenCalledTimes(1)
        expect(onValueChange).toHaveBeenCalledWith([old, next])
    })

    it("有 onUpload 才排上传：下一帧才真正开始，同步段里没发过", () => {
        const file = makeFile("a.png", "image/png")
        const { ctx } = makeCtx({ onUpload: vi.fn<FileUploadRequest>() })

        handleFilesChange([file], ctx)
        expect(ctx.triggerUpload).not.toHaveBeenCalled()

        vi.runAllTimers()
        expect(ctx.triggerUpload).toHaveBeenCalledWith([file])
    })

    it("没 onUpload 时不排帧：调用方自己接管上传（或只本地预览）", () => {
        const { ctx } = makeCtx()

        handleFilesChange([makeFile("a.png", "image/png")], ctx)
        vi.runAllTimers()

        expect(ctx.triggerUpload).not.toHaveBeenCalled()
    })

    it("一条坏文件把 invalid 立起来，2 秒后自己退", () => {
        const { ctx, store } = makeCtx({ acceptTypes: ["image/*"] })

        handleFilesChange([makeFile("a.mp4", "video/mp4")], ctx)
        expect(stateOf(store).invalid).toBe(true)

        vi.advanceTimersByTime(1999)
        expect(stateOf(store).invalid).toBe(true)

        vi.advanceTimersByTime(1)
        expect(stateOf(store).invalid).toBe(false)
    })

    it("全通过时不碰 invalid：一次正常选择不该把边框染红", () => {
        const { ctx, store } = makeCtx()

        handleFilesChange([makeFile("a.png", "image/png")], ctx)

        expect(stateOf(store).invalid).toBe(false)
    })
})

describe("storeReducer", () => {
    it("SET_FILES 删掉不在新集合里的文件，并对新出现的补一份 idle 状态", () => {
        const kept = makeFile("kept.png", "image/png")
        const gone = makeFile("gone.png", "image/png")
        const files = new Map<File, FileState>()
        const state: StoreState = { files, dragOver: false, invalid: false }
        storeReducer(state, { type: "SET_FILES", files: [kept, gone] }, { files })

        const next = makeFile("next.png", "image/png")
        const after = storeReducer(state, { type: "SET_FILES", files: [kept, next] }, { files })

        expect([...after.files.keys()]).toEqual([kept, next])
        expect(after.files.get(kept)?.status).toBe("idle")
        expect(after.files.get(next)?.progress).toBe(0)
    })

    it("SET_FILES 不覆盖已在列表里的文件状态：进度与错误不被回填抹掉", () => {
        const file = makeFile("a.png", "image/png")
        const files = new Map<File, FileState>()
        const state: StoreState = { files, dragOver: false, invalid: false }
        storeReducer(state, { type: "SET_FILES", files: [file] }, { files })
        storeReducer(state, { type: "SET_PROGRESS", file, progress: 40 }, { files })
        const after = storeReducer(state, { type: "SET_FILES", files: [file] }, { files })

        expect(after.files.get(file)?.progress).toBe(40)
    })

    it("对不在 store 里的文件推进度/成功/失败：静默让位，不造出半截状态", () => {
        const stranger = makeFile("stranger.png", "image/png")
        const files = new Map<File, FileState>()
        const state: StoreState = { files, dragOver: false, invalid: false }

        for (const action of [
            { type: "SET_PROGRESS", file: stranger, progress: 50 },
            { type: "SET_SUCCESS", file: stranger },
            { type: "SET_ERROR", file: stranger, error: "boom" },
        ] as const) {
            expect(storeReducer(state, action, { files }).files.size).toBe(0)
        }
    })

    it("ADD_FILES 把整份集合交给 onValueChange（含上一轮的存量）", () => {
        const onValueChange = vi.fn<FileListCb>()
        const files = new Map<File, FileState>()
        const state: StoreState = { files, dragOver: false, invalid: false }
        const old = makeFile("old.png", "image/png")
        storeReducer(state, { type: "ADD_FILES", files: [old] }, { files, onValueChange })
        const next = makeFile("next.png", "image/png")
        storeReducer(state, { type: "ADD_FILES", files: [next] }, { files, onValueChange })

        expect(onValueChange).toHaveBeenLastCalledWith([old, next])
    })
})

describe("createFileUploadStore", () => {
    it("没绑上抛回调时 dispatch 只改内部状态：不外发，也不报错", () => {
        const store = makeStore()

        expect(() =>
            store.dispatch({ type: "ADD_FILES", files: [makeFile("a.png", "image/png")] }),
        ).not.toThrow()
        expect(store.getState().files.size).toBe(1)
    })

    it("绑定之后 dispatch 才外发：组件在渲染后绑，绑的是当下那份回调", () => {
        const store = makeStore()
        const emit = vi.fn<FileListCb>()
        store.bindValueChange(emit)
        const file = makeFile("a.png", "image/png")

        store.dispatch({ type: "ADD_FILES", files: [file] })

        expect(emit).toHaveBeenCalledWith([file])
    })

    it("重新绑定即换人收：旧回调不再收到后续 dispatch", () => {
        const store = makeStore()
        const stale = vi.fn<FileListCb>()
        store.bindValueChange(stale)
        const fresh = vi.fn<FileListCb>()
        store.bindValueChange(fresh)

        store.dispatch({ type: "ADD_FILES", files: [makeFile("a.png", "image/png")] })

        expect(stale).not.toHaveBeenCalled()
        expect(fresh).toHaveBeenCalledTimes(1)
    })

    it("解绑后不再外发：受控切非受控时不该继续往上传props", () => {
        const store = makeStore()
        const emit = vi.fn<FileListCb>()
        store.bindValueChange(emit)
        store.bindValueChange(undefined)

        store.dispatch({ type: "ADD_FILES", files: [makeFile("a.png", "image/png")] })

        expect(emit).not.toHaveBeenCalled()
    })
})

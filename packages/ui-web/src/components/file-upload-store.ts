/**
 * FileUpload 的状态容器与「选了文件之后怎么办」那条校验链 —— 两者都不需要 React。
 *
 * 原先住在一个 `.tsx` 里（`file-upload.tsx`），那意味着「超出 maxFiles 名额的文件被拒了几条、
 * accept 与 maxSize 同时不符时报几句、拒绝后 invalid 标记 2 秒后自己清」这些规则只能靠渲染整棵
 * 上传区才测得到。类型与 reducer 一起搬过来：组件只留装配（context、事件接线、皮肤）。
 *
 * 拒绝文案保持原样（英文、句子就地写）：它们不是错误码，也不进契约，改文案不改行为。
 */

export interface FileState {
    file: File
    progress: number
    error?: string
    status: "idle" | "uploading" | "error" | "success"
}

export interface StoreState {
    files: Map<File, FileState>
    dragOver: boolean
    invalid: boolean
}

export type StoreAction =
    | { type: "ADD_FILES"; files: File[] }
    | { type: "SET_FILES"; files: File[] }
    | { type: "SET_PROGRESS"; file: File; progress: number }
    | { type: "SET_SUCCESS"; file: File }
    | { type: "SET_ERROR"; file: File; error: string }
    | { type: "SET_DRAG_OVER"; dragOver: boolean }
    | { type: "SET_INVALID"; invalid: boolean }

export type Store = {
    getState: () => StoreState
    dispatch: (action: StoreAction) => void
    subscribe: (listener: () => void) => () => void
    /**
     * 绑定「文件集变了要上抛给谁」。由调用方在渲染之后（effect 里）装：
     * 建 store 时不收这个闭包，是为了让工厂只吃稳定输入——组件侧把 ref 闭包塞进渲染期的工厂，
     * 读到的就是装配那一刻的 props，而 dispatch 需要的永远是**当下**那份。
     */
    bindValueChange: (onValueChange?: (files: File[]) => void) => void
}

/** `onUpload` 的调用形状：组件侧的 props 类型与校验链共用一份，不各写一遍 */
export type FileUploadRequest = (
    files: File[],
    options: {
        onProgress: (file: File, progress: number) => void
        onSuccess: (file: File) => void
        onError: (file: File, error: Error) => void
    },
) => Promise<void> | void

/**
 * store reducer 的运行上下文：files 是与 state 同生的引用 Map（reducer 直接 mutate 后返回新引用），
 * onValueChange 由 {@link Store.bindValueChange} 事后装上，dispatch 时读的是当下那一份。
 */
interface StoreReducerCtx {
    files: Map<File, FileState>
    onValueChange?: (files: File[]) => void
}

/** 一条文件刚进 store 的样子：新增与替换共用 */
function idleEntry(file: File): FileState {
    return { file, progress: 0, status: "idle" }
}

/**
 * 改单条文件的状态。不在 map 里就不动——上传回调可能在文件被移除之后才回来，
 * 那时补一行状态等于把用户已经删掉的文件塞回去。
 */
function patchFile(files: Map<File, FileState>, file: File, patch: Partial<FileState>) {
    const current = files.get(file)
    if (current) files.set(file, { ...current, ...patch })
}

export function storeReducer(
    prevState: StoreState,
    action: StoreAction,
    { files, onValueChange }: StoreReducerCtx,
): StoreState {
    switch (action.type) {
        case "ADD_FILES": {
            for (const file of action.files) files.set(file, idleEntry(file))
            if (onValueChange) {
                onValueChange([...files.values()].map((fileState) => fileState.file))
            }
            break
        }

        case "SET_FILES": {
            const incoming = new Set(action.files)
            for (const existing of files.keys()) {
                if (!incoming.has(existing)) files.delete(existing)
            }
            for (const file of action.files) {
                if (!files.has(file)) files.set(file, idleEntry(file))
            }
            break
        }

        case "SET_PROGRESS":
            patchFile(files, action.file, { progress: action.progress, status: "uploading" })
            break

        case "SET_SUCCESS":
            patchFile(files, action.file, { progress: 100, status: "success" })
            break

        case "SET_ERROR":
            patchFile(files, action.file, { error: action.error, status: "error" })
            break

        case "SET_DRAG_OVER":
            return { ...prevState, dragOver: action.dragOver }

        case "SET_INVALID":
            return { ...prevState, invalid: action.invalid }

        default:
            return prevState
    }
    return { ...prevState, files }
}

/**
 * 建一个 store：`files` 由调用方持有（React 侧用 useLazyRef 保证同一实例），
 * `initialInvalid` 是受控 invalid 初值；上抛回调随后由 {@link Store.bindValueChange} 装，
 * dispatch 时读的是绑定的那一份（不绑定就只改内部状态，不外发）。
 */
export function createFileUploadStore(options: {
    files: Map<File, FileState>
    initialInvalid: boolean
}): Store {
    const listeners = new Set<() => void>()
    let state: StoreState = {
        files: options.files,
        dragOver: false,
        invalid: options.initialInvalid,
    }

    const reducerCtx: StoreReducerCtx = {
        files: options.files,
    }

    return {
        getState: () => state,
        dispatch: (action) => {
            state = storeReducer(state, action, reducerCtx)
            for (const listener of listeners) {
                listener()
            }
        },
        subscribe: (listener) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
        bindValueChange: (onValueChange) => {
            reducerCtx.onValueChange = onValueChange
        },
    }
}

/**
 * 回调契约：组件 props 与校验链的 ctx 共用一份声明，不各写一遍。
 * `onValueChange` 只走 {@link Store.bindValueChange} 那条出口（reducer 里发），
 * 校验链再发一次就是同一次选择通知两遍——所以它不进 {@link FilesChangeCtx}。
 */
export interface FileUploadCallbacks {
    onValueChange?: (files: File[]) => void
    onAccept?: (files: File[]) => void
    onFileAccept?: (file: File) => void
    onFileReject?: (file: File, message: string) => void
    onFileValidate?: (file: File) => string | null | undefined
    onUpload?: FileUploadRequest
}

/**
 * 文件选择后的处理链：按 maxFiles / onFileValidate / accept / maxSize 逐文件校验，
 * 拒绝的走 onFileReject，通过的入 store（ADD_FILES）并按需触发上传。
 * 独立成模块级函数：验证逻辑可单测，也让 FileUpload 主组件只留装配。
 * ctx 是组件当下的一份 props 快照——链上每一步都不读 React。
 */
export interface FilesChangeCtx extends Omit<FileUploadCallbacks, "onValueChange"> {
    disabled: boolean
    maxFiles?: number
    maxSize?: number
    acceptTypes?: string[]
    store: Store
    triggerUpload: (files: File[]) => void
}

/** accept 匹配：精确 MIME、扩展名（.pdf）或通配 MIME（image/*） */
export function matchesAccept(file: File, acceptTypes: string[]): boolean {
    const fileType = file.type
    const fileExtension = `.${file.name.split(".").pop()}`

    return acceptTypes.some(
        (type) =>
            type === fileType ||
            type === fileExtension ||
            (type.includes("/*") && fileType.startsWith(type.replace("/*", "/"))),
    )
}

/** 单文件的拒绝信息：onFileValidate 命中即短路；accept 与 maxSize 同时不符时两条都报 */
export function getRejectionMessages(file: File, ctx: FilesChangeCtx): string[] {
    const validationMessage = ctx.onFileValidate?.(file)
    if (validationMessage) return [validationMessage]

    const messages: string[] = []
    if (ctx.acceptTypes && !matchesAccept(file, ctx.acceptTypes)) {
        messages.push("File type not accepted")
    }
    if (ctx.maxSize && file.size > ctx.maxSize) {
        messages.push("File too large")
    }
    return messages
}

export function handleFilesChange(originalFiles: File[], ctx: FilesChangeCtx): void {
    if (ctx.disabled) return

    // 超出 maxFiles 剩余名额的先拒（onFileValidate 有信息时优先用它）
    const remainingSlotCount = ctx.maxFiles
        ? Math.max(0, ctx.maxFiles - ctx.store.getState().files.size)
        : originalFiles.length
    const overflowFiles = originalFiles.slice(remainingSlotCount)
    overflowFiles.forEach((file) => {
        const rejectionMessage =
            ctx.onFileValidate?.(file) || `Maximum ${ctx.maxFiles} files allowed`
        ctx.onFileReject?.(file, rejectionMessage)
    })

    const filesToProcess = originalFiles.slice(0, remainingSlotCount)
    const acceptedFiles = filesToProcess.filter((file) => {
        const rejectionMessages = getRejectionMessages(file, ctx)
        for (const message of rejectionMessages) {
            ctx.onFileReject?.(file, message)
        }
        return rejectionMessages.length === 0
    })
    const hasError = overflowFiles.length > 0 || acceptedFiles.length < filesToProcess.length

    if (hasError) {
        ctx.store.dispatch({ type: "SET_INVALID", invalid: hasError })
        setTimeout(() => {
            ctx.store.dispatch({ type: "SET_INVALID", invalid: false })
        }, 2000)
    }

    if (acceptedFiles.length > 0) {
        addAcceptedFiles(acceptedFiles, ctx)
    }
}

/** 通过校验的文件：入 store（受控上抛由 reducer 的 ADD_FILES 分支负责）、上抛各回调，有 onUpload 时下一帧开始上传 */
function addAcceptedFiles(acceptedFiles: File[], ctx: FilesChangeCtx): void {
    ctx.store.dispatch({ type: "ADD_FILES", files: acceptedFiles })

    if (ctx.onAccept) {
        ctx.onAccept(acceptedFiles)
    }

    for (const file of acceptedFiles) {
        ctx.onFileAccept?.(file)
    }

    if (ctx.onUpload) {
        requestAnimationFrame(() => {
            ctx.triggerUpload(acceptedFiles)
        })
    }
}

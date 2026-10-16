/** FileUpload 的状态容器与文件校验链：都不依赖 React，组件只留装配。拒绝文案就地写英文、非错误码不进契约，改文案不改行为 */

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
    /** 绑定「文件集变了要上抛给谁」；晚于 store 构造才装，让工厂只吃稳定输入——dispatch 永远读当下那份 */
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

/** store reducer 的运行上下文：files 是与 state 同生的引用 Map（reducer 直接 mutate 后返回新引用） */
interface StoreReducerCtx {
    files: Map<File, FileState>
    onValueChange?: (files: File[]) => void
}

/** 一条文件刚进 store 的样子：新增与替换共用 */
function idleEntry(file: File): FileState {
    return { file, progress: 0, status: "idle" }
}

/** 改单条文件状态；不在 map 里就不动——上传回调可能在文件被删之后才回来，补状态等于把已删文件塞回去 */
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

/** 建 store：files 引用由调用方持有（React 侧 useLazyRef 保证同实例）；不 bindValueChange 就只改内部状态、不外发 */
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

/** 回调契约：props 与校验链 ctx 共用一份。onValueChange 只走 bindValueChange 那条出口，校验链重发=通知两遍，故不进 FilesChangeCtx */
export interface FileUploadCallbacks {
    onValueChange?: (files: File[]) => void
    onAccept?: (files: File[]) => void
    onFileAccept?: (file: File) => void
    onFileReject?: (file: File, message: string) => void
    onFileValidate?: (file: File) => string | null | undefined
    onUpload?: FileUploadRequest
}

/** handleFilesChange 的 ctx：组件当下的一份 props 快照，链上每一步都不读 React */
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

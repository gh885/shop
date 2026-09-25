"use client"

/* oxlint-disable react/immutability, jsx-a11y/prefer-tag-over-role, jsx-a11y/role-supports-aria-props */
import * as React from "react"

import { cn } from "src/lib/utils"
import { useAsRef } from "src/hooks/use-as-ref"
import { useLazyRef } from "src/hooks/use-lazy-ref"

const ROOT_NAME = "FileUpload"
const DROPZONE_NAME = "FileUploadDropzone"

type Direction = "ltr" | "rtl"

interface FileState {
    file: File
    progress: number
    error?: string
    status: "idle" | "uploading" | "error" | "success"
}

interface StoreState {
    files: Map<File, FileState>
    dragOver: boolean
    invalid: boolean
}

type StoreAction =
    | { type: "ADD_FILES"; files: File[] }
    | { type: "SET_FILES"; files: File[] }
    | { type: "SET_PROGRESS"; file: File; progress: number }
    | { type: "SET_SUCCESS"; file: File }
    | { type: "SET_ERROR"; file: File; error: string }
    | { type: "SET_DRAG_OVER"; dragOver: boolean }
    | { type: "SET_INVALID"; invalid: boolean }

type Store = {
    getState: () => StoreState
    dispatch: (action: StoreAction) => void
    subscribe: (listener: () => void) => () => void
}

const StoreContext = React.createContext<Store | undefined>(undefined)

function useStoreContext(consumerName: string) {
    const context = React.useContext(StoreContext)
    if (!context) {
        throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``)
    }
    return context
}

function useStore<T>(selector: (state: StoreState) => T): T {
    const store = useStoreContext("useStore")

    const lastValueRef = useLazyRef<{ value: T; state: StoreState } | undefined>(() => undefined)

    const getSnapshot = React.useCallback(() => {
        const state = store.getState()
        const prevValue = lastValueRef.current

        if (prevValue && prevValue.state === state) {
            return prevValue.value
        }

        const nextValue = selector(state)
        lastValueRef.current = { value: nextValue, state }
        return nextValue
    }, [store, selector, lastValueRef])

    return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

interface FileUploadContextValue {
    inputId: string
    dropzoneId: string
    labelId: string
    disabled: boolean
    dir: Direction
    inputRef: React.RefObject<HTMLInputElement | null>
}

const FileUploadContext = React.createContext<FileUploadContextValue | undefined>(undefined)

function useFileUploadContext(consumerName: string) {
    const context = React.useContext(FileUploadContext)
    if (!context) {
        throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``)
    }
    return context
}

interface FileUploadProps extends Omit<React.ComponentProps<"div">, "defaultValue" | "onChange"> {
    value?: File[]
    defaultValue?: File[]
    onValueChange?: (files: File[]) => void
    onAccept?: (files: File[]) => void
    onFileAccept?: (file: File) => void
    onFileReject?: (file: File, message: string) => void
    onFileValidate?: (file: File) => string | null | undefined
    onUpload?: (
        files: File[],
        options: {
            onProgress: (file: File, progress: number) => void
            onSuccess: (file: File) => void
            onError: (file: File, error: Error) => void
        },
    ) => Promise<void> | void
    accept?: string
    maxFiles?: number
    maxSize?: number
    dir?: Direction
    label?: string
    name?: string

    disabled?: boolean
    invalid?: boolean
    multiple?: boolean
    required?: boolean
}

/**
 * store reducer 的运行上下文：files 是与 state 同生的引用 Map（reducer 直接 mutate 后返回新引用），
 * onValueChange 用闭包包装、dispatch 时读 propsRef 最新值（等价于原来 dispatch 内读 propsRef.current）。
 */
interface StoreReducerCtx {
    files: Map<File, FileState>
    onValueChange?: (files: File[]) => void
}

function storeReducer(
    prevState: StoreState,
    action: StoreAction,
    { files, onValueChange }: StoreReducerCtx,
): StoreState {
    switch (action.type) {
        case "ADD_FILES": {
            for (const file of action.files) {
                files.set(file, {
                    file,
                    progress: 0,
                    status: "idle",
                })
            }

            if (onValueChange) {
                onValueChange([...files.values()].map((fileState) => fileState.file))
            }
            return { ...prevState, files }
        }

        case "SET_FILES": {
            const newFileSet = new Set(action.files)
            for (const existingFile of files.keys()) {
                if (!newFileSet.has(existingFile)) {
                    files.delete(existingFile)
                }
            }

            for (const file of action.files) {
                const existingState = files.get(file)
                if (!existingState) {
                    files.set(file, {
                        file,
                        progress: 0,
                        status: "idle",
                    })
                }
            }
            return { ...prevState, files }
        }

        case "SET_PROGRESS": {
            const fileState = files.get(action.file)
            if (fileState) {
                files.set(action.file, {
                    ...fileState,
                    progress: action.progress,
                    status: "uploading",
                })
            }
            return { ...prevState, files }
        }

        case "SET_SUCCESS": {
            const fileState = files.get(action.file)
            if (fileState) {
                files.set(action.file, {
                    ...fileState,
                    progress: 100,
                    status: "success",
                })
            }
            return { ...prevState, files }
        }

        case "SET_ERROR": {
            const fileState = files.get(action.file)
            if (fileState) {
                files.set(action.file, {
                    ...fileState,
                    error: action.error,
                    status: "error",
                })
            }
            return { ...prevState, files }
        }

        case "SET_DRAG_OVER": {
            return { ...prevState, dragOver: action.dragOver }
        }

        case "SET_INVALID": {
            return { ...prevState, invalid: action.invalid }
        }

        default:
            return prevState
    }
}

/**
 * 文件选择后的处理链：按 maxFiles / onFileValidate / accept / maxSize 逐文件校验，
 * 拒绝的走 onFileReject，通过的入 store（ADD_FILES）并按需触发上传。
 * 独立成模块级函数：验证逻辑可单测，也让 FileUpload 主组件只留装配。
 */
interface FilesChangeCtx {
    disabled: boolean
    maxFiles?: number
    maxSize?: number
    acceptTypes?: string[]
    isControlled: boolean
    store: Store
    onValueChange?: (files: File[]) => void
    onAccept?: (files: File[]) => void
    onFileAccept?: (file: File) => void
    onFileReject?: (file: File, message: string) => void
    onFileValidate?: (file: File) => string | null | undefined
    onUpload?: FileUploadProps["onUpload"]
    triggerUpload: (files: File[]) => void
}

/** accept 匹配：精确 MIME、扩展名（.pdf）或通配 MIME（image/*） */
function matchesAccept(file: File, acceptTypes: string[]): boolean {
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
function getRejectionMessages(file: File, ctx: FilesChangeCtx): string[] {
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

function handleFilesChange(originalFiles: File[], ctx: FilesChangeCtx): void {
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

/** 通过校验的文件：入 store、上抛各回调，有 onUpload 时下一帧开始上传 */
function addAcceptedFiles(acceptedFiles: File[], ctx: FilesChangeCtx): void {
    ctx.store.dispatch({ type: "ADD_FILES", files: acceptedFiles })

    if (ctx.isControlled && ctx.onValueChange) {
        const currentFiles = [...ctx.store.getState().files.values()].map((f) => f.file)
        ctx.onValueChange([...currentFiles])
    }

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

function FileUpload(props: FileUploadProps) {
    const {
        value,
        defaultValue,
        onValueChange,
        onAccept,
        onFileAccept,
        onFileReject,
        onFileValidate,
        onUpload,
        accept,
        maxFiles,
        maxSize,
        dir: dirProp,
        label,
        name,

        disabled = false,
        invalid = false,
        multiple = false,
        required = false,
        children,
        className,
        ...rootProps
    } = props

    const inputId = React.useId()
    const dropzoneId = React.useId()
    const labelId = React.useId()

    const dir = dirProp ?? "ltr"
    const listeners = useLazyRef(() => new Set<() => void>()).current
    const files = useLazyRef<Map<File, FileState>>(() => new Map()).current
    const inputRef = React.useRef<HTMLInputElement>(null)
    const isControlled = value !== undefined

    const propsRef = useAsRef({
        onValueChange,
        onAccept,
        onFileAccept,
        onFileReject,
        onFileValidate,
        onUpload,
    })

    const store = React.useMemo<Store>(() => {
        let state: StoreState = {
            files,
            dragOver: false,
            invalid: invalid,
        }

        const reducerCtx: StoreReducerCtx = {
            files,
            // 闭包包装：dispatch 时读 propsRef.current 拿到最新 onValueChange（与原来的 dispatch 内读等价）
            onValueChange: (next) => propsRef.current.onValueChange?.(next),
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
        }
    }, [listeners, files, invalid, propsRef])

    const acceptTypes = React.useMemo(
        () => accept?.split(",").map((t) => t.trim()) ?? undefined,
        [accept],
    )

    const onProgress = useLazyRef(() => {
        let frame = 0
        return (file: File, progress: number) => {
            if (frame) return
            frame = requestAnimationFrame(() => {
                frame = 0
                store.dispatch({
                    type: "SET_PROGRESS",
                    file,
                    progress: Math.min(Math.max(0, progress), 100),
                })
            })
        }
    }).current

    React.useEffect(() => {
        if (isControlled) {
            store.dispatch({ type: "SET_FILES", files: value })
        } else if (defaultValue && defaultValue.length > 0 && store.getState().files.size === 0) {
            store.dispatch({ type: "SET_FILES", files: defaultValue })
        }
    }, [value, defaultValue, isControlled, store])

    const onFilesUpload = React.useCallback(
        async (filesToUpload: File[]) => {
            try {
                for (const file of filesToUpload) {
                    store.dispatch({ type: "SET_PROGRESS", file, progress: 0 })
                }

                if (propsRef.current.onUpload) {
                    await propsRef.current.onUpload(filesToUpload, {
                        onProgress,
                        onSuccess: (file) => {
                            store.dispatch({ type: "SET_SUCCESS", file })
                        },
                        onError: (file, error) => {
                            store.dispatch({
                                type: "SET_ERROR",
                                file,
                                error: error.message || "Upload failed",
                            })
                        },
                    })
                } else {
                    for (const file of filesToUpload) {
                        store.dispatch({ type: "SET_SUCCESS", file })
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Upload failed"
                for (const file of filesToUpload) {
                    store.dispatch({
                        type: "SET_ERROR",
                        file,
                        error: errorMessage,
                    })
                }
            }
        },
        [store, propsRef, onProgress],
    )

    const onFilesChange = React.useCallback(
        (originalFiles: File[]) => {
            handleFilesChange(originalFiles, {
                disabled,
                maxFiles,
                maxSize,
                acceptTypes,
                isControlled,
                store,
                onValueChange: propsRef.current.onValueChange,
                onAccept: propsRef.current.onAccept,
                onFileAccept: propsRef.current.onFileAccept,
                onFileReject: propsRef.current.onFileReject,
                onFileValidate: propsRef.current.onFileValidate,
                onUpload: propsRef.current.onUpload,
                triggerUpload: onFilesUpload,
            })
        },
        [disabled, maxFiles, maxSize, acceptTypes, isControlled, store, propsRef, onFilesUpload],
    )

    const onInputChange = React.useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const selectedFiles = [...(event.target.files ?? [])]
            onFilesChange(selectedFiles)
            event.target.value = ""
        },
        [onFilesChange],
    )

    const contextValue = React.useMemo<FileUploadContextValue>(
        () => ({
            dropzoneId,
            inputId,
            labelId,
            dir,
            disabled,
            inputRef,
        }),
        [dropzoneId, inputId, labelId, dir, disabled],
    )

    const RootPrimitive = "div"

    return (
        <StoreContext.Provider value={store}>
            <FileUploadContext.Provider value={contextValue}>
                <RootPrimitive
                    data-disabled={disabled ? "" : undefined}
                    data-slot="file-upload"
                    dir={dir}
                    {...rootProps}
                    className={cn("relative flex flex-col gap-2", className)}
                >
                    {children}
                    <input
                        type="file"
                        id={inputId}
                        aria-labelledby={labelId}
                        aria-describedby={dropzoneId}
                        ref={inputRef}
                        tabIndex={-1}
                        accept={accept}
                        name={name}
                        className="sr-only"
                        disabled={disabled}
                        multiple={multiple}
                        required={required}
                        onChange={onInputChange}
                    />
                    <div
                        id={labelId}
                        className="sr-only"
                    >
                        {label ?? "File upload"}
                    </div>
                </RootPrimitive>
            </FileUploadContext.Provider>
        </StoreContext.Provider>
    )
}

interface FileUploadDropzoneProps extends React.ComponentProps<"div"> {}

function FileUploadDropzone(props: FileUploadDropzoneProps) {
    const {
        className,
        onClick: onClickProp,
        onDragOver: onDragOverProp,
        onDragEnter: onDragEnterProp,
        onDragLeave: onDragLeaveProp,
        onDrop: onDropProp,
        onPaste: onPasteProp,
        onKeyDown: onKeyDownProp,
        ...dropzoneProps
    } = props

    const context = useFileUploadContext(DROPZONE_NAME)
    const store = useStoreContext(DROPZONE_NAME)
    const dragOver = useStore((state) => state.dragOver)
    const invalid = useStore((state) => state.invalid)

    const propsRef = useAsRef({
        onClick: onClickProp,
        onDragOver: onDragOverProp,
        onDragEnter: onDragEnterProp,
        onDragLeave: onDragLeaveProp,
        onDrop: onDropProp,
        onPaste: onPasteProp,
        onKeyDown: onKeyDownProp,
    })

    const onClick = React.useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            propsRef.current.onClick?.(event)

            if (event.defaultPrevented) return

            const target = event.target

            const isFromTrigger =
                target instanceof HTMLElement && target.closest('[data-slot="file-upload-trigger"]')

            if (!isFromTrigger) {
                context.inputRef.current?.click()
            }
        },
        [context.inputRef, propsRef],
    )

    const onDragOver = React.useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            propsRef.current.onDragOver?.(event)

            if (event.defaultPrevented) return

            event.preventDefault()
            store.dispatch({ type: "SET_DRAG_OVER", dragOver: true })
        },
        [store, propsRef],
    )

    const onDragEnter = React.useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            propsRef.current.onDragEnter?.(event)

            if (event.defaultPrevented) return

            event.preventDefault()
            store.dispatch({ type: "SET_DRAG_OVER", dragOver: true })
        },
        [store, propsRef],
    )

    const onDragLeave = React.useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            propsRef.current.onDragLeave?.(event)

            if (event.defaultPrevented) return

            const relatedTarget = event.relatedTarget
            if (
                relatedTarget &&
                relatedTarget instanceof Node &&
                event.currentTarget.contains(relatedTarget)
            ) {
                return
            }

            event.preventDefault()
            store.dispatch({ type: "SET_DRAG_OVER", dragOver: false })
        },
        [store, propsRef],
    )

    const onDrop = React.useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            propsRef.current.onDrop?.(event)

            if (event.defaultPrevented) return

            event.preventDefault()
            store.dispatch({ type: "SET_DRAG_OVER", dragOver: false })

            const selectedFiles = [...event.dataTransfer.files]
            const inputElement = context.inputRef.current
            if (!inputElement) return

            const dataTransfer = new DataTransfer()
            for (const file of selectedFiles) {
                dataTransfer.items.add(file)
            }

            inputElement.files = dataTransfer.files
            inputElement.dispatchEvent(new Event("change", { bubbles: true }))
        },
        [store, context.inputRef, propsRef],
    )

    const onPaste = React.useCallback(
        (event: React.ClipboardEvent<HTMLDivElement>) => {
            propsRef.current.onPaste?.(event)

            if (event.defaultPrevented) return

            event.preventDefault()
            store.dispatch({ type: "SET_DRAG_OVER", dragOver: false })

            const items = event.clipboardData.items
            const selectedFiles: File[] = []
            for (let i = 0; i < items.length; i++) {
                const item = items[i]
                if (item?.kind === "file") {
                    const file = item.getAsFile()
                    if (file) {
                        selectedFiles.push(file)
                    }
                }
            }

            if (selectedFiles.length === 0) return

            const inputElement = context.inputRef.current
            if (!inputElement) return

            const dataTransfer = new DataTransfer()
            for (const file of selectedFiles) {
                dataTransfer.items.add(file)
            }

            inputElement.files = dataTransfer.files
            inputElement.dispatchEvent(new Event("change", { bubbles: true }))
        },
        [store, context.inputRef, propsRef],
    )

    const onKeyDown = React.useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            propsRef.current.onKeyDown?.(event)

            if (!event.defaultPrevented && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault()
                context.inputRef.current?.click()
            }
        },
        [context.inputRef, propsRef],
    )

    const DropzonePrimitive = "div"

    return (
        <DropzonePrimitive
            role="region"
            id={context.dropzoneId}
            aria-controls={context.inputId}
            aria-disabled={context.disabled}
            aria-invalid={invalid}
            data-disabled={context.disabled ? "" : undefined}
            data-dragging={dragOver ? "" : undefined}
            data-invalid={invalid ? "" : undefined}
            data-slot="file-upload-dropzone"
            dir={context.dir}
            tabIndex={context.disabled ? undefined : 0}
            {...dropzoneProps}
            className={cn(
                "relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors outline-none select-none hover:bg-accent/30 focus-visible:border-ring/50 data-disabled:pointer-events-none data-dragging:border-primary/30 data-dragging:bg-accent/30 data-invalid:border-destructive data-invalid:ring-destructive/20",
                className,
            )}
            onClick={onClick}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
        />
    )
}

export { FileUpload, FileUploadDropzone }

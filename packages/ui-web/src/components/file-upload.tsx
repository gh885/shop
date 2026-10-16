"use client"

/* oxlint-disable react/immutability, jsx-a11y/prefer-tag-over-role, jsx-a11y/role-supports-aria-props */
import * as React from "react"

import { cn } from "src/lib/utils"
import { useAsRef } from "src/hooks/use-as-ref"
import { useLazyRef } from "src/hooks/use-lazy-ref"

import {
    createFileUploadStore,
    handleFilesChange,
    type FileState,
    type FileUploadCallbacks,
    type Store,
    type StoreState,
} from "./file-upload-store"

const ROOT_NAME = "FileUpload"
const DROPZONE_NAME = "FileUploadDropzone"

type Direction = "ltr" | "rtl"

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

interface FileUploadProps
    extends FileUploadCallbacks, Omit<React.ComponentProps<"div">, "defaultValue" | "onChange"> {
    value?: File[]
    defaultValue?: File[]
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

    const store = React.useMemo<Store>(
        () => createFileUploadStore({ files, initialInvalid: invalid }),
        [files, invalid],
    )

    // 渲染后再绑上抛回调：dispatch 时读 propsRef.current 拿当下 props；建 store 的工厂不收此闭包（渲染期把 ref 递进函数会被 react(refs) 拦）
    React.useEffect(() => {
        store.bindValueChange((next) => propsRef.current.onValueChange?.(next))
    }, [store, propsRef])

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
                store,
                onAccept: propsRef.current.onAccept,
                onFileAccept: propsRef.current.onFileAccept,
                onFileReject: propsRef.current.onFileReject,
                onFileValidate: propsRef.current.onFileValidate,
                onUpload: propsRef.current.onUpload,
                triggerUpload: onFilesUpload,
            })
        },
        [disabled, maxFiles, maxSize, acceptTypes, store, propsRef, onFilesUpload],
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
            role="button"
            id={context.dropzoneId}
            aria-labelledby={context.labelId}
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
                "relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors outline-none select-none hover:bg-accent/30 focus-visible:border-ring/50 focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:pointer-events-none data-dragging:border-primary/30 data-dragging:bg-accent/30 data-invalid:border-destructive data-invalid:ring-destructive/20",
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

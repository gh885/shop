import * as React from "react"
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core"
import {
    SortableContext,
    arrayMove,
    rectSortingStrategy,
    sortableKeyboardCoordinates,
    useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, ImagePlus, X } from "lucide-react"

import { cn } from "src/lib/utils"
import { Spinner } from "src/components/ui/spinner"
import { FileUpload, FileUploadDropzone } from "./file-upload"

const ACCEPT_IMAGE = "image/*"
const MAX_SIZE_MB = 10
/** value 缺省时的稳定空数组引用（避免每次渲染新建，干扰依赖数组的 memo/effect） */
const EMPTY_IMAGES: string[] = []

function fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error("读取图片失败"))
        reader.readAsDataURL(file)
    })
}

/** 选择/拖入本地图片后的默认预览：读成 dataURL（兼容后端未接入，图片先本地预览/暂存） */
async function defaultPreview(file: File): Promise<string> {
    return fileToDataURL(file)
}

export interface ImageUploadProps {
    /** 当前图片的最终地址（受控）；无 = 空态上传触发区 */
    value?: string
    /** 值变化上抛：上传完成给最终地址，删除给 undefined */
    onChange?: (value: string | undefined) => void
    /** 选择文件后、上传前的本地预览；默认 FileReader 读成 dataURL */
    preview?: (file: File) => Promise<string> | string
    /** 上传（持久化）函数；不传则直接用本地预览作为最终值 */
    upload?: (file: File) => Promise<string>
    /**
     * 把「受控值」转成预览 src。默认原样返回（适用于 value 是完整 URL）。
     * 若 value 存的是相对 key（如图片上传只存 key、展示时再拼域名），须传解析器（如 imgUrl）。
     */
    resolveSrc?: (value: string) => string
    /** 形状：tile 方形瓦片（网格图片）/ circle 圆形（头像/logo） */
    shape?: "tile" | "circle"
    /** 宽高尺寸类名，如 size-24 */
    size?: string
    /** 空态文案，如「上传图片」「上传头像」 */
    label?: string
    /** 空态时是否显示图标 */
    showIcon?: boolean
    /** 可选的提示图标（默认 ImagePlus），优先级高于 showIcon */
    icon?: React.ReactNode
    accept?: string
    /** 单张大小上限（MB），默认 10 */
    maxSizeMB?: number
    /** 是否显示删除（已填值时右上角 ✕） */
    removable?: boolean
    disabled?: boolean
    className?: string
}

/**
 * 单张图片上传槽（通用原子）：空态是可点击/可拖拽/可粘贴的上传区，填值后变成缩略图预览。
 *
 * 纯受控：value 由外层持有。选文件、`accept`/大小校验、拖拽、粘贴复用底层 FileUpload 组件；
 * 这里只负责「File → 最终 URL」的桥接（preview 本地预览 → upload 持久化 → onChange）。
 *
 * 用这个原子可拼出两种形态：
 *  - 头像：shape=circle + removable、单值
 *  - 多图网格：ImageUploadGrid 用多个槽位编排
 */
export function ImageUpload({
    value,
    onChange,
    preview = defaultPreview,
    upload,
    resolveSrc,
    shape = "tile",
    size = "size-24",
    label,
    showIcon = true,
    icon,
    accept = ACCEPT_IMAGE,
    maxSizeMB = MAX_SIZE_MB,
    removable = false,
    disabled = false,
    className,
}: ImageUploadProps) {
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState<string | undefined>()

    const circular = shape === "circle"

    async function handleFile(file: File | undefined) {
        if (!file || disabled) return
        setError(undefined)
        try {
            setBusy(true)
            const local = await preview(file)
            const final = upload ? await upload(file) : local
            onChange?.(final)
        } catch (error) {
            setError(error instanceof Error ? error.message : "图片上传失败")
        } finally {
            setBusy(false)
        }
    }

    // 已填值：缩略图预览（+ 可选删除 / 上传中遮罩）
    if (value) {
        return (
            <div
                className={cn(
                    "relative overflow-hidden",
                    circular ? "rounded-full" : "rounded-lg",
                    size,
                    className,
                )}
            >
                <img
                    src={resolveSrc ? resolveSrc(value) : value}
                    alt={label ?? "图片"}
                    className="size-full object-cover"
                />
                {removable && (
                    <button
                        type="button"
                        onClick={() => onChange?.(undefined)}
                        aria-label="移除图片"
                        className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm transition-colors hover:text-destructive"
                    >
                        <X className="size-3.5" />
                    </button>
                )}
            </div>
        )
    }

    // 空态：复用 FileUpload 的 Dropzone（点击/拖拽/粘贴 + 校验），样式覆盖成上传瓦片
    return (
        <div className="flex flex-col items-start gap-1.5">
            <FileUpload
                accept={accept}
                maxFiles={1}
                maxSize={maxSizeMB * 1024 * 1024}
                disabled={disabled}
                onAccept={(files) => handleFile(files[0])}
                onFileReject={(_, message) => setError(message)}
            >
                <FileUploadDropzone
                    className={cn(
                        "shrink-0 cursor-pointer p-0! gap-1.5! border! border-dashed! border-input! bg-muted/40! text-muted-foreground transition-colors hover:bg-muted! hover:border-foreground/30! data-dragging:border-primary/40! data-dragging:bg-accent/40!",
                        size,
                        circular ? "rounded-full!" : "rounded-lg!",
                        className,
                    )}
                >
                    {busy ? (
                        <Spinner className="size-5" />
                    ) : (
                        <>
                            {icon ?? (showIcon ? <ImagePlus className="size-5" /> : null)}
                            {label ? <span className="text-xs">{label}</span> : null}
                        </>
                    )}
                </FileUploadDropzone>
            </FileUpload>
            {error ? (
                <p className="max-w-24 text-xs leading-tight text-destructive">{error}</p>
            ) : null}
        </div>
    )
}

export interface ImageUploadGridProps extends Omit<
    ImageUploadProps,
    "value" | "onChange" | "shape"
> {
    /** 多图地址数组（受控）；顺序即展示顺序 */
    value?: string[]
    onChange: (value: string[]) => void
    /** 最多可传数量，默认 5 */
    maxCount?: number
    shape?: "tile"
    /** 标记「封面/主图」的瓦片下标，默认 0（第一张即主图，随拖拽变更） */
    coverIndex?: number
    /** 封面徽标文案（如「主图」）；不传则不显示徽标 */
    coverLabel?: string
}

/** 可拖拽的图瓦片外壳：给已填图加拖拽句柄 + 拖拽态样式，内部渲染 ImageUpload */
function SortableTile({
    id,
    coverBadge,
    children,
}: {
    id: string
    coverBadge?: React.ReactNode
    children: React.ReactNode
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
    })

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: transform ? CSS.Transform.toString(transform) : undefined,
                transition,
            }}
            {...attributes}
            className={cn("relative shrink-0 touch-none", isDragging && "z-10 opacity-90")}
        >
            {children}
            {coverBadge ? (
                <span className="pointer-events-none absolute bottom-1 left-1 z-10 rounded-md bg-foreground px-1.5 py-0.5 text-3xs font-medium text-background">
                    {coverBadge}
                </span>
            ) : null}
            {/* 拖拽句柄（避免与右上角删除、点击上传冲突） */}
            <button
                type="button"
                aria-label="拖动调整顺序"
                {...listeners}
                className="absolute -top-2 -left-2 z-10 flex size-6 cursor-grab items-center justify-center rounded-full bg-background text-muted-foreground shadow ring-1 ring-border active:cursor-grabbing"
            >
                <GripVertical className="size-3.5" />
            </button>
        </div>
    )
}

/**
 * 可排序多图网格（商品图等）：已填图可拖拽换序（第一张即主图/封面），其余空位渲染为虚线「上传图片」瓦片。
 * 底层复用 ImageUpload（即复用 FileUpload 的校验/拖拽）；value 为有序数组、受控上抛。
 */
export function ImageUploadGrid({
    value = EMPTY_IMAGES,
    onChange,
    maxCount = 5,
    size = "size-24",
    label = "上传图片",
    coverIndex = 0,
    coverLabel,
    upload,
    preview,
    accept,
    maxSizeMB,
    disabled,
    className,
    ...rest
}: ImageUploadGridProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    )

    function onDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const from = value.indexOf(String(active.id))
        const to = value.indexOf(String(over.id))
        if (from === -1 || to === -1) return
        onChange(arrayMove(value, from, to))
    }

    function append(url: string | undefined) {
        if (url) onChange([...value, url])
    }

    function removeAt(index: number) {
        onChange(value.filter((_, i) => i !== index))
    }

    const emptyCount = Math.max(0, maxCount - value.length)

    return (
        <div className={cn("flex flex-wrap gap-3", className)}>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
            >
                <SortableContext
                    items={value}
                    strategy={rectSortingStrategy}
                >
                    {value.map((url, i) => (
                        <SortableTile
                            key={url}
                            id={url}
                            coverBadge={coverLabel && i === coverIndex ? coverLabel : undefined}
                        >
                            <ImageUpload
                                value={url}
                                shape="tile"
                                size={size}
                                removable
                                disabled={disabled}
                                onChange={() => removeAt(i)}
                                {...rest}
                            />
                        </SortableTile>
                    ))}
                </SortableContext>
            </DndContext>
            {Array.from({ length: emptyCount }).map((_, i) => (
                // 空位是临时上传槽，无稳定数据键，按索引 key 合理
                // oxlint-disable-next-line react/no-array-index-key
                <ImageUpload
                    key={`empty-${i}`}
                    shape="tile"
                    size={size}
                    label={label}
                    disabled={disabled}
                    upload={upload}
                    preview={preview}
                    accept={accept}
                    maxSizeMB={maxSizeMB}
                    onChange={append}
                    {...rest}
                />
            ))}
        </div>
    )
}

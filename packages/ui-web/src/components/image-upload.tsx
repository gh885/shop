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

import { cn, type CSSVars } from "src/lib/utils"
import { Spinner } from "src/components/ui/spinner"
import { FileUpload, FileUploadDropzone } from "./file-upload"
import { useUiLabels } from "./ui-labels"

const ACCEPT_IMAGE = "image/*"
const MAX_SIZE_MB = 10
/** value 缺省时的稳定空数组引用（避免每次渲染新建，干扰依赖数组的 memo/effect） */
const EMPTY_IMAGES: string[] = []

/** 文案（可访问名/alt/失败提示）在渲染期从 UiLabels context 取当前语言那份：挂载语言进 SSR 首屏，切语言随 value 当场变 */

function fileToDataURL(file: File, readError: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.addEventListener("load", () => {
            if (typeof reader.result === "string") resolve(reader.result)
            else reject(new Error(readError))
        })
        reader.addEventListener("error", () => reject(new Error(readError)))
        reader.readAsDataURL(file)
    })
}

export interface ImageUploadProps {
    /** 当前图片的最终地址（受控）；无 = 空态上传触发区 */
    value?: string
    /** 值变化上抛：上传完成给最终地址，删除给 undefined */
    onChange?: (value: string | undefined) => void
    /** 选择文件后、上传前的本地预览；默认 FileReader 读成 dataURL（读失败那句由当前语言的通用文案给出） */
    preview?: (file: File) => Promise<string> | string
    /** 上传（持久化）函数；不传则直接用本地预览作为最终值 */
    upload?: (file: File) => Promise<string>
    /** 受控值→预览 src，默认原样返回；value 存相对 key（展示才拼域名）时须传解析器（如 imgUrl） */
    resolveSrc?: (value: string) => string
    /** 形状：tile 方形瓦片（网格图片）/ circle 圆形（头像/logo） */
    shape?: "tile" | "circle"
    size?: string
    label?: string
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

/** 已填值那一态：缩略图预览，右上角可选删除 */
function ImageThumb({
    value,
    resolveSrc,
    circular,
    size,
    className,
    label,
    removable,
    onChange,
}: {
    value: string
    resolveSrc?: (value: string) => string
    circular: boolean
    size: string
    className?: string
    label?: string
    removable: boolean
    onChange?: (value: string | undefined) => void
}) {
    const labels = useUiLabels().imageUpload
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
                alt={label ?? labels.emptyAlt}
                className="size-full object-cover"
            />
            {removable && (
                <button
                    type="button"
                    onClick={() => onChange?.(undefined)}
                    aria-label={labels.remove}
                    className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm transition-colors hover:text-destructive"
                >
                    <X className="size-3.5" />
                </button>
            )}
        </div>
    )
}

/** 瓦片正面：上传中是转圈，否则是图标（图标可被调用方整只换掉）加可选文案 */
function TileFace({
    busy,
    icon,
    showIcon,
    label,
}: {
    busy: boolean
    icon?: React.ReactNode
    showIcon: boolean
    label?: string
}) {
    if (busy) return <Spinner className="size-5" />
    return (
        <>
            {icon ?? (showIcon ? <ImagePlus className="size-5" /> : undefined)}
            {label ? <span className="text-xs">{label}</span> : undefined}
        </>
    )
}

/** 单张图片上传槽（通用原子）：纯受控，value 由外层持有；选文件/校验/拖拽复用 FileUpload，这里只做 File→URL 桥接（preview→upload→onChange） */
export function ImageUpload({
    value,
    onChange,
    preview,
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
    const labels = useUiLabels().imageUpload
    const [busy, setBusy] = React.useState(false)
    const [uploadError, setUploadError] = React.useState<string | undefined>()

    const circular = shape === "circle"

    async function handleFile(file: File | undefined) {
        if (!file || disabled) return
        setUploadError(undefined)
        try {
            setBusy(true)
            const local = await (preview ? preview(file) : fileToDataURL(file, labels.readError))
            const final = upload ? await upload(file) : local
            onChange?.(final)
        } catch (error) {
            setUploadError(
                error instanceof Error && error.message ? error.message : labels.uploadError,
            )
        } finally {
            setBusy(false)
        }
    }

    if (value) {
        return (
            <ImageThumb
                value={value}
                resolveSrc={resolveSrc}
                circular={circular}
                size={size}
                className={className}
                label={label}
                removable={removable}
                onChange={onChange}
            />
        )
    }

    // 空态复用 FileUpload 的 Dropzone（点击/拖拽/粘贴 + 校验），样式只覆盖成上传瓦片那一档
    return (
        <div className="flex flex-col items-start gap-1.5">
            <FileUpload
                accept={accept}
                maxFiles={1}
                maxSize={maxSizeMB * 1024 * 1024}
                disabled={disabled}
                onAccept={(files) => handleFile(files[0])}
                onFileReject={(_, message) => setUploadError(message)}
            >
                <FileUploadDropzone
                    className={cn(
                        "shrink-0 cursor-pointer gap-1.5 border border-input bg-muted/40 p-0 text-muted-foreground hover:border-foreground/30 hover:bg-muted data-dragging:border-primary/40 data-dragging:bg-accent/40",
                        size,
                        circular && "rounded-full",
                        className,
                    )}
                >
                    <TileFace
                        busy={busy}
                        icon={icon}
                        showIcon={showIcon}
                        label={label}
                    />
                </FileUploadDropzone>
            </FileUpload>
            {uploadError ? (
                <p className="max-w-24 text-2xs leading-tight text-destructive">{uploadError}</p>
            ) : undefined}
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
    const labels = useUiLabels().imageUpload
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
    })

    const dragStyle: CSSVars = {
        "--sortable-transform": transform ? CSS.Transform.toString(transform) : undefined,
        "--sortable-transition": transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={dragStyle}
            {...attributes}
            className={cn(
                "relative shrink-0 touch-none [transform:var(--sortable-transform)] [transition:var(--sortable-transition)]",
                isDragging && "z-10 opacity-90",
            )}
        >
            {children}
            {coverBadge ? (
                <span className="pointer-events-none absolute bottom-1 left-1 z-10 rounded-md bg-foreground px-1.5 py-0.5 text-3xs font-medium text-background">
                    {coverBadge}
                </span>
            ) : undefined}
            {/* 拖拽句柄（避免与右上角删除、点击上传冲突） */}
            <button
                type="button"
                aria-label={labels.drag}
                {...listeners}
                className="absolute -top-2 -left-2 z-10 flex size-6 cursor-grab items-center justify-center rounded-full bg-background text-muted-foreground shadow ring-1 ring-border active:cursor-grabbing"
            >
                <GripVertical className="size-3.5" />
            </button>
        </div>
    )
}

/** 可排序多图网格（商品图等）：已填图拖拽换序（第一张即封面），空位为上传瓦片；复用 ImageUpload，value 有序数组受控上抛 */
export function ImageUploadGrid({
    value = EMPTY_IMAGES,
    onChange,
    maxCount = 5,
    size = "size-24",
    label,
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
    // 空位瓦片的占位走当前语言的通用文案（调用点也可显式传 label 覆盖）
    const labels = useUiLabels().imageUpload
    const resolvedLabel = label ?? labels.gridLabel

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
                    label={resolvedLabel}
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

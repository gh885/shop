import { useEffect, useState } from "react"

import { Button, Dialog, DialogContent, DialogTitle, Input, cn, useAppForm } from "@shop/ui-web"

import { AddressInputSchema, type Address, type AddressInput } from "#/entities/address"
import RegionPicker, { type RegionNode } from "#/shared/ui/RegionPicker"

import { findPath, loadChildren } from "./load-regions"
import { useCreateAddress, useUpdateAddress } from "./use-address"

/** 内置标签选项（与后端 Address.LABEL_* 对齐） */
const LABELS = [
    { value: "HOME", label: "家" },
    { value: "WORK", label: "公司" },
    { value: "SCHOOL", label: "学校" },
    { value: "PARENTS", label: "父母家" },
    { value: "FRIEND", label: "朋友家" },
] as const

const CUSTOM_LABEL_MAX = 4

function toDefaults(a?: Address | null): AddressInput {
    return {
        receiver: a?.receiver ?? "",
        phone: a?.phone ?? "",
        regionCode: a?.regionCode ?? "",
        province: a?.province ?? "",
        city: a?.city ?? "",
        district: a?.district ?? "",
        detail: a?.detail ?? "",
        label: a?.label ?? "HOME",
        isDefault: a?.isDefault ?? false,
    }
}

/** 表单行：左侧标签（required 带红星）+ 右侧控件 */
function FormRow({
    label,
    required,
    htmlFor,
    error,
    children,
}: {
    label: string
    required?: boolean
    htmlFor?: string
    error?: string
    children: React.ReactNode
}) {
    return (
        <div className="flex items-start gap-4">
            <label
                htmlFor={htmlFor}
                className="flex w-16 shrink-0 items-start pt-2.5 text-sm"
            >
                {required && <span className="mr-0.5 text-destructive">*</span>}
                {label}
            </label>
            <div className="min-w-0 flex-1">
                {children}
                {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
            </div>
        </div>
    )
}

/** 取字段首个校验错误信息 */
function firstError(field: { state: { meta: { errors: unknown[] } } }): string | undefined {
    const e = field.state.meta.errors[0]
    if (!e) return undefined
    if (typeof e === "string") return e
    if (typeof e === "object" && "message" in e) return String(e.message)
    return undefined
}

export interface AddressFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** 传入则为编辑模式；null/未传为新增 */
    editing?: Address | null
}

/** 新增/修改收货地址表单弹窗 */
export function AddressFormDialog({ open, onOpenChange, editing }: AddressFormDialogProps) {
    const create = useCreateAddress()
    const update = useUpdateAddress()
    const isEdit = Boolean(editing)

    const [regionPath, setRegionPath] = useState<RegionNode[]>([])
    // 编辑回填需异步反查路径，路径就绪后再渲染 RegionPicker（它只在挂载时加载）
    const [regionReady, setRegionReady] = useState(!editing)
    // 「自定义」标签输入框是否展开（空串无法区分未选与自定义，需独立状态）
    const [customLabel, setCustomLabel] = useState(false)

    const form = useAppForm({
        defaultValues: toDefaults(editing),
        validators: { onSubmit: AddressInputSchema },
        onSubmit: async ({ value }) => {
            if (editing) {
                await update.mutateAsync({ id: editing.id, input: value })
            } else {
                await create.mutateAsync(value)
            }
            onOpenChange(false)
            form.reset()
        },
    })

    // 打开或切换编辑目标时重置表单 + 回填地区路径
    useEffect(() => {
        if (!open) return
        form.reset(toDefaults(editing))
        setRegionPath([])
        setRegionReady(false)
        // 编辑值是非内置标签时直接展开自定义输入框
        setCustomLabel(Boolean(editing?.label) && !LABELS.some((l) => l.value === editing?.label))
        if (editing) {
            void findPath(editing.regionCode).then((path) => {
                setRegionPath(path)
                setRegionReady(true)
            })
        } else {
            setRegionReady(true)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, editing])

    /** 地区选择变化：同步进表单字段（province/city/district/regionCode） */
    function onRegionChange(path: RegionNode[]) {
        setRegionPath(path)
        form.setFieldValue("province", path[0]?.label ?? "")
        form.setFieldValue("city", path[1]?.label ?? "")
        form.setFieldValue("district", path[2]?.label ?? "")
        form.setFieldValue("regionCode", path.at(-1)?.code ?? "")
    }

    const busy = create.isPending || update.isPending

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-xl">
                <DialogTitle>{isEdit ? "修改收货地址" : "添加收货地址"}</DialogTitle>

                <form
                    className="mt-4 flex flex-col gap-5"
                    onSubmit={(e) => {
                        e.preventDefault()
                        form.handleSubmit()
                    }}
                >
                    {/* 地区：国标行政区划级联选择（数据源懒加载，见 ./load-regions） */}
                    <form.AppField name="regionCode">
                        {(field) => (
                            <FormRow
                                label="所在地区"
                                required
                                error={firstError(field)}
                            >
                                {regionReady && (
                                    <RegionPicker
                                        value={regionPath}
                                        onChange={onRegionChange}
                                        loadChildren={loadChildren}
                                        levelLabels={["省", "市", "区"]}
                                        placeholder="请选择省/市/区"
                                    />
                                )}
                            </FormRow>
                        )}
                    </form.AppField>

                    <form.AppField name="detail">
                        {(field) => (
                            <FormRow
                                label="详细地址"
                                required
                                htmlFor={field.name}
                                error={firstError(field)}
                            >
                                <Input
                                    id={field.name}
                                    placeholder="请输入详细地址信息，如道路、小区、单元等"
                                    maxLength={120}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                />
                            </FormRow>
                        )}
                    </form.AppField>

                    <form.AppField name="receiver">
                        {(field) => (
                            <FormRow
                                label="收货人姓名"
                                required
                                htmlFor={field.name}
                                error={firstError(field)}
                            >
                                <Input
                                    id={field.name}
                                    placeholder="长度不超过 30 个字符"
                                    maxLength={30}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                />
                            </FormRow>
                        )}
                    </form.AppField>

                    <form.AppField name="phone">
                        {(field) => (
                            <FormRow
                                label="手机号码"
                                required
                                htmlFor={field.name}
                                error={firstError(field)}
                            >
                                <Input
                                    id={field.name}
                                    placeholder="请输入手机号"
                                    inputMode="tel"
                                    maxLength={20}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                />
                            </FormRow>
                        )}
                    </form.AppField>

                    <form.AppField name="isDefault">
                        {(field) => (
                            <FormRow label="默认地址">
                                <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        className="size-4 accent-accent-foreground"
                                        checked={Boolean(field.state.value)}
                                        onChange={(e) => field.handleChange(e.target.checked)}
                                    />
                                    设置为默认收货地址
                                </label>
                            </FormRow>
                        )}
                    </form.AppField>

                    <form.AppField name="label">
                        {(field) => {
                            const value = field.state.value ?? ""
                            const showCustomInput =
                                customLabel ||
                                (value !== "" && !LABELS.some((l) => l.value === value))
                            return (
                                <FormRow label="地址标签">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {LABELS.map((l) => (
                                            <button
                                                key={l.value}
                                                type="button"
                                                onClick={() => {
                                                    setCustomLabel(false)
                                                    field.handleChange(l.value)
                                                }}
                                                className={cn(
                                                    "rounded-md border px-4 py-1.5 text-sm transition-colors",
                                                    value === l.value
                                                        ? "border-foreground bg-accent text-accent-foreground"
                                                        : "border-border text-muted-foreground hover:border-foreground/40",
                                                )}
                                            >
                                                {l.label}
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCustomLabel(true)
                                                if (LABELS.some((l) => l.value === value))
                                                    field.handleChange("")
                                            }}
                                            className={cn(
                                                "rounded-md border px-4 py-1.5 text-sm transition-colors",
                                                showCustomInput
                                                    ? "border-foreground bg-accent text-accent-foreground"
                                                    : "border-border text-muted-foreground hover:border-foreground/40",
                                            )}
                                        >
                                            自定义
                                        </button>
                                    </div>
                                    {showCustomInput && (
                                        <div className="relative mt-2">
                                            <Input
                                                placeholder="请输入标签名称"
                                                maxLength={CUSTOM_LABEL_MAX}
                                                value={
                                                    LABELS.some((l) => l.value === value)
                                                        ? ""
                                                        : value
                                                }
                                                onChange={(e) => field.handleChange(e.target.value)}
                                            />
                                            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                                                {LABELS.some((l) => l.value === value)
                                                    ? 0
                                                    : value.length}
                                                /{CUSTOM_LABEL_MAX}
                                            </span>
                                        </div>
                                    )}
                                </FormRow>
                            )
                        }}
                    </form.AppField>

                    <div className="mt-2 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            className="bg-primary text-primary-foreground hover:bg-primary-hover"
                            disabled={busy}
                        >
                            {busy ? "保存中…" : "确定"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

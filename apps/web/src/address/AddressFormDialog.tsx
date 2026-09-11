import { useEffect, useState } from "react"
import { z } from "zod"

import { notify } from "@shop/app-kit"
import { findPath, loadChildren } from "@shop/common"
import {
    Button,
    cn,
    Dialog,
    DialogContent,
    DialogTitle,
    Field,
    firstFieldError,
    Input,
    InputGroup,
    InputGroupAddon,
    InputGroupTextarea,
    RegionPicker,
    type RegionNode,
    Spinner,
    useAppForm,
} from "@shop/ui-web"

import { ADDRESS_LABELS, type Address, type AddressInput } from "./address"
import { parseAddressText, useCreateAddress, useUpdateAddress } from "./queries"

/** 表单入参校验（form validators 用；表单局部 zchema，非领域契约） */
const AddressInputSchema = z.object({
    receiver: z.string().trim().min(1, "请输入收货人").max(30, "收货人最长 30 字"),
    phone: z.string().regex(/^[0-9+-]{5,20}$/, "手机号格式不正确"),
    regionCode: z.string().trim().min(1, "请选择所在地区").max(12),
    province: z.string().trim().min(1, "请选择所在地区").max(30),
    city: z.string().trim().min(1, "请选择所在地区").max(30),
    district: z.string().trim().min(1, "请选择所在地区").max(30),
    detail: z.string().trim().min(1, "请输入详细地址").max(120, "详细地址最长 120 字"),
    label: z.string().max(20).optional(),
    isDefault: z.boolean().optional(),
})

/** 内置标签选项（code/展示名单一来源在 ./address 的 ADDRESS_LABELS） */
const LABELS = Object.entries(ADDRESS_LABELS).map(([value, label]) => ({ value, label }))

const CUSTOM_LABEL_MAX = 4

function toDefaults(a?: Address): AddressInput {
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

export interface AddressFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** 传入则为编辑模式；undefined/未传为新增 */
    editing?: Address
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
    // 智能粘贴：待解析文本 + 解析中
    const [smartText, setSmartText] = useState("")
    const [parsing, setParsing] = useState(false)

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

    // 打开/切换编辑目标时重置本地状态：渲染期状态调整模式（对 React Compiler 友好，
    // 避免 effect 内同步 setState 触发级联渲染）。key 取 open + 编辑目标 id。
    const editKey = open ? (editing?.id ?? "new") : "closed"
    const [prevEditKey, setPrevEditKey] = useState(editKey)
    if (prevEditKey !== editKey) {
        setPrevEditKey(editKey)
        if (open) {
            setRegionPath([])
            setRegionReady(editing ? false : true)
            // 编辑值是非内置标签时直接展开自定义输入框
            setCustomLabel(
                Boolean(editing?.label) && !LABELS.some((l) => l.value === editing?.label),
            )
        }
    }

    // form.reset 同步外部表单 store + 编辑回填异步反查地区路径
    useEffect(() => {
        if (!open) return
        form.reset(toDefaults(editing))
        if (editing) {
            // oxlint-disable-next-line promise/always-return -- 终态副作用,链尾无下一环,无需返回值
            void findPath(editing.regionCode).then((path) => {
                setRegionPath(path)
                setRegionReady(true)
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, editing])

    /** 地区路径 → 表单四字段同步（province/city/district/regionCode）。手动选择与智能粘贴共用，保证两条入口行为一致 */
    function applyRegion(path: RegionNode[]) {
        setRegionPath(path)
        form.setFieldValue("province", path[0]?.label ?? "")
        form.setFieldValue("city", path[1]?.label ?? "")
        form.setFieldValue("district", path[2]?.label ?? "")
        form.setFieldValue("regionCode", path.at(-1)?.code ?? "")
    }

    /** 智能粘贴：解析文本 → 预填表单（收件人/手机号/区划/详细地址）。
     *  不用 try/finally（React Compiler 暂不支持 finally 块）：成功/失败路径各自复位 parsing。 */
    async function handleSmartParse() {
        if (!smartText.trim()) return
        setParsing(true)
        try {
            const parsed = await parseAddressText(smartText.trim())
            form.setFieldValue("receiver", parsed.receiver ?? "")
            form.setFieldValue("phone", parsed.phone ?? "")
            form.setFieldValue("detail", parsed.detail ?? "")
            if (parsed.regionCode) {
                // 用权威区划数据反查路径，regionCode/省市区 以路径为准（避免库与本地命名差异）
                applyRegion(await findPath(parsed.regionCode))
            } else {
                notify.warning("未能识别所在地区，请手动选择")
            }
            setSmartText("")
            setParsing(false)
        } catch (error) {
            notify.fromError(error, "识别失败，请检查输入")
            setParsing(false)
        }
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
                        void form.handleSubmit()
                    }}
                >
                    {/* 智能粘贴：左标签 + 右侧圆角大框（灰色占位 + 右下橙色按钮），对齐淘宝样式 */}
                    <div className="flex items-start gap-4">
                        <label
                            htmlFor="smart-paste"
                            className="w-16 shrink-0 pt-2.5 text-sm"
                        >
                            智能粘贴
                        </label>
                        <div className="min-w-0 flex-1">
                            <InputGroup>
                                <InputGroupTextarea
                                    id="smart-paste"
                                    className="h-24 resize-none p-3"
                                    placeholder="粘贴文本到此处，将自动识别收货信息,例：淘宝，139********，浙江省杭州市西湖区某小区"
                                    maxLength={500}
                                    value={smartText}
                                    onChange={(e) => setSmartText(e.target.value)}
                                />
                                <InputGroupAddon
                                    align="block-end"
                                    className="justify-end"
                                >
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="px-6"
                                        disabled={parsing || !smartText.trim()}
                                        onClick={() => void handleSmartParse()}
                                    >
                                        {parsing && <Spinner />}粘贴并识别
                                    </Button>
                                </InputGroupAddon>
                            </InputGroup>
                        </div>
                    </div>

                    {/* 地区：国标行政区划级联选择（数据源懒加载，见 ./regions） */}
                    <form.AppField name="regionCode">
                        {(field) => (
                            <Field
                                label="所在地区"
                                required
                                layout="horizontal"
                                error={firstFieldError(field)}
                            >
                                {regionReady && (
                                    <RegionPicker
                                        value={regionPath}
                                        onChange={applyRegion}
                                        loadChildren={loadChildren}
                                        levelLabels={["省", "市", "区"]}
                                        placeholder="请选择省/市/区"
                                    />
                                )}
                            </Field>
                        )}
                    </form.AppField>

                    <form.AppField name="detail">
                        {(field) => (
                            <field.TextField
                                label="详细地址"
                                required
                                layout="horizontal"
                                placeholder="请输入详细地址信息，如道路、小区、单元等"
                                maxLength={120}
                            />
                        )}
                    </form.AppField>

                    <form.AppField name="receiver">
                        {(field) => (
                            <field.TextField
                                label="收货人姓名"
                                required
                                layout="horizontal"
                                placeholder="长度不超过 30 个字符"
                                maxLength={30}
                            />
                        )}
                    </form.AppField>

                    <form.AppField name="phone">
                        {(field) => (
                            <field.TextField
                                label="手机号码"
                                required
                                layout="horizontal"
                                placeholder="请输入手机号"
                                inputMode="tel"
                                maxLength={20}
                            />
                        )}
                    </form.AppField>

                    <form.AppField name="isDefault">
                        {(field) => <field.CheckboxField label="设置为默认收货地址" />}
                    </form.AppField>

                    <form.AppField name="label">
                        {(field) => {
                            const value = field.state.value ?? ""
                            const showCustomInput =
                                customLabel ||
                                (value !== "" && !LABELS.some((l) => l.value === value))
                            return (
                                <Field
                                    label="地址标签"
                                    layout="horizontal"
                                >
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
                                                aria-label="自定义标签名称"
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
                                </Field>
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
                            disabled={busy}
                        >
                            {busy && <Spinner />}确定
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

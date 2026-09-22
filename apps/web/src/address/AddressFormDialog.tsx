import { notify, RegionField } from "@shop/app-kit"
import { findPath } from "@shop/common"
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogTitle,
    Field,
    FieldLabel,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    InputGroupTextarea,
    type RegionNode,
    Spinner,
    ToggleGroup,
    ToggleGroupItem,
    useAppForm,
} from "@shop/ui-web"
import { useState } from "react"

import type { Address } from "./address"
import {
    AddressInputSchema,
    CUSTOM_LABEL_MAX,
    isBuiltinLabel,
    isCustomLabel,
    LABEL_OPTIONS,
    toDefaults,
} from "./address-form"
import { parseAddressText, useCreateAddress, useUpdateAddress } from "./queries"

export interface AddressFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** 传入则为编辑模式；undefined/未传为新增 */
    editing?: Address
}

/** 新增/修改收货地址表单弹窗。表单体挂在 DialogContent 里：BaseUI 关闭即卸载，
    每次打开重挂载让默认值从当前 editing 重算，无需 effect 手动重置。 */
export function AddressFormDialog({ open, onOpenChange, editing }: AddressFormDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-xl">
                <AddressForm
                    editing={editing}
                    onOpenChange={onOpenChange}
                />
            </DialogContent>
        </Dialog>
    )
}

function AddressForm({
    editing,
    onOpenChange,
}: {
    editing?: Address
    onOpenChange: (open: boolean) => void
}) {
    const create = useCreateAddress()
    const update = useUpdateAddress()

    // 「自定义」标签输入框是否展开（空串无法区分未选与自定义，需独立状态）
    const [customLabel, setCustomLabel] = useState(() => isCustomLabel(editing?.label))
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
        },
    })

    /** 地区路径 → 表单四字段同步（province/city/district/regionCode）。手动选择与智能粘贴共用，保证两条入口行为一致 */
    function applyRegion(path: RegionNode[]) {
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
        <>
            <DialogTitle>{editing ? "修改收货地址" : "添加收货地址"}</DialogTitle>

            <form
                className="mt-4 flex flex-col gap-5"
                onSubmit={(e) => {
                    e.preventDefault()
                    void form.handleSubmit()
                }}
            >
                {/* 智能粘贴：圆角大框（灰色占位 + 右下橙色按钮），对齐淘宝样式 */}
                <Field>
                    <FieldLabel htmlFor="smart-paste">智能粘贴</FieldLabel>
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
                                disabled={parsing || !smartText.trim()}
                                onClick={() => void handleSmartParse()}
                            >
                                {parsing && <Spinner />}粘贴并识别
                            </Button>
                        </InputGroupAddon>
                    </InputGroup>
                </Field>

                {/* 地区：国标行政区划级联选择（数据源懒加载） */}
                <form.AppField name="regionCode">
                    {(field) => (
                        <RegionField
                            code={field.state.value}
                            onChange={applyRegion}
                            errors={field.state.meta.errors}
                            required
                        />
                    )}
                </form.AppField>

                <form.AppField name="detail">
                    {(field) => (
                        <field.TextField
                            label="详细地址"
                            required
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
                        const showCustomInput = customLabel || isCustomLabel(value)
                        return (
                            <Field>
                                <FieldLabel>地址标签</FieldLabel>
                                <ToggleGroup
                                    value={showCustomInput ? ["custom"] : value ? [value] : []}
                                    onValueChange={(v) => {
                                        const next = v[0]
                                        if (next === "custom") {
                                            setCustomLabel(true)
                                            if (isBuiltinLabel(value)) field.handleChange("")
                                        } else if (next !== undefined) {
                                            setCustomLabel(false)
                                            field.handleChange(next)
                                        }
                                    }}
                                    variant="outline"
                                    className="flex-wrap"
                                >
                                    {LABEL_OPTIONS.map((l) => (
                                        <ToggleGroupItem
                                            key={l.value}
                                            value={l.value}
                                        >
                                            {l.label}
                                        </ToggleGroupItem>
                                    ))}
                                    <ToggleGroupItem value="custom">自定义</ToggleGroupItem>
                                </ToggleGroup>
                                {showCustomInput && (
                                    <InputGroup>
                                        <InputGroupInput
                                            aria-label="自定义标签名称"
                                            placeholder="请输入标签名称"
                                            maxLength={CUSTOM_LABEL_MAX}
                                            value={isBuiltinLabel(value) ? "" : value}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                        />
                                        <InputGroupAddon
                                            align="inline-end"
                                            variant="counter"
                                            className="tabular-nums"
                                        >
                                            {isBuiltinLabel(value) ? 0 : value.length}/
                                            {CUSTOM_LABEL_MAX}
                                        </InputGroupAddon>
                                    </InputGroup>
                                )}
                            </Field>
                        )
                    }}
                </form.AppField>

                <DialogFooter>
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
                        {busy && <Spinner />}保存
                    </Button>
                </DialogFooter>
            </form>
        </>
    )
}

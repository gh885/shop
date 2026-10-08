import { message } from "#/locales/message"
import { useT } from "#/locales/use-t"
import { FormActions, RegionField, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { notify } from "@shop/app-kit/data"
import {
    ADDRESS_DETAIL_MAX,
    ADDRESS_NAME_MAX,
    ADDRESS_PARSE_TEXT_MAX,
    CONTACT_PHONE_MAX,
    regionNamesByCode,
} from "@shop/common/domain"
import {
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    Field,
    FieldLabel,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    InputGroupTextarea,
    applyServerFieldErrors,
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
    const t = useT("address")

    // 「自定义」标签输入框是否展开（空串无法区分未选与自定义，需独立状态）
    const [customLabel, setCustomLabel] = useState(() => isCustomLabel(editing?.label))
    // 智能粘贴：待解析文本 + 解析中
    const [smartText, setSmartText] = useState("")
    const [parsing, setParsing] = useState(false)

    const form = useAppForm({
        defaultValues: toDefaults(editing),
        validators: { onSubmit: AddressInputSchema },
        onSubmit: async ({ value }) => {
            try {
                if (editing) {
                    await update.mutateAsync({ id: editing.id, input: value })
                } else {
                    await create.mutateAsync(value)
                }
            } catch (error) {
                // 后端 422 的字段级明细落到对应输入框上（此前只有一句全局 toast）。
                // 映射逐字段列出，不靠「没列就是同名」：receiverName ↔ receiver 是这个表单自己的改名，
                // 同名的三个也列出来——列出来等于「我确认过它同名」，漏列的那个错误就永远落不了地
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        receiverName: "receiver",
                        phone: "phone",
                        regionCode: "regionCode",
                        detail: "detail",
                    }),
                )
                // 这里只负责「把字段级错误写到对应框上」，然后原样抛出去：抛出去 form-core 才会把
                // isSubmitSuccessful 置回 false（框架状态诚实），而接住 rejection 是事件入口
                // submitForm 的事——在 onSubmit 里 catch {} 会把「代码坏了」那一类也静默吞掉
                throw error
            }
            onOpenChange(false)
        },
    })

    /** 智能粘贴：解析文本 → 预填表单（收件人/手机号/区划/详细地址）。
     *  地区只填 regionCode，且先确认区划库认得它：认不出三级就把地区留着让用户手选，
     *  而不是把服务端的写法抄进表单——名字最终按码反查落库，两套写法迟早对不上。
     *  不用 try/finally（React Compiler 暂不支持 finally 块）：成功/失败路径各自复位 parsing。 */
    async function handleSmartParse() {
        if (!smartText.trim()) return
        setParsing(true)
        try {
            const parsed = await parseAddressText(smartText.trim())
            form.setFieldValue("receiver", parsed.receiver ?? "")
            form.setFieldValue("phone", parsed.phone ?? "")
            form.setFieldValue("detail", parsed.detail ?? "")
            const code = parsed.regionCode ?? ""
            const names = await regionNamesByCode(code)
            if (names.district) {
                form.setFieldValue("regionCode", code)
            } else {
                notify.warning(message("address.recognize.regionMissing"))
            }
            setSmartText("")
            setParsing(false)
        } catch (error) {
            notify.fromError(error, undefined, message("address.recognize.failed"))
            setParsing(false)
        }
    }

    const busy = create.isPending || update.isPending

    return (
        <>
            <DialogTitle>
                {editing ? t("address.form.editTitle") : t("address.form.addTitle")}
            </DialogTitle>

            <form
                className="mt-4 flex flex-col gap-5"
                onSubmit={(e) => {
                    e.preventDefault()
                    // 不写 void form.handleSubmit()：void 不接 rejection，onSubmit 抛出的错误会变成
                    // 未处理的异步异常。submitForm 接住它，并把「非接口错误」上报监控（见它的注释）
                    void submitForm(form)
                }}
            >
                {/* 智能粘贴：圆角大框（灰色占位 + 右下橙色按钮），对齐淘宝样式 */}
                <Field>
                    <FieldLabel htmlFor="smart-paste">{t("address.form.smartPaste")}</FieldLabel>
                    <InputGroup>
                        <InputGroupTextarea
                            id="smart-paste"
                            className="h-24 resize-none p-3"
                            placeholder={t("address.form.smartPastePlaceholder")}
                            maxLength={ADDRESS_PARSE_TEXT_MAX}
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
                                {parsing && <Spinner />}
                                {t("address.form.parseAndFill")}
                            </Button>
                        </InputGroupAddon>
                    </InputGroup>
                </Field>

                {/* 地区：国标行政区划级联选择（数据源懒加载）。表单里只有那个 6 位码，省市区名提交时按码反查 */}
                <form.AppField name="regionCode">
                    {(field) => (
                        <RegionField
                            code={field.state.value}
                            onChange={field.handleChange}
                            errors={field.state.meta.errors}
                            required
                        />
                    )}
                </form.AppField>

                <form.AppField name="detail">
                    {(field) => (
                        <field.TextField
                            label={t("address.field.detail")}
                            required
                            placeholder={t("address.form.detailPlaceholder")}
                            maxLength={ADDRESS_DETAIL_MAX}
                        />
                    )}
                </form.AppField>

                <form.AppField name="receiver">
                    {(field) => (
                        <field.TextField
                            label={t("address.form.receiverLabel")}
                            required
                            placeholder={t("address.form.receiverPlaceholder")}
                            maxLength={ADDRESS_NAME_MAX}
                        />
                    )}
                </form.AppField>

                <form.AppField name="phone">
                    {(field) => (
                        <field.TextField
                            label={t("address.form.phoneLabel")}
                            required
                            placeholder={t("address.form.phonePlaceholder")}
                            inputMode="tel"
                            maxLength={CONTACT_PHONE_MAX}
                        />
                    )}
                </form.AppField>

                <form.AppField name="isDefault">
                    {(field) => <field.CheckboxField label={t("address.form.setDefaultLabel")} />}
                </form.AppField>

                <form.AppField name="label">
                    {(field) => {
                        const value = field.state.value ?? ""
                        const showCustomInput = customLabel || isCustomLabel(value)
                        return (
                            <Field>
                                <FieldLabel>{t("address.form.labelTitle")}</FieldLabel>
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
                                            {t(l.label)}
                                        </ToggleGroupItem>
                                    ))}
                                    <ToggleGroupItem value="custom">
                                        {t("address.form.customToggle")}
                                    </ToggleGroupItem>
                                </ToggleGroup>
                                {showCustomInput && (
                                    <InputGroup>
                                        <InputGroupInput
                                            aria-label={t("address.form.customLabelAria")}
                                            placeholder={t("address.form.customLabelPlaceholder")}
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

                <FormActions
                    pending={busy}
                    submitLabel={t("address.form.save")}
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}

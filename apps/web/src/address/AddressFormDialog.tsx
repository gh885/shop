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

    const [customLabel, setCustomLabel] = useState(() => isCustomLabel(editing?.label))
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
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        receiverName: "receiver",
                        phone: "phone",
                        regionCode: "regionCode",
                        detail: "detail",
                    }),
                )
                throw error
            }
            onOpenChange(false)
        },
    })

    /** 不用 try/finally（React Compiler 暂不支持 finally 块）：成功/失败路径各自复位 parsing。 */
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
                    void submitForm(form)
                }}
            >
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

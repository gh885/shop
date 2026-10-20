import { FormActions, RegionField, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import {
    applyServerFieldErrors,
    Dialog,
    DialogContent,
    DialogTitle,
    useAppForm,
} from "@shop/ui-web"
import type { MerchantAddressResponse } from "@shop/api/sdk"

import { useT } from "#/locales/use-t"
import { ADDRESS_FIELDS, AddressFormSchema, CONTACT_FIELDS, toDefaults } from "./address-form"
import { useCreateAddress, useUpdateAddress } from "./queries"

export interface AddressFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    shopId: string
    editing?: MerchantAddressResponse
}

// BaseUI 关闭即卸载，每次打开重挂载让初值从当前 editing 重算——不要改成用 effect 手动重置
export function AddressFormDialog({ open, onOpenChange, shopId, editing }: AddressFormDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-xl">
                <AddressForm
                    shopId={shopId}
                    editing={editing}
                    onOpenChange={onOpenChange}
                />
            </DialogContent>
        </Dialog>
    )
}

function AddressForm({ shopId, editing, onOpenChange }: Omit<AddressFormDialogProps, "open">) {
    const create = useCreateAddress(shopId)
    const update = useUpdateAddress(shopId)
    // 用整份 useT()（不是 useT("shop")）：本弹窗跨 shop.* 与 common.* 两个 namespace
    const t = useT()

    const form = useAppForm({
        defaultValues: toDefaults(editing),
        validators: { onSubmit: AddressFormSchema },
        onSubmit: async ({ value }) => {
            try {
                if (editing) {
                    await update.mutateAsync({ id: editing.id, input: value })
                } else {
                    await create.mutateAsync(value)
                }
            } catch (error) {
                // 只列表单真有输入框的字段：province/city/district 由 regionCode 派生、defaultShip/Return 是复选框，都不进这映射
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        contactName: "contactName",
                        phone: "phone",
                        regionCode: "regionCode",
                        detail: "detail",
                        postalCode: "postalCode",
                        companyName: "companyName",
                        note: "note",
                    }),
                )
                throw error
            }
            onOpenChange(false)
        },
    })

    const busy = create.isPending || update.isPending

    return (
        <>
            <DialogTitle>
                {editing ? t("shop.address.form.title.edit") : t("shop.address.form.title.create")}
            </DialogTitle>

            <form
                className="mt-4 flex flex-col gap-5"
                onSubmit={(e) => {
                    e.preventDefault()
                    void submitForm(form)
                }}
            >
                {CONTACT_FIELDS.map(({ name, labelKey, placeholderKey, ...props }) => (
                    <form.AppField
                        key={name}
                        name={name}
                    >
                        {(field) => (
                            <field.TextField
                                label={t(labelKey)}
                                placeholder={t(placeholderKey)}
                                {...props}
                                required
                            />
                        )}
                    </form.AppField>
                ))}

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

                {ADDRESS_FIELDS.map(({ name, labelKey, placeholderKey, ...props }) => (
                    <form.AppField
                        key={name}
                        name={name}
                    >
                        {(field) => (
                            <field.TextField
                                label={t(labelKey)}
                                placeholder={t(placeholderKey)}
                                {...props}
                            />
                        )}
                    </form.AppField>
                ))}

                <div className="flex items-center gap-6">
                    <form.AppField name="defaultShip">
                        {(field) => (
                            <field.CheckboxField label={t("shop.address.form.defaultShip")} />
                        )}
                    </form.AppField>
                    <form.AppField name="defaultReturn">
                        {(field) => (
                            <field.CheckboxField label={t("shop.address.form.defaultReturn")} />
                        )}
                    </form.AppField>
                </div>

                <FormActions
                    pending={busy}
                    submitLabel={t("common.action.save")}
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}

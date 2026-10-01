import { FormActions, RegionField, serverFieldErrorTexts, submitForm } from "@shop/app-kit/forms"
import { useI18n } from "@shop/app-kit/i18n"
import {
    applyServerFieldErrors,
    Dialog,
    DialogContent,
    DialogTitle,
    useAppForm,
} from "@shop/ui-web"
import type { MerchantAddressResponse } from "@shop/api/sdk"

import { ADDRESS_FIELDS, AddressFormSchema, CONTACT_FIELDS, toDefaults } from "./address-form"
import { useCreateAddress, useUpdateAddress } from "./queries"

export interface AddressFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** 当前经营店铺 id：新增/编辑的失效 key 挂在它下面（页面经 useShop() 传入） */
    shopId: string
    /** 传入则为编辑模式；undefined/未传为新增 */
    editing?: MerchantAddressResponse
}

/** 新增/编辑商家地址表单弹窗（对齐淘宝地址库表单）。表单体挂在 DialogContent 里：
    BaseUI 关闭即卸载，每次打开重挂载让默认值从当前 editing 重算，无需 effect 手动重置。 */
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
    const { locale } = useI18n()

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
                // 后端 422 的字段级明细落到对应输入框上（此前只有一句全局 toast）。
                // 逐字段列出，同名字段也列（列出=确认过同名）。DTO 里的 province/city/district 不列：
                // 表单没有那三个框，它们由 regionCode 反查派生；defaultShip/defaultReturn 是复选框、
                // 无值级注解，落不了红。
                applyServerFieldErrors(
                    form,
                    serverFieldErrorTexts(error, locale, {
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
            <DialogTitle>{editing ? "编辑地址" : "新增地址"}</DialogTitle>

            <form
                className="mt-4 flex flex-col gap-5"
                onSubmit={(e) => {
                    e.preventDefault()
                    void submitForm(form)
                }}
            >
                {CONTACT_FIELDS.map(({ name, ...props }) => (
                    <form.AppField
                        key={name}
                        name={name}
                    >
                        {(field) => (
                            <field.TextField
                                {...props}
                                required
                            />
                        )}
                    </form.AppField>
                ))}

                {/* 地区：国标行政区划级联选择。表单里只有那个 6 位码，省市区名提交时按码反查 */}
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

                {ADDRESS_FIELDS.map(({ name, ...props }) => (
                    <form.AppField
                        key={name}
                        name={name}
                    >
                        {(field) => <field.TextField {...props} />}
                    </form.AppField>
                ))}

                <div className="flex items-center gap-6">
                    <form.AppField name="defaultShip">
                        {(field) => <field.CheckboxField label="默认发货地址" />}
                    </form.AppField>
                    <form.AppField name="defaultReturn">
                        {(field) => <field.CheckboxField label="默认退货地址" />}
                    </form.AppField>
                </div>

                <FormActions
                    pending={busy}
                    submitLabel="保存"
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}

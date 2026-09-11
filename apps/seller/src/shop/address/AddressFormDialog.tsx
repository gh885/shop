import { useEffect, useState } from "react"
import { z } from "zod"

import {
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    Field,
    firstFieldError,
    RegionPicker,
    type RegionNode,
    Spinner,
    useAppForm,
} from "@shop/ui-web"
import type { MerchantAddressResponse } from "@shop/api/sdk"
import { findPath, loadChildren } from "@shop/common"

import { useCreateAddress, useUpdateAddress } from "./queries"

/** 表单入参校验（form validators 用；表单局部 schema，非领域契约） */
const FormSchema = z.object({
    contactName: z.string().trim().min(1, "请输入联系人").max(30, "联系人最长 30 字"),
    phone: z.string().regex(/^[0-9+-]{5,20}$/, "手机号格式不正确"),
    regionCode: z.string().trim().min(1, "请选择所在地区").max(12),
    province: z.string().trim().min(1, "请选择所在地区").max(30),
    city: z.string().trim().min(1, "请选择所在地区").max(30),
    district: z.string().trim().max(30).optional(),
    detail: z.string().trim().min(1, "请输入详细地址").max(120, "详细地址最长 120 字"),
    postalCode: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "邮编格式不正确")
        .optional()
        .or(z.literal("")),
    companyName: z.string().trim().max(60, "公司名称最长 60 字").optional(),
    note: z.string().trim().max(200, "备注最长 200 字").optional(),
    defaultShip: z.boolean(),
    defaultReturn: z.boolean(),
})

type FormValues = z.infer<typeof FormSchema>

function toDefaults(a?: MerchantAddressResponse): FormValues {
    return {
        contactName: a?.contactName ?? "",
        phone: a?.phone ?? "",
        regionCode: a?.regionCode ?? "",
        province: a?.province ?? "",
        city: a?.city ?? "",
        district: a?.district ?? "",
        detail: a?.detail ?? "",
        postalCode: a?.postalCode ?? "",
        companyName: a?.companyName ?? "",
        note: a?.note ?? "",
        defaultShip: a?.defaultShip ?? false,
        defaultReturn: a?.defaultReturn ?? false,
    }
}

export interface AddressFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** 传入则为编辑模式；undefined/未传为新增 */
    editing?: MerchantAddressResponse
}

/** 新增/编辑商家地址表单弹窗（对齐淘宝地址库表单；地区用 web 端同款级联组件） */
export function AddressFormDialog({ open, onOpenChange, editing }: AddressFormDialogProps) {
    const create = useCreateAddress()
    const update = useUpdateAddress()
    const isEdit = Boolean(editing)

    const [regionPath, setRegionPath] = useState<RegionNode[]>([])
    // 编辑回填需异步反查路径，路径就绪后再渲染 RegionPicker（它只在挂载时加载）
    const [regionReady, setRegionReady] = useState(!editing)

    const form = useAppForm({
        defaultValues: toDefaults(editing),
        validators: { onSubmit: FormSchema },
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

    // 打开/切换编辑目标时重置本地状态：渲染期状态调整模式（对 React Compiler 友好）
    const editKey = open ? (editing?.id ?? "new") : "closed"
    const [prevEditKey, setPrevEditKey] = useState(editKey)
    if (prevEditKey !== editKey) {
        setPrevEditKey(editKey)
        if (open) {
            setRegionPath([])
            setRegionReady(editing ? false : true)
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

    /** 地区路径 → 表单四字段同步（province/city/district/regionCode） */
    function applyRegion(path: RegionNode[]) {
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
                <DialogTitle>{isEdit ? "编辑地址" : "新增地址"}</DialogTitle>

                <form
                    className="mt-4 flex flex-col gap-5"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void form.handleSubmit()
                    }}
                >
                    <form.AppField name="contactName">
                        {(field) => (
                            <field.TextField
                                label="联系人姓名"
                                required
                                layout="horizontal"
                                placeholder="请输入联系人"
                                maxLength={30}
                            />
                        )}
                    </form.AppField>

                    <form.AppField name="phone">
                        {(field) => (
                            <field.TextField
                                label="联系电话"
                                required
                                layout="horizontal"
                                placeholder="请输入手机号"
                                inputMode="tel"
                                maxLength={20}
                            />
                        )}
                    </form.AppField>

                    {/* 地区：国标行政区划级联选择（web 端同款组件） */}
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
                                placeholder="不需要重复输入省/市/区"
                                maxLength={120}
                            />
                        )}
                    </form.AppField>

                    <form.AppField name="postalCode">
                        {(field) => (
                            <field.TextField
                                label="邮政编码"
                                layout="horizontal"
                                placeholder="填写邮政编码（可选）"
                                maxLength={6}
                            />
                        )}
                    </form.AppField>

                    <form.AppField name="companyName">
                        {(field) => (
                            <field.TextField
                                label="公司名称"
                                layout="horizontal"
                                placeholder="填写地址所属的公司名称（面单寄件人）"
                                maxLength={60}
                            />
                        )}
                    </form.AppField>

                    <form.AppField name="note">
                        {(field) => (
                            <field.TextField
                                label="备注"
                                layout="horizontal"
                                placeholder="填写备注（可选）"
                                maxLength={200}
                            />
                        )}
                    </form.AppField>

                    <div className="flex items-center gap-6 pl-16">
                        <form.AppField name="defaultShip">
                            {(field) => <field.CheckboxField label="默认发货地址" />}
                        </form.AppField>
                        <form.AppField name="defaultReturn">
                            {(field) => <field.CheckboxField label="默认退货地址" />}
                        </form.AppField>
                    </div>

                    <div className="mt-2 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            放弃
                        </Button>
                        <Button
                            type="submit"
                            disabled={busy}
                        >
                            {busy && <Spinner />}保存
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

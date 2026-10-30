import { useEffect, useMemo } from "react"
import { useT } from "#/locales/use-t"
import { CircleAlert, Plus, Trash2 } from "lucide-react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { serverFieldErrors, submitForm, useUnsavedLeaveGuard } from "@shop/app-kit/forms"
import {
    Badge,
    Button,
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Field,
    FieldError,
    FieldLabel,
    Spinner,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"

import { useShop } from "#/domains/shop"
import { FEE_TIER_FIELDS } from "./constants"
import { FeeTierFields } from "./template/FeeTierFields"
import { RegionMultiPicker } from "./template/RegionMultiPicker"
import type { ShippingForm } from "./form-instance"
import {
    EMPTY_REGION_RULE,
    ShippingTemplateFormSchema,
    type ShippingTemplateFormValues,
} from "./form"
import {
    shippingStatusOf,
    shippingTemplateFormFromResponse,
    shippingTemplateRequestFromForm,
} from "./rules"
import {
    shippingTemplateOptions,
    useActivateShippingTemplate,
    useSaveShippingTemplate,
} from "./queries"

const FEE_TIER_KEYS = FEE_TIER_FIELDS.map((tier) => tier.key)

// 后端 422 的字段路径 → 表单路径。Money 两格连 .amount 一起登记，少一种那条 422 永远落不了地
function addCellPaths(
    map: Record<string, string>,
    prefix: string,
    key: (typeof FEE_TIER_KEYS)[number],
): void {
    const path = `${prefix}.${key}`
    map[path] = path
    if (key === "firstFee" || key === "addFee") map[`${path}.amount`] = path
}

/** 后端 regions[i] 的字段名（first/firstFee/additional/additionalFee）映射回表单的格子名 */
const WIRE_TO_FORM_KEY: Record<string, (typeof FEE_TIER_KEYS)[number]> = {
    first: "firstQuantity",
    firstFee: "firstFee",
    additional: "addQuantity",
    additionalFee: "addFee",
}

export function shippingServerFieldMap(values: ShippingTemplateFormValues): Record<string, string> {
    const map: Record<string, string> = {
        name: "name",
        chargeBy: "chargeBy",
        freeOver: "freeOver",
    }
    for (const [index] of values.regionRules.entries()) {
        for (const [wire, formKey] of Object.entries(WIRE_TO_FORM_KEY)) {
            addCellPaths(map, `regions[${index}].${wire}`, formKey)
        }
        // 数组元素级的报错（这条没选地区）落在该条的选择器上
        map[`regions[${index}].areaCodes`] = `regionRules[${index}].areaCodes`
    }
    return map
}

function RegionRulesEditor({ form }: { form: ShippingForm }) {
    const t = useT()

    function addRule() {
        if (form.state.values.regionRules.length >= 50) return
        form.pushFieldValue("regionRules", {
            id: crypto.randomUUID(),
            areaCodes: [],
            ...EMPTY_REGION_RULE,
        })
    }

    // 不加这层订阅，push/删除改了数组值也不会重渲染（直接读 form.state.values 没有订阅）
    return (
        <form.Subscribe selector={(state) => state.values.regionRules}>
            {(rules) => (
                <Card>
                    <CardHeader>
                        <CardTitle>{t("shipping.region.title")}</CardTitle>
                        <CardDescription>{t("shipping.region.hint")}</CardDescription>
                        <CardAction>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={rules.length >= 50}
                                onClick={addRule}
                            >
                                <Plus />
                                {t("shipping.region.add")}
                            </Button>
                        </CardAction>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {rules.map((rule, index) => {
                            // 第一条恒为默认规则（空 areaCodes）：后端库约束要求必须有一条兜底
                            const isDefault = index === 0
                            return (
                                <div
                                    key={rule.id}
                                    className="rounded-lg border p-4"
                                >
                                    <div className="mb-4 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium">
                                                {isDefault
                                                    ? t("shipping.region.defaultTitle")
                                                    : t("shipping.region.itemTitle", { index })}
                                            </p>
                                            {isDefault && (
                                                <Badge variant="secondary">
                                                    {t("shipping.region.defaultBadge")}
                                                </Badge>
                                            )}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={t("shipping.region.removeAria")}
                                            // 默认规则删不得：删了表单就存不下（后端要求至少一条兜底）
                                            disabled={isDefault}
                                            onClick={() =>
                                                form.removeFieldValue("regionRules", index)
                                            }
                                        >
                                            <Trash2 />
                                        </Button>
                                    </div>
                                    <div className="space-y-4">
                                        {!isDefault && (
                                            <form.AppField name={`regionRules[${index}].areaCodes`}>
                                                {(field) => (
                                                    <Field>
                                                        <FieldLabel required>
                                                            {t("shipping.region.coverage")}
                                                        </FieldLabel>
                                                        <RegionMultiPicker
                                                            value={field.state.value}
                                                            onChange={field.handleChange}
                                                            ariaLabel={t(
                                                                "shipping.region.coverage",
                                                            )}
                                                        />
                                                        <FieldError
                                                            errors={field.state.meta.errors}
                                                        />
                                                    </Field>
                                                )}
                                            </form.AppField>
                                        )}
                                        <FeeTierFields
                                            form={form}
                                            prefix={`regionRules[${index}]`}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </CardContent>
                </Card>
            )}
        </form.Subscribe>
    )
}

export function ShippingTemplatePage() {
    const t = useT()
    const shop = useShop()
    const shopId = shop.id
    const templates = useSuspenseQuery(shippingTemplateOptions(shopId))
    const save = useSaveShippingTemplate(shopId)
    const activate = useActivateShippingTemplate(shopId)

    // 优先编辑启用中的模板；没有启用的就编辑最近一条；一条都没有是新建态
    const editing = useMemo(() => {
        const list = templates.data
        return list.find((item) => shippingStatusOf(item) === "active") ?? list[0]
    }, [templates.data])

    const defaultValues = useMemo(() => shippingTemplateFormFromResponse(editing), [editing])
    const form = useAppForm({
        defaultValues,
        validators: { onSubmit: ShippingTemplateFormSchema },
        onSubmit: async ({ value }: { value: ShippingTemplateFormValues }) => {
            try {
                await save.mutateAsync(shippingTemplateRequestFromForm(shopId, value))
                // applyServerFieldErrors(form, {}) 不是空操作：这一页不像弹窗会卸载，不清就留着上一轮的红字
                applyServerFieldErrors(form, {})
                form.reset(value)
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    // 显式类型形参不能省：键不止顶层字段名，还有 regions[3].firstFee 这类带下标路径
                    serverFieldErrors<Record<string, string>>(error, shippingServerFieldMap(value)),
                )
                // 抛出：form-core 才会把 isSubmitSuccessful 复位，接住它的是 submitForm
                throw error
            }
        },
    })

    useUnsavedLeaveGuard(() => form.state.isDirty && !save.isPending)

    useEffect(() => {
        form.reset(shippingTemplateFormFromResponse(editing))
        // form 实例稳定，重置只跟随店铺/远端模板变化
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shopId, editing])

    const isNew = editing === undefined
    const status = editing ? shippingStatusOf(editing) : undefined

    return (
        <div className="mx-auto w-full max-w-narrow space-y-4 pb-24">
            <Card size="sm">
                <CardContent className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <p className="text-sm text-muted-foreground">
                        {isNew
                            ? t("shipping.empty.title")
                            : status === "active"
                              ? t("shipping.activeNotice")
                              : t("shipping.draftNotice")}
                    </p>
                </CardContent>
            </Card>

            <form
                onSubmit={(event) => {
                    event.preventDefault()
                    // 别「简化」成 form.handleSubmit()：它透出的 rejection 会变成未处理异步异常，submitForm 才接得住
                    void submitForm(form)
                }}
            >
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("shipping.basic.title")}</CardTitle>
                            <CardDescription>{t("shipping.basic.hint")}</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <form.AppField name="name">
                                {(field) => (
                                    <field.TextField
                                        label={t("shipping.basic.name")}
                                        required
                                        maxLength={50}
                                    />
                                )}
                            </form.AppField>
                            <form.AppField name="chargeBy">
                                {(field) => (
                                    <field.SelectField
                                        label={t("shipping.basic.chargeBy")}
                                        required
                                        items={[
                                            { value: "piece", label: t("shipping.chargeBy.piece") },
                                            {
                                                value: "weight",
                                                label: t("shipping.chargeBy.weight"),
                                            },
                                        ]}
                                    />
                                )}
                            </form.AppField>
                            <form.AppField name="freeOver">
                                {(field) => (
                                    <field.TextField
                                        label={t("shipping.freeShipping.amountLabel")}
                                        placeholder={t(
                                            "shipping.freeShipping.thresholdPlaceholder",
                                        )}
                                        inputMode="decimal"
                                    />
                                )}
                            </form.AppField>
                        </CardContent>
                    </Card>

                    <RegionRulesEditor form={form} />
                </div>

                <div className="sticky bottom-0 z-sticky mt-4 flex items-center justify-between gap-4 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur">
                    <p className="text-xs text-muted-foreground">{t("shipping.saveNotice")}</p>
                    <div className="flex gap-2">
                        {editing && status === "draft" && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={activate.isPending}
                                onClick={() => activate.mutate(editing.id)}
                            >
                                {t("shipping.activate")}
                            </Button>
                        )}
                        <Button
                            type="submit"
                            disabled={save.isPending}
                        >
                            {save.isPending && <Spinner />}
                            {isNew ? t("shipping.save.new") : t("shipping.save.edit")}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    )
}

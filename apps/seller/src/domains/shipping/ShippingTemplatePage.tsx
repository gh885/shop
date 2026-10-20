import { useEffect, useMemo } from "react"
import { useT } from "#/locales/use-t"
import { CircleAlert, Plus, Trash2 } from "lucide-react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { serverFieldErrors, submitForm, useUnsavedLeaveGuard } from "@shop/app-kit/forms"
import {
    Button,
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldLabel,
    FieldTitle,
    Spinner,
    Switch,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"

import { useShop } from "#/domains/shop"
import { FEE_TIER_FIELDS } from "./constants"
import { FeeTierFields } from "./components/FeeTierFields"
import { RegionMultiPicker } from "./components/RegionMultiPicker"
import type { ShippingForm } from "./form-instance"
import { EMPTY_FEE_TIER, ShippingTemplateFormSchema, type ShippingTemplateFormValues } from "./form"
import { shippingTemplateFormFromResponse, shippingTemplateRequestFromForm } from "./rules"
import { shippingTemplateOptions, useSaveShippingTemplate } from "./queries"

const FEE_TIER_KEYS = FEE_TIER_FIELDS.map((tier) => tier.key)

// Money 两格连服务端嵌套的 .amount 写法一起登记：少一种，那条 422 永远落不了地
function addCellPaths(
    map: Record<string, string>,
    prefix: string,
    key: (typeof FEE_TIER_KEYS)[number],
): void {
    const path = `${prefix}.${key}`
    map[path] = path
    if (key === "firstFee" || key === "addFee") map[`${path}.amount`] = path
}

export function shippingServerFieldMap(values: ShippingTemplateFormValues): Record<string, string> {
    const map: Record<string, string> = {
        freeOverQuantity: "freeOverQuantity",
        freeOverAmount: "freeOverAmount",
        "freeOverAmount.amount": "freeOverAmount",
        excludedRegions: "excludedRegions",
    }
    for (const key of FEE_TIER_KEYS) addCellPaths(map, "defaultRule", key)
    for (const [index] of values.regionRules.entries()) {
        const prefix = `regionRules[${index}]`
        for (const key of FEE_TIER_KEYS) addCellPaths(map, prefix, key)
        // 「这一条还没选地区」服务端是 @NotEmpty，路径就是数组字段本身：别当恒等映射删
        map[`${prefix}.regionPrefixes`] = `${prefix}.regionPrefixes`
    }
    // 元素级 @Pattern 报的是 excludedRegions[3] 带下标路径：逐个列全，同落在那一个选择器上
    for (const [index] of values.excludedRegions.entries()) {
        map[`excludedRegions[${index}]`] = "excludedRegions"
    }
    return map
}
function RegionRulesEditor({ form }: { form: ShippingForm }) {
    const t = useT()

    function addRule() {
        if (form.state.values.regionRules.length >= 50) return
        form.pushFieldValue("regionRules", {
            id: crypto.randomUUID(),
            regionPrefixes: [],
            ...EMPTY_FEE_TIER,
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
                        {rules.length === 0 ? (
                            <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                                {t("shipping.region.emptyHint")}
                            </p>
                        ) : (
                            rules.map((rule, index) => (
                                <div
                                    key={rule.id}
                                    className="rounded-lg border p-4"
                                >
                                    <div className="mb-4 flex items-center justify-between">
                                        <p className="text-sm font-medium">
                                            {t("shipping.region.itemTitle", {
                                                index: index + 1,
                                            })}
                                        </p>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={t("shipping.region.removeAria")}
                                            onClick={() =>
                                                form.removeFieldValue("regionRules", index)
                                            }
                                        >
                                            <Trash2 />
                                        </Button>
                                    </div>
                                    <div className="space-y-4">
                                        <form.AppField
                                            name={`regionRules[${index}].regionPrefixes`}
                                        >
                                            {(field) => (
                                                <Field>
                                                    <FieldLabel required>
                                                        {t("shipping.region.coverage")}
                                                    </FieldLabel>
                                                    <RegionMultiPicker
                                                        value={field.state.value}
                                                        onChange={field.handleChange}
                                                        ariaLabel={t("shipping.region.coverage")}
                                                    />
                                                    <FieldError errors={field.state.meta.errors} />
                                                </Field>
                                            )}
                                        </form.AppField>
                                        <FeeTierFields
                                            form={form}
                                            prefix={`regionRules[${index}]`}
                                        />
                                    </div>
                                </div>
                            ))
                        )}
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
    const templateQuery = useSuspenseQuery(shippingTemplateOptions(shopId))
    const save = useSaveShippingTemplate(shopId)

    const defaultValues = useMemo(() => shippingTemplateFormFromResponse(undefined), [])
    const form = useAppForm({
        defaultValues,
        validators: { onSubmit: ShippingTemplateFormSchema },
        onSubmit: async ({ value }: { value: ShippingTemplateFormValues }) => {
            try {
                await save.mutateAsync(shippingTemplateRequestFromForm(value))
                // applyServerFieldErrors(form, {}) 不是空操作：这一页不像弹窗会卸载，不清就留着上一轮的红字
                applyServerFieldErrors(form, {})
                form.reset(value)
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    // 显式类型形参不能省：键不止顶层字段名，还有 excludedRegions[3] 这类带下标路径
                    serverFieldErrors<Record<string, string>>(error, shippingServerFieldMap(value)),
                )
                // 抛出：form-core 才会把 isSubmitSuccessful 复位，接住它的是 submitForm
                throw error
            }
        },
    })

    useUnsavedLeaveGuard(() => form.state.isDirty && !save.isPending)

    useEffect(() => {
        form.reset(shippingTemplateFormFromResponse(templateQuery.data ?? undefined))
        // form 实例稳定，重置只跟随店铺/远端模板变化
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shopId, templateQuery.data])

    const isNew = templateQuery.data == undefined
    return (
        <div className="mx-auto w-full max-w-narrow space-y-4 pb-24">
            <Card size="sm">
                <CardContent className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <p className="text-sm text-muted-foreground">
                        {isNew ? t("shipping.empty.title") : t("shipping.editNotice")}
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
                    {" "}
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("shipping.freeShipping.title")}</CardTitle>
                            <CardDescription>{t("shipping.freeShipping.hint")}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <form.AppField name="freeShipping">
                                {(field) => (
                                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                                        <FieldContent>
                                            <FieldTitle>
                                                {t("shipping.freeShipping.field")}
                                            </FieldTitle>
                                            <FieldDescription>
                                                {t("shipping.freeShipping.fieldHint")}
                                            </FieldDescription>
                                        </FieldContent>
                                        <Switch
                                            checked={field.state.value}
                                            onCheckedChange={field.handleChange}
                                        />
                                    </div>
                                )}
                            </form.AppField>

                            <form.Subscribe selector={(state) => state.values.freeShipping}>
                                {(freeShipping) =>
                                    freeShipping ? (
                                        <p className="rounded-lg bg-info-subtle px-4 py-3 text-sm text-info-subtle-foreground">
                                            {t("shipping.freeShipping.onHint")}
                                        </p>
                                    ) : (
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <form.AppField name="freeOverQuantity">
                                                {(field) => (
                                                    <field.TextField
                                                        label={t(
                                                            "shipping.freeShipping.quantityLabel",
                                                        )}
                                                        placeholder={t(
                                                            "shipping.freeShipping.thresholdPlaceholder",
                                                        )}
                                                        inputMode="numeric"
                                                    />
                                                )}
                                            </form.AppField>
                                            <form.AppField name="freeOverAmount">
                                                {(field) => (
                                                    <field.TextField
                                                        label={t(
                                                            "shipping.freeShipping.amountLabel",
                                                        )}
                                                        placeholder={t(
                                                            "shipping.freeShipping.thresholdPlaceholder",
                                                        )}
                                                        inputMode="decimal"
                                                    />
                                                )}
                                            </form.AppField>
                                        </div>
                                    )
                                }
                            </form.Subscribe>
                        </CardContent>
                    </Card>{" "}
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("shipping.default.title")}</CardTitle>
                            <CardDescription>{t("shipping.default.hint")}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FeeTierFields
                                form={form}
                                prefix="defaultRule"
                            />
                        </CardContent>
                    </Card>{" "}
                    <RegionRulesEditor form={form} />{" "}
                    <form.AppField name="excludedRegions">
                        {(field) => (
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t("shipping.blocked.title")}</CardTitle>
                                    <CardDescription>{t("shipping.blocked.hint")}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Field>
                                        <FieldLabel>{t("shipping.blocked.field")}</FieldLabel>
                                        <RegionMultiPicker
                                            value={field.state.value}
                                            onChange={field.handleChange}
                                            placeholder={t("shipping.blocked.placeholder")}
                                            ariaLabel={t("shipping.blocked.field")}
                                        />
                                        <FieldError errors={field.state.meta.errors} />
                                    </Field>
                                </CardContent>
                            </Card>
                        )}
                    </form.AppField>
                </div>

                <div className="sticky bottom-0 z-sticky mt-4 flex items-center justify-between gap-4 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur">
                    <p className="text-xs text-muted-foreground">{t("shipping.saveNotice")}</p>
                    <Button
                        type="submit"
                        disabled={save.isPending}
                    >
                        {save.isPending && <Spinner />}
                        {isNew ? t("shipping.save.new") : t("shipping.save.edit")}
                    </Button>
                </div>
            </form>
        </div>
    )
}

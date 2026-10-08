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

import { useShop } from "#/shop"
import { FEE_TIER_FIELDS } from "./constants"
import { FeeTierFields } from "./components/FeeTierFields"
import { RegionMultiPicker } from "./components/RegionMultiPicker"
import type { ShippingForm } from "./form-instance"
import {
    EMPTY_FEE_TIER,
    shippingTemplateFormFromResponse,
    shippingTemplateRequestFromForm,
    ShippingTemplateFormSchema,
    type ShippingTemplateFormValues,
} from "./model"
import { shippingTemplateOptions, useSaveShippingTemplate } from "./queries"

/**
 * 后端 `ShippingTemplateRequest` 的路径 → 本页有错误位的输入框（`{ 服务端: 表单 }`，白名单）。
 *
 * <p>四格（首件/首费/续件/续费）与每条规则的覆盖地区**现在都是真的表单字段**（`FeeTierFields`），
 * 所以这一族的映射全是恒等：服务端 `defaultRule.firstFee` / `regionRules[2].addFee` 落进那一格自己那行红字。
 * 迁移前它们塌成「整块一行」（`defaultRule.*` → `defaultRule`），那是因为那一格不在字段表里，
 * 落上去只能到卡片级——不是设计偏好，是没有可标的框。
 *
 * <p>Money 那一族后端报的是 `X.amount`（`Money` 的嵌套字段），两种写法都登记：少一种就是那条 422 永远落不了地。
 * `excludedRegions[i]` 这种**元素级**路径按当前值逐个列全，同落在那一个地区选择器上。
 */
const FEE_TIER_KEYS = FEE_TIER_FIELDS.map((tier) => tier.key)

/** 一格的路径 → 该格；Money 那两格额外登记服务端嵌套的 `.amount` 写法 */
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
        // 「这一条还没选地区」在服务端是 `@NotEmpty`，路径就是这个数组字段本身
        map[`${prefix}.regionPrefixes`] = `${prefix}.regionPrefixes`
    }
    // 元素级约束（`@Pattern`）报的是 `excludedRegions[3]` 这种带下标的路径：按当前值逐个列出来，
    // 它们同落在那一个地区选择器上
    for (const [index] of values.excludedRegions.entries()) {
        map[`excludedRegions[${index}]`] = "excludedRegions"
    }
    return map
}
/**
 * 指定地区运费那一叠规则：整张列表由 `form` 自己读写（`pushFieldValue` / `removeFieldValue`），
 * 每一行里的地区选择器与四格都是**独立的字段**——所以第 3 行的错只会红在第 3 行。
 */
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

    // 整张列表读自一个订阅：不加这层，push/删除改了数组值而这一块的 render 不会跟着重跑
    // （`form.state.values` 直接读是没有订阅的）
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
                                        {/* 覆盖地区也是字段：那句「第 N 条还没选地区」得落在它自己那一行 */}
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
        // 一份 schema 管完校验与换算：每条 issue 都带 path，错落在它自己那一格（不再有 form 级那句话）
        validators: { onSubmit: ShippingTemplateFormSchema },
        onSubmit: async ({ value }: { value: ShippingTemplateFormValues }) => {
            try {
                await save.mutateAsync(shippingTemplateRequestFromForm(value))
                // 成功这一轮没有字段级明细：这一页不像弹窗会卸载，表单与上一轮的红都还在页面上，
                // 所以显式清一次（不调用就等于让上次落的那句挂着，而这次已经保存成功了）
                applyServerFieldErrors(form, {})
                form.reset(value)
            } catch (error) {
                // 422 的字段级明细落到那一块输入区上（此前只有一句全局 toast，说不清是哪一档）
                applyServerFieldErrors(
                    form,
                    // 显式类型形参：目标键不止 `keyof ShippingTemplateFormValues` 那六个顶层名，
                    // 还有 `excludedRegions[3]` 这类带下标的路径
                    serverFieldErrors<Record<string, string>>(error, shippingServerFieldMap(value)),
                )
                // 抛出：form-core 才会把 isSubmitSuccessful 复位，接住它的是 submitForm
                throw error
            }
        },
    })

    useUnsavedLeaveGuard(() => form.state.isDirty && !save.isPending)

    // 当前店铺/远端模板变化时重新灌值；保存后 queryCache 回写也会走到这里。
    // suspense 形态下渲染到这里必有数据（加载中挂在路由 pendingComponent，失败在错误页）
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
                    // 不写 void form.handleSubmit()：void 不接 rejection，onSubmit 抛出的错误会变成
                    // 未处理的异步异常（submitForm 接住它，并把非接口错误上报监控）
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
                                        {/* 这一族没有逐框，只有「这一个选择器」：超过 100 个前缀那类
                                            容器级约束（@Size）落在这里，元素级（@Pattern）同落这一行 */}
                                        <FieldError errors={field.state.meta.errors} />
                                    </Field>
                                </CardContent>
                            </Card>
                        )}
                    </form.AppField>
                </div>

                <div className="sticky bottom-0 z-30 mt-4 flex items-center justify-between gap-4 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
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

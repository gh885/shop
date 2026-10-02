import { useEffect, useMemo } from "react"
import { useT } from "#/locales/use-t"
import { CircleAlert, Plus, Trash2 } from "lucide-react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { serverFieldErrorTexts, submitForm, useUnsavedLeaveGuard } from "@shop/app-kit/forms"
import { useI18n } from "@shop/app-kit/i18n"
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
    FormError,
    Spinner,
    Switch,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"

import { useShop } from "#/shop"
import { FeeTierInputs } from "./components/FeeTierInputs"
import { RegionMultiPicker } from "./components/RegionMultiPicker"
import {
    EMPTY_FEE_TIER,
    type RegionRuleFormValue,
    shippingTemplateFormFromResponse,
    shippingTemplateRequestFromForm,
    type ShippingTemplateFormValues,
    validateShippingTemplateForm,
} from "./model"
import { shippingTemplateOptions, useSaveShippingTemplate } from "./queries"

/**
 * 后端 `ShippingTemplateRequest` 的路径 → 本页有错误位的输入框（`{ 服务端: 表单 }`，白名单）。
 *
 * <p>这一页的表单只注册到**顶层**那几格（`defaultRule` 是一整个费用档卡片、`regionRules` 是一整张
 * 地区规则列表），档位里那四个输入框与每条规则的覆盖地区都不是表单字段。于是服务端那些嵌套路径只能
 * 落到「这一块」的粒度：
 *
 * - `defaultRule.*` → `defaultRule`（那张卡片现在有一行错误位）；
 * - `excludedRegions` / `excludedRegions[i]` → `excludedRegions`（同理）；
 * - `freeOverQuantity` / `freeOverAmount.*` → 各自那个输入框。
 *
 * <p>`regionRules[i].*` **刻意不列**：整个数组是一个字段，第 3 条规则的错会显示在列表末尾，而 catalog
 * 那句话里不含「第几条」——落错框比不落框更难排查（后端那句兜底中文带得出路径，全局 toast 仍在）。
 * 另外这一族的约束（`@NotEmpty regionPrefixes`、`@Min(1)`、Money `@Min(0)`）本地 `validateShippingTemplateForm`
 * 全都先拦住了，请求根本发不出去，所以今天少的是「以后端改了上限」那一半而不是现在的可见性。
 */
export function shippingServerFieldMap(values: ShippingTemplateFormValues): Record<string, string> {
    const map: Record<string, string> = {
        freeOverQuantity: "freeOverQuantity",
        freeOverAmount: "freeOverAmount",
        "freeOverAmount.amount": "freeOverAmount",
        defaultRule: "defaultRule",
        "defaultRule.firstQuantity": "defaultRule",
        "defaultRule.addQuantity": "defaultRule",
        "defaultRule.firstFee": "defaultRule",
        "defaultRule.firstFee.amount": "defaultRule",
        "defaultRule.addFee": "defaultRule",
        "defaultRule.addFee.amount": "defaultRule",
        excludedRegions: "excludedRegions",
    }
    // 元素级约束（`@Pattern`）报的是 `excludedRegions[3]` 这种带下标的路径：按当前值逐个列出来，
    // 它们同落在那一个地区选择器上
    for (const [index] of values.excludedRegions.entries()) {
        map[`excludedRegions[${index}]`] = "excludedRegions"
    }
    return map
}
function RegionRulesEditor({
    value,
    onChange,
}: {
    value: RegionRuleFormValue[]
    onChange: (value: RegionRuleFormValue[]) => void
}) {
    const t = useT()
    function update(index: number, next: Partial<RegionRuleFormValue>) {
        onChange(
            value.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item)),
        )
    }

    function addRule() {
        onChange([
            ...value,
            {
                id: crypto.randomUUID(),
                regionPrefixes: [],
                ...EMPTY_FEE_TIER,
            },
        ])
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("seller.shipping.region.title")}</CardTitle>
                <CardDescription>{t("seller.shipping.region.hint")}</CardDescription>
                <CardAction>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={value.length >= 50}
                        onClick={addRule}
                    >
                        <Plus />
                        {t("seller.shipping.region.add")}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
                {value.length === 0 ? (
                    <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                        {t("seller.shipping.region.emptyHint")}
                    </p>
                ) : (
                    value.map((rule, index) => (
                        <div
                            key={rule.id}
                            className="rounded-lg border p-4"
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <p className="text-sm font-medium">
                                    {t("seller.shipping.region.itemTitle", { index: index + 1 })}
                                </p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={t("seller.shipping.region.removeAria")}
                                    onClick={() =>
                                        onChange(
                                            value.filter((_, itemIndex) => itemIndex !== index),
                                        )
                                    }
                                >
                                    <Trash2 />
                                </Button>
                            </div>
                            <div className="space-y-4">
                                <Field>
                                    <FieldLabel required>
                                        {t("seller.shipping.region.coverage")}
                                    </FieldLabel>
                                    <RegionMultiPicker
                                        value={rule.regionPrefixes}
                                        onChange={(regionPrefixes) =>
                                            update(index, { regionPrefixes })
                                        }
                                    />
                                </Field>
                                <FeeTierInputs
                                    value={rule}
                                    onChange={(next) => update(index, next)}
                                />
                            </div>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    )
}
export function ShippingTemplatePage() {
    const t = useT()
    const shop = useShop()
    const shopId = shop.id
    const { locale } = useI18n()
    const templateQuery = useSuspenseQuery(shippingTemplateOptions(shopId))
    const save = useSaveShippingTemplate(shopId)

    const defaultValues = useMemo(() => shippingTemplateFormFromResponse(undefined), [])
    const form = useAppForm({
        defaultValues,
        // 跨字段条款（地区重复、包邮门槛格式等）是表单级校验：错误挂在 errorMap.onSubmit，底部统一渲染
        validators: { onSubmit: ({ value }) => validateShippingTemplateForm(value) },
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
                    serverFieldErrorTexts<Record<string, string>>(
                        error,
                        locale,
                        shippingServerFieldMap(value),
                    ),
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
                        {isNew ? t("seller.shipping.empty.title") : t("seller.shipping.editNotice")}
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
                            <CardTitle>{t("seller.shipping.freeShipping.title")}</CardTitle>
                            <CardDescription>
                                {t("seller.shipping.freeShipping.hint")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <form.AppField name="freeShipping">
                                {(field) => (
                                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                                        <FieldContent>
                                            <FieldTitle>
                                                {t("seller.shipping.freeShipping.field")}
                                            </FieldTitle>
                                            <FieldDescription>
                                                {t("seller.shipping.freeShipping.fieldHint")}
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
                                            {t("seller.shipping.freeShipping.onHint")}
                                        </p>
                                    ) : (
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <form.AppField name="freeOverQuantity">
                                                {(field) => (
                                                    <field.TextField
                                                        label={t(
                                                            "seller.shipping.freeShipping.quantityLabel",
                                                        )}
                                                        placeholder={t(
                                                            "seller.shipping.freeShipping.thresholdPlaceholder",
                                                        )}
                                                        inputMode="numeric"
                                                    />
                                                )}
                                            </form.AppField>
                                            <form.AppField name="freeOverAmount">
                                                {(field) => (
                                                    <field.TextField
                                                        label={t(
                                                            "seller.shipping.freeShipping.amountLabel",
                                                        )}
                                                        placeholder={t(
                                                            "seller.shipping.freeShipping.thresholdPlaceholder",
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
                    <form.AppField name="defaultRule">
                        {(field) => (
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t("seller.shipping.default.title")}</CardTitle>
                                    <CardDescription>
                                        {t("seller.shipping.default.hint")}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <FeeTierInputs
                                        value={field.state.value}
                                        onChange={field.handleChange}
                                    />
                                    {/* 这一整档不是一个输入框，服务端那句只能落到「默认运费」这一块的
                                        底部一行（四格共用一条错误位，见 shippingServerFieldMap） */}
                                    <FieldError errors={field.state.meta.errors} />
                                </CardContent>
                            </Card>
                        )}
                    </form.AppField>{" "}
                    <form.AppField name="regionRules">
                        {(field) => (
                            <RegionRulesEditor
                                value={field.state.value}
                                onChange={field.handleChange}
                            />
                        )}
                    </form.AppField>{" "}
                    <form.AppField name="excludedRegions">
                        {(field) => (
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t("seller.shipping.blocked.title")}</CardTitle>
                                    <CardDescription>
                                        {t("seller.shipping.blocked.hint")}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Field>
                                        <FieldLabel>
                                            {t("seller.shipping.blocked.field")}
                                        </FieldLabel>
                                        <RegionMultiPicker
                                            value={field.state.value}
                                            onChange={field.handleChange}
                                            placeholder={t("seller.shipping.blocked.placeholder")}
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
                <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
                    {(error) => <FormError className="mt-4">{error}</FormError>}
                </form.Subscribe>

                <div className="sticky bottom-0 z-30 mt-4 flex items-center justify-between gap-4 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
                    <p className="text-xs text-muted-foreground">
                        {t("seller.shipping.saveNotice")}
                    </p>
                    <Button
                        type="submit"
                        disabled={save.isPending}
                    >
                        {save.isPending && <Spinner />}
                        {isNew ? t("seller.shipping.save.new") : t("seller.shipping.save.edit")}
                    </Button>
                </div>
            </form>
        </div>
    )
}

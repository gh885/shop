import { useEffect, useMemo, useState } from "react"
import { CircleAlert, Plus, Trash2 } from "lucide-react"
import { useBlocker } from "@tanstack/react-router"
import { toApiError } from "@shop/common"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Button,
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Field,
    Skeleton,
    Spinner,
    StateError,
    Switch,
    useAppForm,
} from "@shop/ui-web"

import { ShopRequired } from "#/shared/ui/ShopRequired"
import { useCurrentShop } from "#/shop"
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
import { useSaveShippingTemplate, useShippingTemplate } from "./queries"
function RegionRulesEditor({
    value,
    onChange,
}: {
    value: RegionRuleFormValue[]
    onChange: (value: RegionRuleFormValue[]) => void
}) {
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
                <CardTitle>指定地区运费</CardTitle>
                <CardDescription>
                    命中的地区按更长的区划码优先；广东全省和深圳可以分别定价。
                </CardDescription>
                <CardAction>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={value.length >= 50}
                        onClick={addRule}
                    >
                        <Plus />
                        添加地区规则
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
                {value.length === 0 ? (
                    <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                        未配置指定地区时，所有地区都使用默认运费。
                    </p>
                ) : (
                    value.map((rule, index) => (
                        <div
                            key={rule.id}
                            className="rounded-lg border p-4"
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <p className="text-sm font-medium">地区规则 {index + 1}</p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="删除地区规则"
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
                                <Field
                                    label="覆盖地区"
                                    required
                                >
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
    const shop = useCurrentShop()
    const shopId = shop?.id
    const templateQuery = useShippingTemplate()
    const save = useSaveShippingTemplate()
    const [serverError, setServerError] = useState<string>()

    const defaultValues = useMemo(() => shippingTemplateFormFromResponse(undefined), [])
    const form = useAppForm({
        defaultValues,
        onSubmit: async ({ value }: { value: ShippingTemplateFormValues }) => {
            setServerError(undefined)
            const validationError = validateShippingTemplateForm(value)
            if (validationError) {
                setServerError(validationError)
                return
            }

            try {
                await save.mutateAsync(shippingTemplateRequestFromForm(value))
                form.reset(value)
            } catch (error) {
                setServerError(toApiError(error).detail)
            }
        },
    })

    const blocker = useBlocker({
        shouldBlockFn: () => form.state.isDirty && !save.isPending,
        withResolver: true,
    })

    // 当前店铺/远端模板变化时重新灌值；保存后 queryCache 回写也会走到这里
    useEffect(() => {
        if (!shopId || templateQuery.isPending || templateQuery.isError) return
        form.reset(shippingTemplateFormFromResponse(templateQuery.data ?? undefined))
        // form 实例稳定，重置只跟随店铺/远端模板变化
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shopId, templateQuery.data, templateQuery.isPending, templateQuery.isError])

    if (!shop) {
        return <ShopRequired description="创建店铺或等待审核通过后，再来设置运费模板。" />
    }

    if (templateQuery.isError) {
        return (
            <StateError
                message={toApiError(templateQuery.error).detail}
                onRetry={() => void templateQuery.refetch()}
                retrying={templateQuery.isFetching}
            />
        )
    }

    if (templateQuery.isPending) {
        return (
            <div className="mx-auto w-full max-w-(--container-narrow) space-y-4">
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-44 w-full rounded-xl" />
                <Skeleton className="h-44 w-full rounded-xl" />
            </div>
        )
    }

    const isNew = templateQuery.data == undefined
    return (
        <div className="mx-auto w-full max-w-(--container-narrow) space-y-4 pb-24">
            <Card size="sm">
                <CardContent className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <p className="text-sm text-muted-foreground">
                        {isNew
                            ? "你还没有设置运费模板，当前商品结算暂按包邮。保存后对新订单生效。"
                            : "运费模板修改后只影响新订单，已下单订单继续使用下单时的模板快照。"}
                    </p>
                </CardContent>
            </Card>

            <form
                onSubmit={(event) => {
                    event.preventDefault()
                    void form.handleSubmit()
                }}
            >
                <div className="space-y-4">
                    {" "}
                    <Card>
                        <CardHeader>
                            <CardTitle>包邮设置</CardTitle>
                            <CardDescription>
                                开启全店包邮后不再按地区/件数计算运费；不配送地区仍然生效。
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <form.AppField name="freeShipping">
                                {(field) => (
                                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium">全店包邮</p>
                                            <p className="text-xs text-muted-foreground">
                                                卖家承担全部运费，不看地区和件数。
                                            </p>
                                        </div>
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
                                            已开启全店包邮，默认运费和指定地区运费仍会保留，关闭包邮后可继续使用。
                                        </p>
                                    ) : (
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <form.AppField name="freeOverQuantity">
                                                {(field) => (
                                                    <field.TextField
                                                        label="满件包邮（件）"
                                                        placeholder="留空表示不设门槛"
                                                        inputMode="numeric"
                                                    />
                                                )}
                                            </form.AppField>
                                            <form.AppField name="freeOverAmount">
                                                {(field) => (
                                                    <field.TextField
                                                        label="满额包邮（元）"
                                                        placeholder="留空表示不设门槛"
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
                                    <CardTitle>默认运费</CardTitle>
                                    <CardDescription>
                                        未命中指定地区规则时使用。按件计费，不足一档按一档。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <FeeTierInputs
                                        value={field.state.value}
                                        onChange={field.handleChange}
                                    />
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
                                    <CardTitle>不配送地区</CardTitle>
                                    <CardDescription>
                                        命中即无法下单，优先于包邮；不要把它当成「不包邮地区」。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Field label="选择地区">
                                        <RegionMultiPicker
                                            value={field.state.value}
                                            onChange={field.handleChange}
                                            placeholder="选择不配送的省 / 市 / 区"
                                        />
                                    </Field>
                                </CardContent>
                            </Card>
                        )}
                    </form.AppField>
                </div>
                {serverError ? (
                    <p
                        role="alert"
                        className="mt-4 flex items-center gap-2 rounded-lg bg-destructive-subtle px-4 py-2.5 text-sm text-destructive-subtle-foreground"
                    >
                        <CircleAlert className="size-4 shrink-0" />
                        {serverError}
                    </p>
                ) : undefined}

                <div className="sticky bottom-0 z-30 mt-4 flex items-center justify-between gap-4 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
                    <p className="text-xs text-muted-foreground">
                        保存后对新订单生效，已下单订单不受影响。
                    </p>
                    <Button
                        type="submit"
                        disabled={save.isPending}
                    >
                        {save.isPending ? <Spinner /> : undefined}
                        {isNew ? "创建运费模板" : "保存"}
                    </Button>
                </div>
            </form>
            {blocker.status === "blocked" ? (
                <AlertDialog
                    open
                    onOpenChange={(open) => {
                        if (!open) blocker.reset()
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>有未保存的更改</AlertDialogTitle>
                            <AlertDialogDescription>
                                离开后当前页面的修改将丢失，确定要离开吗？
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>继续编辑</AlertDialogCancel>
                            <AlertDialogAction
                                variant="destructive"
                                onClick={blocker.proceed}
                            >
                                放弃修改
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            ) : undefined}
        </div>
    )
}

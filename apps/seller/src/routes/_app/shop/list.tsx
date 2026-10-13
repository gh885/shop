import { message } from "#/locales/message"
import { useMyShops, useCurrentShop, shopKeys } from "#/shop"
import { SHOP_NAME_MAX, SHOP_STATUS_META } from "#/shop/constants"
import { CreateShopFormSchema } from "#/shop/shop-form"
import { setCurrentShopId } from "#/shop"
import { formatDate } from "@shop/app-kit/display"
import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { ShopsApi, type ShopResponse } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Store, CheckCircle2 } from "lucide-react"
import { useState } from "react"
import {
    applyServerFieldErrors,
    Skeleton,
    Empty,
    Badge,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    EmptyDescription,
    Item,
    ItemContent,
    ItemTitle,
    ItemDescription,
    ItemActions,
    ItemFooter,
    Button,
    useAppForm,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    Field,
    FieldError,
    ButtonGroup,
    Input,
    Spinner,
} from "@shop/ui-web"

export const Route = createFileRoute("/_app/shop/list")({
    component: ShopsPage,
})

function ShopsPage() {
    const t = useT()
    const shops = useMyShops()
    const current = useCurrentShop()

    // 失败已由全局默认的 throwOnError 交给路由错误页（官方边界 + 重置重试）
    return (
        <div className="mx-auto w-full max-w-3xl space-y-8">
            <div>
                <h1 className="text-xl font-bold">{t("shop.list.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("shop.list.subtitle")}</p>
            </div>

            <section className="space-y-3">
                {/* 这里用 isLoading 而不是 isPending（其余列表页已统一成 isPending）：useMyShops 带 enabled: status === "authed"，
                    未登录/未裁决时 enabled 为 false，isPending 会恒为 true → 永久骨架；isLoading（= isPending && isFetching）
                    在这种「没启用」状态下为 false，正好不闪。ShopGate 在外层也会先给骨架，但本页不依赖那层保险 */}
                {shops.isLoading ? (
                    <div className="space-y-3">
                        {[0, 1].map((i) => (
                            <Skeleton
                                key={i}
                                className="h-20 w-full rounded-lg"
                            />
                        ))}
                    </div>
                ) : shops.data && shops.data.length > 0 ? (
                    shops.data.map((shop) => (
                        <ShopCard
                            key={shop.id}
                            shop={shop}
                            isCurrent={current?.id === shop.id}
                        />
                    ))
                ) : (
                    <Empty className="py-14">
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <Store />
                            </EmptyMedia>
                            <EmptyTitle>{t("shop.list.empty.title")}</EmptyTitle>
                            <EmptyDescription>{t("shop.list.empty.body")}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                )}
            </section>

            <CreateShopForm />
        </div>
    )
}

function ShopCard({ shop, isCurrent }: { shop: ShopResponse; isCurrent: boolean }) {
    const t = useT()
    const { locale } = useI18n()
    return (
        <Item
            variant="outline"
            size="lg"
            className="justify-between"
        >
            <ItemContent>
                <ItemTitle className="flex items-center">
                    {shop.name}
                    <Badge variant={SHOP_STATUS_META[shop.status].variant}>
                        {t(SHOP_STATUS_META[shop.status].labelKey)}
                    </Badge>
                    {isCurrent ? (
                        <Badge variant="outline">{t("shop.card.current")}</Badge>
                    ) : undefined}
                </ItemTitle>
                <ItemDescription>
                    {t("shop.card.createdAt", { date: formatDate(shop.createdAt, locale) })}
                </ItemDescription>
            </ItemContent>
            {shop.status === "ACTIVE" && !isCurrent ? (
                <ItemActions>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentShopId(shop.id)}
                    >
                        {t("shop.card.setCurrent")}
                    </Button>
                </ItemActions>
            ) : undefined}
            {shop.status === "REJECTED" ? <RejectedRow shop={shop} /> : undefined}
        </Item>
    )
}

/** 被驳回的店铺行：亮出驳回理由 + 原地重提入口（改店名或沿用原名，重新进审核队列） */
function RejectedRow({ shop }: { shop: ShopResponse }) {
    const t = useT()
    const resubmit = useMutation({
        mutationFn: (name: string) =>
            ShopsApi.resubmitShopReview({
                path: { shopId: shop.id },
                body: { name },
            }),
        meta: {
            success: message("shop.resubmit.success"),
            error: message("shop.resubmit.error"),
            invalidates: [shopKeys.all],
        },
    })

    return (
        <ItemFooter className="flex-col items-start">
            <ItemDescription lines={3}>
                {t("shop.resubmit.rejectReason", {
                    reason: shop.rejectReason || t("shop.resubmit.rejectReasonFallback"),
                })}
            </ItemDescription>
            <ShopNameForm
                label={t("shop.resubmit.nameLabel")}
                submitText={t("shop.resubmit.submit")}
                defaultValue={shop.name}
                pending={resubmit.isPending}
                onSubmit={(name) => resubmit.mutateAsync(name)}
            />
        </ItemFooter>
    )
}

/** 开店表单：提交后落 PENDING_REVIEW，等平台审核 */
function CreateShopForm() {
    const t = useT()
    const [done, setDone] = useState(false)

    const create = useMutation({
        mutationFn: (value: string) => ShopsApi.createShop({ body: { name: value } }),
        meta: { error: message("shop.create.error"), invalidates: [shopKeys.all] },
        onSuccess: () => setDone(true),
    })

    return (
        <Card size="sm">
            <CardHeader>
                <CardTitle>{t("shop.create.title")}</CardTitle>
                <CardDescription>{t("shop.create.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
                <ShopNameForm
                    label={t("shop.create.nameLabel")}
                    submitText={t("shop.create.submit")}
                    defaultValue=""
                    pending={create.isPending}
                    onSubmit={(name) => {
                        setDone(false)
                        return create.mutateAsync(name)
                    }}
                />
                <div className="mt-2 min-h-5">
                    {done ? (
                        <p className="flex items-center gap-1 text-sm text-success">
                            <CheckCircle2 className="size-3.5" />
                            {t("shop.create.pending")}
                        </p>
                    ) : undefined}
                </div>
            </CardContent>
        </Card>
    )
}

/** 店名一行表单（「输入 + 提交」）：开店与被拒重提共用，提交动作由调用方的 mutation 决定 */
function ShopNameForm({
    label,
    submitText,
    defaultValue,
    pending,
    onSubmit,
}: {
    label: string
    submitText: string
    defaultValue: string
    pending: boolean
    onSubmit: (name: string) => Promise<unknown>
}) {
    const t = useT()

    const form = useAppForm({
        defaultValues: { name: defaultValue },
        validators: { onSubmit: CreateShopFormSchema },
        onSubmit: async ({ value }) => {
            // DTO CreateShopRequest 的 logoKey 本表单没有输入框，不进 map；name 同名有框（@NotBlank + @Size）。
            // 开店与被拒重提共用这一条通道：抛出的 rejection 由外层 submitForm 接住（接口错误交全局 toast）。
            try {
                await onSubmit(value.name)
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        name: "name",
                    }),
                )
                throw error
            }
        },
    })

    return (
        <form
            className="w-full"
            onSubmit={(e) => {
                e.preventDefault()
                void submitForm(form)
            }}
        >
            <form.AppField name="name">
                {(field) => (
                    <Field>
                        <ButtonGroup>
                            <Input
                                aria-label={label}
                                aria-invalid={!field.state.meta.isValid}
                                placeholder={t("shop.create.placeholder")}
                                maxLength={SHOP_NAME_MAX}
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => field.handleChange(e.target.value)}
                            />
                            <Button
                                type="submit"
                                disabled={pending}
                            >
                                {pending && <Spinner />}
                                {submitText}
                            </Button>
                        </ButtonGroup>
                        <FieldError errors={field.state.meta.errors} />
                    </Field>
                )}
            </form.AppField>
        </form>
    )
}

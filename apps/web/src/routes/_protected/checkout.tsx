import { message } from "#/locales/message"
import { addressListOptions, pickedAddressId, type Address } from "#/address"
import { useT } from "#/locales/use-t"
import {
    CouponPicker,
    GroupAmountSentence,
    checkoutTotals,
    withDefaultCoupons,
    type CheckoutGroup,
    type CheckoutPreview,
    type CheckoutSource,
    type CouponChoice,
    type CouponSelection,
    type UnavailableLine,
    useCreateOrder,
    checkoutPreviewOptions,
} from "#/checkout"
import { useI18n } from "@shop/app-kit/i18n"
import { formatMoney, isPositiveMoney, NOTE_MAX, timesMoney } from "@shop/common/domain"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { ArrowLeft, MapPin, CircleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { notify } from "@shop/app-kit/data"
import { Price } from "#/shared/ui/Price"
import { DiscountPrice } from "#/shared/ui/DiscountPrice"
import {
    Skeleton,
    Button,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Separator,
    CardFooter,
    Spinner,
    Empty,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    EmptyDescription,
    RadioGroup,
    Item,
    RadioGroupItem,
    ItemContent,
    ItemTitle,
    ItemDescription,
    Panel,
    PanelHeader,
    PanelContent,
    ItemMedia,
    ItemActions,
    Image,
    Textarea,
} from "@shop/ui-web"
import { z } from "zod"

const checkoutSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    lines: z
        .array(z.object({ skuId: z.string(), quantity: z.coerce.number().int().positive() }))
        .catch([]),
})

export const Route = createFileRoute("/_protected/checkout")({
    validateSearch: (search: Record<string, unknown>): CheckoutSource =>
        checkoutSearchSchema.parse(search),
    loader: async ({ context }) => {
        if (import.meta.env.SSR) return
        await context.queryClient.query({ ...addressListOptions, staleTime: "static" })
    },
    pendingComponent: CheckoutSkeleton,
    component: CheckoutPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.checkout", match.context.locale) }],
    }),
})

function CheckoutSkeleton() {
    return (
        <div className="mx-auto w-full max-w-page px-6 py-6">
            <Skeleton className="h-8 w-40" />
            <div className="mt-6 flex flex-col gap-6 lg:flex-row">
                <div className="flex-1 space-y-4">
                    <Skeleton className="h-24 w-full rounded-lg" />
                    <Skeleton className="h-40 w-full rounded-lg" />
                </div>
                <Skeleton className="h-40 w-full shrink-0 lg:w-80 rounded-lg" />
            </div>
        </div>
    )
}

function CheckoutPage() {
    const source = Route.useSearch()
    const addresses = useSuspenseQuery(addressListOptions).data

    const [addressId, setAddressId] = useState("")
    const [buyerMessage, setBuyerMessage] = useState("")
    const [couponSelection, setCouponSelection] = useState<CouponSelection>({})
    const effectiveAddressId = pickedAddressId(addresses, addressId)
    const preview = useQuery(
        checkoutPreviewOptions({
            source,
            addressId: effectiveAddressId || undefined,
            coupons: couponSelection,
        }),
    )

    const previewGroups = preview.data?.groups
    useEffect(() => {
        if (!previewGroups) return
        // oxlint-disable-next-line react/set-state-in-effect, react-doctor/no-adjust-state-on-prop-change -- 只在预览数据到达时补默认选券（首屏一次性），渲染期派生会覆盖用户明确的选择
        setCouponSelection((prev) => withDefaultCoupons(previewGroups, prev))
    }, [previewGroups])

    const { submit, pending } = useSubmitOrder({
        addressId: effectiveAddressId,
        source,
        coupons: couponSelection,
        buyerMessage,
    })

    return (
        <>
            <CheckoutHeader />
            <div className="mx-auto w-full max-w-page px-6 pb-10">
                {/* 预览三态在调用点二选一（DESIGN.md：不把 isLoading/isError 传进展示组件）。
                    preview 带 enabled（空结算时为 false），所以用 isLoading 而不是 isPending：
                    未启用时 isPending 恒为 true → 永久骨架。空结算（enabled=false、无 data）走 grid 分支，
                    由「无可结算条目」流程自己渲染，与加载中/失败两态互不混淆。 */}
                {preview.isLoading ? (
                    <CheckoutPreviewSkeleton />
                ) : preview.isError ? (
                    <CheckoutPreviewError onRetry={() => void preview.refetch()} />
                ) : (
                    <CheckoutGrid
                        addresses={addresses}
                        addressId={addressId}
                        onAddressChange={setAddressId}
                        preview={preview.data}
                        couponSelection={couponSelection}
                        onSelectCoupon={(shopId, choice) =>
                            setCouponSelection((prev) => ({ ...prev, [shopId]: choice }))
                        }
                        buyerMessage={buyerMessage}
                        onBuyerMessageChange={setBuyerMessage}
                        canSubmit={Boolean(effectiveAddressId)}
                        pending={pending}
                        onSubmit={submit}
                    />
                )}
            </div>
        </>
    )
}

function CheckoutPreviewSkeleton() {
    return (
        <div className="space-y-5">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
        </div>
    )
}

function CheckoutPreviewError({ onRetry }: { onRetry: () => void }) {
    const t = useT()
    return (
        <div className="flex flex-col items-center gap-4 py-16 text-sm text-muted-foreground">
            <span>{t("checkout.loadFailed")}</span>
            <Button
                variant="outline"
                onClick={onRetry}
            >
                {t("checkout.retry")}
            </Button>
        </div>
    )
}

type CheckoutGridProps = {
    addresses: Address[]
    addressId: string
    onAddressChange: (id: string) => void
    preview: CheckoutPreview | undefined
    couponSelection: CouponSelection
    onSelectCoupon: (shopId: string, choice: CouponChoice) => void
    buyerMessage: string
    onBuyerMessageChange: (value: string) => void
    canSubmit: boolean
    pending: boolean
    onSubmit: () => void
}

function CheckoutGrid({
    addresses,
    addressId,
    onAddressChange,
    preview,
    couponSelection,
    onSelectCoupon,
    buyerMessage,
    onBuyerMessageChange,
    canSubmit,
    pending,
    onSubmit,
}: CheckoutGridProps) {
    return (
        <div className="flex flex-col gap-6 lg:flex-row">
            <CheckoutLines
                addresses={addresses}
                addressId={addressId}
                onAddressChange={onAddressChange}
                preview={preview}
                couponSelection={couponSelection}
                onSelectCoupon={onSelectCoupon}
                buyerMessage={buyerMessage}
                onBuyerMessageChange={onBuyerMessageChange}
            />
            {/* 右：金额结算卡。窄屏不是一条不可压缩的 320px 固定轨——
                那会把整栏推到视口右缘外且没有任何提示；换成占满宽度、落到左栏下面 */}
            <div className="w-full shrink-0 lg:w-80">
                <CheckoutSummaryCard
                    preview={preview}
                    canSubmit={canSubmit}
                    pending={pending}
                    onSubmit={onSubmit}
                />
            </div>
        </div>
    )
}

function CheckoutLines({
    addresses,
    addressId,
    onAddressChange,
    preview,
    couponSelection,
    onSelectCoupon,
    buyerMessage,
    onBuyerMessageChange,
}: {
    addresses: Address[]
    addressId: string
    onAddressChange: (id: string) => void
    preview: CheckoutPreview | undefined
    couponSelection: CouponSelection
    onSelectCoupon: (shopId: string, choice: CouponChoice) => void
    buyerMessage: string
    onBuyerMessageChange: (value: string) => void
}) {
    const t = useT()
    return (
        <div className="min-w-0 flex-1 space-y-5">
            <AddressPicker
                addresses={addresses}
                value={addressId}
                onChange={onAddressChange}
            />
            {preview?.groups.map((g) => {
                const choice = couponSelection[g.shopId]
                return (
                    <GroupCard
                        key={g.shopId}
                        group={g}
                        // oxlint-disable-next-line no-null -- CouponPicker 视图契约：null = 选中「不使用优惠券」
                        selectedCouponId={choice?.kind === "use" ? choice.id : null}
                        onSelectCoupon={(userCouponId) =>
                            onSelectCoupon(
                                g.shopId,
                                userCouponId === null
                                    ? { kind: "none" }
                                    : { kind: "use", id: userCouponId },
                            )
                        }
                    />
                )
            })}
            {preview && <UnavailableCard lines={preview.unavailable} />}

            <Card>
                <CardHeader>
                    <CardTitle>{t("checkout.buyerMessage.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Textarea
                        value={buyerMessage}
                        onChange={(e) => onBuyerMessageChange(e.target.value)}
                        maxLength={NOTE_MAX}
                        rows={2}
                        placeholder={t("checkout.buyerMessage.placeholder")}
                    />
                </CardContent>
            </Card>
        </div>
    )
}

function CheckoutSummaryCard({
    preview,
    canSubmit,
    pending,
    onSubmit,
}: {
    preview: CheckoutPreview | undefined
    canSubmit: boolean
    pending: boolean
    onSubmit: () => void
}) {
    const t = useT()
    return (
        <Card className="sticky top-4">
            <CardHeader>
                <CardTitle>{t("checkout.summary.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                <CheckoutAmounts preview={preview} />
            </CardContent>
            <CardFooter>
                <Button
                    variant="cta"
                    className="h-12 w-full"
                    disabled={!canSubmit || pending}
                    onClick={onSubmit}
                >
                    {pending && <Spinner />}
                    {t("checkout.placeOrder")}
                </Button>
            </CardFooter>
        </Card>
    )
}

function CheckoutAmounts({ preview }: { preview: CheckoutPreview | undefined }) {
    const t = useT()
    const { itemAmount, shippingFee, discountAmount } = checkoutTotals(preview)

    return (
        <>
            <Row label={t("checkout.summary.goodsTotal")}>
                <Price
                    value={itemAmount}
                    className="text-sm"
                />
            </Row>
            <Row label={t("checkout.summary.shipping")}>
                <Price
                    value={shippingFee}
                    className="text-sm"
                />
            </Row>
            {isPositiveMoney(discountAmount) && (
                <Row label={t("checkout.summary.discount")}>
                    <DiscountPrice
                        value={discountAmount}
                        className="text-sm"
                    />
                </Row>
            )}
            <Separator />
            <div className="flex items-end justify-between">
                <span className="text-muted-foreground">{t("checkout.summary.payableLabel")}</span>
                {preview ? (
                    <Price
                        value={preview.totalPayAmount}
                        className="text-2xl font-bold text-primary-subtle-foreground"
                    />
                ) : (
                    <span className="text-2xl font-bold text-primary-subtle-foreground">—</span>
                )}
            </div>
        </>
    )
}

function useSubmitOrder({
    addressId,
    source,
    coupons,
    buyerMessage,
}: {
    addressId: string
    source: CheckoutSource
    coupons: CouponSelection
    buyerMessage: string
}) {
    const navigate = useNavigate()
    const createOrder = useCreateOrder()

    const submit = () => {
        if (!addressId) {
            notify.info(message("checkout.toast.pickAddress"))
            return
        }
        createOrder.mutate(
            {
                addressId,
                source,
                coupons,
                buyerMessage: buyerMessage.trim() || undefined,
            },
            {
                onSuccess: (res) => {
                    const first = res.orders[0]
                    if (!first) {
                        notify.error(message("checkout.toast.createFailed"))
                        return
                    }
                    void navigate({
                        to: "/pay/$orderId",
                        params: { orderId: first.id },
                    })
                },
            },
        )
    }

    return { submit, pending: createOrder.isPending }
}

function CheckoutHeader() {
    const t = useT()
    const navigate = useNavigate()
    return (
        <header className="border-b border-border/60 bg-background">
            <div className="mx-auto flex h-16 w-full max-w-page items-center gap-4 px-6">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void navigate({ to: "/cart" })}
                >
                    <ArrowLeft className="size-4" />
                    {t("checkout.backToCart")}
                </Button>
                <h1 className="text-xl font-semibold text-foreground">{t("checkout.title")}</h1>
            </div>
        </header>
    )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-foreground">{children}</span>
        </div>
    )
}

function AddressPicker({
    addresses,
    value,
    onChange,
}: {
    addresses: Address[]
    value: string
    onChange: (id: string) => void
}) {
    const t = useT()
    if (addresses.length === 0) return <NoAddress />
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <MapPin className="size-4 text-muted-foreground" />
                    {t("checkout.address.title")}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <RadioGroup
                    value={pickedAddressId(addresses, value)}
                    onValueChange={(v: string) => onChange(v)}
                >
                    {addresses.map((a) => (
                        <AddressRow
                            key={a.id}
                            address={a}
                            selected={pickedAddressId(addresses, value) === a.id}
                        />
                    ))}
                </RadioGroup>
            </CardContent>
        </Card>
    )
}

function NoAddress() {
    const t = useT()
    const navigate = useNavigate()
    return (
        <Card>
            <CardContent>
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <MapPin />
                        </EmptyMedia>
                        <EmptyTitle>{t("checkout.address.empty.title")}</EmptyTitle>
                        <EmptyDescription>{t("checkout.address.empty.body")}</EmptyDescription>
                        <Button
                            variant="outline"
                            className="mt-2"
                            onClick={() => void navigate({ to: "/account/address" })}
                        >
                            {t("checkout.address.empty.cta")}
                        </Button>
                    </EmptyHeader>
                </Empty>
            </CardContent>
        </Card>
    )
}

function AddressRow({ address, selected }: { address: Address; selected: boolean }) {
    return (
        <Item
            variant={selected ? "selected" : "selectable"}
            size="sm"
        >
            <RadioGroupItem value={address.id} />
            <ItemContent>
                <ItemTitle>
                    {address.receiver} {address.phone}
                </ItemTitle>
                <ItemDescription lines="wrap">
                    {address.province}
                    {address.city}
                    {address.district}
                    {address.detail}
                </ItemDescription>
            </ItemContent>
        </Item>
    )
}

function CheckoutLineRow({ line }: { line: CheckoutGroup["lines"][number] }) {
    const { locale } = useI18n()
    return (
        <Item
            variant="plain"
            size="lg"
        >
            <ItemMedia variant="thumbnail">
                <Image
                    src={line.image}
                    alt={line.name}
                    className="size-full"
                />
            </ItemMedia>
            <ItemContent>
                <ItemTitle
                    lines={2}
                    className="w-full"
                >
                    {line.name}
                </ItemTitle>
            </ItemContent>
            <ItemActions className="gap-6 self-center">
                <div className="w-20 text-right">
                    <span className="font-bold">{formatMoney(line.price, locale)}</span>
                    <span className="ml-1 text-xs text-muted-foreground">x{line.quantity}</span>
                </div>
                <div className="w-20 text-right font-bold tabular-nums">
                    <Price
                        value={timesMoney(line.price, line.quantity)}
                        className="text-sm"
                    />
                </div>
            </ItemActions>
        </Item>
    )
}

function GroupCard({
    group,
    selectedCouponId,
    onSelectCoupon,
}: {
    group: CheckoutGroup
    selectedCouponId: string | null
    onSelectCoupon: (userCouponId: string | null) => void
}) {
    const t = useT()
    return (
        <Panel>
            <PanelHeader>
                <div className="flex items-center gap-2 font-medium">
                    <span className="inline-flex size-5 items-center justify-center rounded bg-secondary text-xs font-bold text-secondary-foreground">
                        {t("checkout.summary.shopSuffix")}
                    </span>
                    {group.shopName}
                </div>
            </PanelHeader>
            <PanelContent>
                {group.lines.map((l) => (
                    <CheckoutLineRow
                        key={`${l.skuId}-${l.productId}`}
                        line={l}
                    />
                ))}
            </PanelContent>
            <CouponPicker
                group={group}
                selectedId={selectedCouponId}
                onSelect={onSelectCoupon}
            />
            <div className="flex items-center justify-end gap-6 border-t border-border/60 px-5 py-3 text-sm">
                <GroupAmountSentence
                    itemAmount={group.itemAmount}
                    shippingFee={group.shippingFee}
                    discountAmount={group.discountAmount}
                />
                <span className="text-muted-foreground">
                    {t("checkout.summary.payable")}{" "}
                    <Price
                        value={group.payAmount}
                        className="text-sm font-bold text-primary-subtle-foreground"
                    />
                </span>
            </div>
        </Panel>
    )
}

function UnavailableCard({ lines }: { lines: UnavailableLine[] }) {
    const t = useT()
    if (lines.length === 0) return
    return (
        <Item
            variant="muted"
            className="flex-col items-start"
        >
            <div className="flex items-center gap-2 font-medium text-destructive">
                <CircleAlert className="size-4" />
                {t("checkout.invalidItems")}
            </div>
            <ul className="text-muted-foreground">
                {lines.map((l) => (
                    <li key={l.skuId}>
                        {l.name} x{l.quantity}（{l.cause}）
                    </li>
                ))}
            </ul>
        </Item>
    )
}

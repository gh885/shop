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

// 结算行由 TanStack Router 以 JSON 编进 URL；脏值一律 catch 成空数组，走「无可结算条目」流程
const checkoutSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    lines: z
        .array(z.object({ skuId: z.string(), quantity: z.coerce.number().int().positive() }))
        .catch([]),
})

export const Route = createFileRoute("/_protected/checkout")({
    // 结算来源：一组 skuId + 件数，购物车勾选与立即购买在入口处归约成同一形状
    validateSearch: (search: Record<string, unknown>): CheckoutSource =>
        checkoutSearchSchema.parse(search),
    /**
     * 地址列表是页面主体（没有收货地址就没法提交）→ loader 读完再渲染；
     * 预览依赖地址与选券的**本地状态**，不能进 loader，仍由组件侧 query 读取（带 enabled + placeholderData）。
     * 挂起 → pendingComponent，失败 → 路由错误页 + 官方重置重试；SSR 阶段直接跳过。
     */
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

/** 挂起占位：与结算页同形（地址卡 + 商品分组 + 右栏金额） */
function CheckoutSkeleton() {
    return (
        <div className="mx-auto w-full max-w-page px-6 py-6">
            <Skeleton className="h-8 w-40" />
            <div className="mt-6 flex flex-col gap-6 lg:flex-row">
                <div className="flex-1 space-y-4">
                    <Skeleton className="h-24 w-full rounded-xl" />
                    <Skeleton className="h-40 w-full rounded-xl" />
                </div>
                <Skeleton className="h-40 w-full shrink-0 lg:w-80 rounded-xl" />
            </div>
        </div>
    )
}

function CheckoutPage() {
    const source = Route.useSearch()
    // 地址由 loader 读完（失败已由路由错误页接管）
    const addresses = useSuspenseQuery(addressListOptions).data

    // 页面本地态：地址 / 留言 / 每店选券
    const [addressId, setAddressId] = useState("")
    // 买家留言：整次结算一份，随下单透传给后端（按店拆单时逐单落 buyerMessage 快照，可空、最长 200 字）
    const [buyerMessage, setBuyerMessage] = useState("")
    // 每店选中的券：键存在 = 用户已表态（值可为 null = 明确不用券）。这一层只装「用户的决定」，
    // 没表态的店由 effect 补默认值——「未表态」与「选了不用」必须能分开，否则默认选券会覆盖用户。
    const [couponSelection, setCouponSelection] = useState<CouponSelection>({})
    // 默认选中：已勾选的，否则默认地址，兜底第一条——判据在 #/address，与下面地址卡片是同一个答案
    const effectiveAddressId = pickedAddressId(addresses, addressId)
    const preview = useQuery(
        checkoutPreviewOptions({
            source,
            addressId: effectiveAddressId || undefined,
            coupons: couponSelection,
        }),
    )

    // 默认选券：后端不会替你选（appliedCouponId 只是回显传过去的 id），首屏拿到候选后取「第一张可用券」。
    // 只补用户还没表态的店、清掉已不在本次结算里的店；改过的选择（含明确选「不使用」）原样保留。
    // 补上默认值会让预览 key 变化并重新预览一次，这是必要的：不重算就没有券后价。
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
                        onSelectCoupon={(shopId, userCouponId) =>
                            setCouponSelection((prev) => ({ ...prev, [shopId]: userCouponId }))
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

/** 预览三态里的「挂起」：两栏等高骨架 */
function CheckoutPreviewSkeleton() {
    return (
        <div className="space-y-5">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
        </div>
    )
}

/** 预览三态里的「失败」：预览本身不进路由错误页（页面主体是地址），就地给重试出口 */
function CheckoutPreviewError({ onRetry }: { onRetry: () => void }) {
    const t = useT()
    return (
        <div className="flex flex-col items-center gap-4 py-16 text-sm text-muted-foreground">
            <span>{t("web.checkout.loadFailed")}</span>
            <Button
                variant="outline"
                onClick={onRetry}
            >
                {t("web.checkout.retry")}
            </Button>
        </div>
    )
}

/** 结算页左右两栏（左栏明细 / 右栏金额卡）的入参：各自要的数据与回调（不含三态，那在调用点分完了） */
type CheckoutGridProps = {
    addresses: Address[]
    addressId: string
    onAddressChange: (id: string) => void
    preview: CheckoutPreview | undefined
    couponSelection: CouponSelection
    onSelectCoupon: (shopId: string, userCouponId: string | null) => void
    buyerMessage: string
    onBuyerMessageChange: (value: string) => void
    canSubmit: boolean
    pending: boolean
    onSubmit: () => void
}

/** 结算页两栏（左栏明细 / 右栏金额卡各自已是独立组件） */
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

/** 左栏：地址 + 商品分组 + 失效行 + 买家留言 */
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
    onSelectCoupon: (shopId: string, userCouponId: string | null) => void
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
            {preview?.groups.map((g) => (
                <GroupCard
                    key={g.shopId}
                    group={g}
                    // oxlint-disable-next-line no-null -- CouponSelection 契约：null = 明确选「不使用优惠券」
                    selectedCouponId={couponSelection[g.shopId] ?? null}
                    onSelectCoupon={(userCouponId) => onSelectCoupon(g.shopId, userCouponId)}
                />
            ))}
            {preview && <UnavailableCard lines={preview.unavailable} />}

            {/* 买家留言：整次结算一份（按店拆单时逐单落同一句），给卖家交代发货相关的小要求 */}
            <Card>
                <CardHeader>
                    <CardTitle>{t("web.checkout.buyerMessage.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Textarea
                        value={buyerMessage}
                        onChange={(e) => onBuyerMessageChange(e.target.value)}
                        maxLength={NOTE_MAX}
                        rows={2}
                        placeholder={t("web.checkout.buyerMessage.placeholder")}
                    />
                </CardContent>
            </Card>
        </div>
    )
}

/** 右栏结算卡：金额口径 = 商品总价 + 运费 − 优惠 = 应付总额 */
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
                <CardTitle>{t("web.checkout.summary.title")}</CardTitle>
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
                    {t("web.checkout.summary.submit")}
                </Button>
            </CardFooter>
        </Card>
    )
}

/** 金额口径：商品总价 + 运费 − 优惠 = 应付总额。小计由 checkoutTotals 按分组求和，
 * 顶层 totalPayAmount 是后端算好的净额（已减券），不能拿来当「商品总价」。 */
// fallow-ignore-next-line complexity -- 剩下的分支都是「有值才渲染」的渲染期判空，与同文件其它结算块同形
function CheckoutAmounts({ preview }: { preview: CheckoutPreview | undefined }) {
    const t = useT()
    const { itemAmount, shippingFee, discountAmount } = checkoutTotals(preview)

    return (
        <>
            <Row label={t("web.checkout.summary.goodsTotal")}>
                <Price
                    value={itemAmount}
                    className="text-sm"
                />
            </Row>
            <Row label={t("web.checkout.summary.shipping")}>
                <Price
                    value={shippingFee}
                    className="text-sm"
                />
            </Row>
            {isPositiveMoney(discountAmount) && (
                <Row label={t("web.checkout.summary.discount")}>
                    <DiscountPrice
                        value={discountAmount}
                        className="text-sm"
                    />
                </Row>
            )}
            <Separator />
            <div className="flex items-end justify-between">
                <span className="text-muted-foreground">
                    {t("web.checkout.summary.payableLabel")}
                </span>
                {preview ? (
                    <Price
                        value={preview.totalPayAmount}
                        className="text-2xl font-bold text-primary-subtle-foreground"
                    />
                ) : (
                    /* 预览没回来：没有应付可说，显式占位而不是摆一个 ¥0.00 像免单 */
                    <span className="text-2xl font-bold text-primary-subtle-foreground">—</span>
                )}
            </div>
        </>
    )
}

/** 提交订单：一次结算按店拆单可能多单，V1 统一跳第一单支付页（支付按单逐单处理） */
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
            notify.info({ key: "web.checkout.toast.pickAddress" })
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
                        notify.error({ key: "web.checkout.toast.createFailed" })
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
                    {t("web.checkout.backToCart")}
                </Button>
                <h1 className="text-xl font-semibold text-foreground">{t("web.checkout.title")}</h1>
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
                    {t("web.checkout.address.title")}
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

/** 还没有收货地址：去地址页新建（没地址就提交不了订单，这里直接给入口） */
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
                        <EmptyTitle>{t("web.checkout.address.empty.title")}</EmptyTitle>
                        <EmptyDescription>{t("web.checkout.address.empty.body")}</EmptyDescription>
                        <Button
                            variant="outline"
                            className="mt-2"
                            onClick={() => void navigate({ to: "/account/address" })}
                        >
                            {t("web.checkout.address.empty.cta")}
                        </Button>
                    </EmptyHeader>
                </Empty>
            </CardContent>
        </Card>
    )
}

/** 地址单选行：姓名电话 + 省市区详址 */
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

/** 结算行：主图 · 标题 · 单价×件数 · 行小计 */
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
                        {t("web.checkout.summary.shopSuffix")}
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
                    {t("web.checkout.summary.payable")}{" "}
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
                {t("web.checkout.invalidItems")}
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

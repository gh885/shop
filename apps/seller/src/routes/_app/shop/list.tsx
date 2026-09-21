import { useMyShops, useCurrentShop, shopKeys, shopInvitesOptions } from "#/shop"
import { SHOP_STATUS_VARIANT, SHOP_STATUS_TEXT } from "#/shop/constants"
import { setCurrentShopId } from "#/shop"
import { formatDate } from "@shop/app-kit"
import { ShopsApi, type ShopResponse } from "@shop/api/sdk"
import { useQuery, useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Store, MailPlus, CheckCircle2 } from "lucide-react"
import { useState } from "react"
import {
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
    ItemMedia,
    useAppForm,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    FieldShell,
    firstFieldError,
    ButtonGroup,
    Input,
    Spinner,
} from "@shop/ui-web"
import { z } from "zod"

/** 开店表单校验：店名长度与后端 @Size 对齐（就近放在表单旁） */
const CreateShopNameSchema = z.string().trim().min(1, "请输入店铺名称").max(50, "店名最长 50 字")

export const Route = createFileRoute("/_app/shop/list")({
    component: ShopsPage,
})

function ShopsPage() {
    const shops = useMyShops()
    const current = useCurrentShop()

    // 失败已由全局默认的 throwOnError 交给路由错误页（官方边界 + 重置重试）
    return (
        <div className="mx-auto w-full max-w-3xl space-y-8">
            <div>
                <h1 className="text-xl font-bold tracking-tight">店铺管理</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    管理我的店铺，选择一家正常营业的店铺作为当前经营店铺。
                </p>
            </div>

            <PendingInvites />

            <section className="space-y-3">
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
                            <EmptyTitle>还没有店铺</EmptyTitle>
                            <EmptyDescription>在下方创建第一家吧</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                )}
            </section>

            <CreateShopForm />
        </div>
    )
}

function ShopCard({ shop, isCurrent }: { shop: ShopResponse; isCurrent: boolean }) {
    return (
        <Item
            variant="outline"
            size="lg"
            className="justify-between"
        >
            <ItemContent>
                <ItemTitle className="flex items-center">
                    {shop.name}
                    <Badge variant={SHOP_STATUS_VARIANT[shop.status]}>
                        {SHOP_STATUS_TEXT[shop.status]}
                    </Badge>
                    {isCurrent ? <Badge variant="outline">当前经营</Badge> : undefined}
                </ItemTitle>
                <ItemDescription>创建于 {formatDate(shop.createdAt)}</ItemDescription>
            </ItemContent>
            {shop.status === "ACTIVE" && !isCurrent ? (
                <ItemActions>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentShopId(shop.id)}
                    >
                        设为当前店铺
                    </Button>
                </ItemActions>
            ) : undefined}
            {shop.status === "REJECTED" ? <RejectedRow shop={shop} /> : undefined}
        </Item>
    )
}

/** 被驳回的店铺行：亮出驳回理由 + 原地重提入口（改店名或沿用原名，重新进审核队列） */
function RejectedRow({ shop }: { shop: ShopResponse }) {
    const resubmit = useMutation({
        mutationFn: (name: string) =>
            ShopsApi.resubmitShopReview({
                path: { shopId: shop.id },
                body: { name },
            }),
        meta: {
            success: "已重新提交，等待平台审核",
            error: "重新提交审核失败",
            invalidates: [shopKeys.all],
        },
    })

    return (
        <ItemFooter className="flex-col items-start">
            <ItemDescription lines={3}>
                驳回理由：{shop.rejectReason || "审核员未填写，可直接重新提交或换个店名"}
            </ItemDescription>
            <ShopNameForm
                label="重新提交用的店铺名称"
                submitText="重新提交"
                defaultValue={shop.name}
                pending={resubmit.isPending}
                onSubmit={(name) => resubmit.mutate(name)}
            />
        </ItemFooter>
    )
}

/** 待确认邀请：别人邀请我加入的店铺 */
function PendingInvites() {
    const invites = useQuery(shopInvitesOptions)

    const accept = useMutation({
        mutationFn: (memberId: string) => ShopsApi.acceptShopInvite({ path: { memberId } }),
        meta: { success: "已加入店铺", error: "加入店铺失败", invalidates: [shopKeys.all] },
    })

    const decline = useMutation({
        mutationFn: (memberId: string) => ShopsApi.declineShopInvite({ path: { memberId } }),
        meta: { success: "已拒绝邀请", error: "拒绝邀请失败", invalidates: [shopKeys.all] },
    })

    if (!invites.data || invites.data.length === 0) return

    return (
        <section className="space-y-3">
            <h2 className="font-bold">待确认邀请</h2>
            <div className="space-y-2">
                {invites.data.map((invite) => (
                    <Item
                        key={invite.memberId}
                        variant="outline"
                        size="lg"
                        className="justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <ItemMedia variant="icon">
                                <MailPlus />
                            </ItemMedia>
                            <span className="text-sm">「{invite.shopName}」邀请你成为店铺成员</span>
                        </div>
                        <ItemActions>
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={decline.isPending}
                                onClick={() => decline.mutate(invite.memberId)}
                            >
                                拒绝
                            </Button>
                            <Button
                                size="sm"
                                disabled={accept.isPending}
                                onClick={() => accept.mutate(invite.memberId)}
                            >
                                同意加入
                            </Button>
                        </ItemActions>
                    </Item>
                ))}
            </div>
        </section>
    )
}

/** 开店表单：提交后落 PENDING_REVIEW，等平台审核 */
function CreateShopForm() {
    const [done, setDone] = useState(false)

    const create = useMutation({
        mutationFn: (value: string) => ShopsApi.createShop({ body: { name: value } }),
        meta: { error: "创建店铺失败", invalidates: [shopKeys.all] },
        onSuccess: () => setDone(true),
    })

    return (
        <Card size="sm">
            <CardHeader>
                <CardTitle>开新店</CardTitle>
                <CardDescription>
                    填写店铺名称即可提交，平台审核通过后即可开始经营。
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ShopNameForm
                    label="店铺名称"
                    submitText="提交申请"
                    defaultValue=""
                    pending={create.isPending}
                    onSubmit={(name) => {
                        setDone(false)
                        create.mutate(name)
                    }}
                />
                <div className="mt-2 min-h-5">
                    {done ? (
                        <p className="flex items-center gap-1 text-sm text-success">
                            <CheckCircle2 className="size-3.5" />
                            已提交，等待平台审核
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
    onSubmit: (name: string) => void
}) {
    const form = useAppForm({
        defaultValues: { name: defaultValue },
        onSubmit: ({ value }) => onSubmit(value.name),
    })

    return (
        <form
            className="w-full"
            onSubmit={(e) => {
                e.preventDefault()
                void form.handleSubmit()
            }}
        >
            <form.AppField
                name="name"
                validators={{ onChange: CreateShopNameSchema }}
            >
                {(field) => (
                    <FieldShell error={firstFieldError(field)}>
                        <ButtonGroup className="w-full">
                            <Input
                                aria-label={label}
                                placeholder="给你的店铺起个名字"
                                maxLength={50}
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
                    </FieldShell>
                )}
            </form.AppField>
        </form>
    )
}

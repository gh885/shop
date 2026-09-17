import { useMyShops, useCurrentShop, shopKeys } from "#/shop"
import { SHOP_STATUS_VARIANT, SHOP_STATUS_TEXT } from "#/shop/constants"
import { setCurrentShopId } from "#/shop"
import { formatDate, useWriteMutation } from "@shop/app-kit"
import { toApiError } from "@shop/common"
import { ShopsApi, type ShopResponse } from "@shop/api/sdk"
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Store, MailPlus, CheckCircle2 } from "lucide-react"
import { useState } from "react"
import { notify } from "@shop/app-kit"
import {
    StateError,
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
    Button,
    ItemMedia,
    useAppForm,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    Field,
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

    if (shops.isError) {
        return (
            <StateError
                message={toApiError(shops.error).detail}
                onRetry={shops.onRetry}
                retrying={shops.isFetching}
            />
        )
    }

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
        </Item>
    )
}

/** 待确认邀请：别人邀请我加入的店铺 */
function PendingInvites() {
    const invites = useQuery({
        queryKey: shopKeys.invites(),
        queryFn: () => ShopsApi.listShopInvites(),
    })

    const accept = useWriteMutation<string>({
        mutationFn: (memberId) => ShopsApi.acceptShopInvite({ path: { memberId } }),
        invalidateKeys: [shopKeys.all],
        messages: { success: "已加入店铺", error: "加入店铺失败" },
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

/** 开店表单：提交后落 PENDING_REVIEW，等平台和核 */
function CreateShopForm() {
    const queryClient = useQueryClient()
    const [done, setDone] = useState(false)

    const create = useMutation({
        mutationFn: (value: string) => ShopsApi.createShop({ body: { name: value } }),
        onSuccess: () => {
            setDone(true)
            void queryClient.invalidateQueries({ queryKey: shopKeys.all })
        },
        onError: (e) => notify.fromError(e, "创建店铺失败"),
    })

    const form = useAppForm({
        defaultValues: { name: "" },
        onSubmit: ({ value }) => {
            setDone(false)
            create.mutate(value.name)
        },
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
                <form
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
                            <Field error={firstFieldError(field)}>
                                <ButtonGroup className="w-full">
                                    <Input
                                        id="create-shop-name"
                                        aria-label="店铺名称"
                                        placeholder="给你的店铺起个名字"
                                        maxLength={50}
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.value)}
                                    />
                                    <Button
                                        type="submit"
                                        disabled={create.isPending}
                                    >
                                        {create.isPending && <Spinner />}提交申请
                                    </Button>
                                </ButtonGroup>
                            </Field>
                        )}
                    </form.AppField>
                </form>
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

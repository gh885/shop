import { useState } from "react"
import { z } from "zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
    Badge,
    Button,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Input,
    Skeleton,
    StateError,
} from "@shop/ui-web"
import { CheckCircle2, CircleAlert, MailPlus, Store } from "lucide-react"

import { toApiError } from "@shop/api"
import type { ShopResponse } from "@shop/api/sdk"

import { acceptInvite, createShop, myInvites } from "#/shared/lib/shop-data"
import { setCurrentShopId, useCurrentShop, useMyShops } from "#/shared/lib/shop"
import { SHOP_STATUS_TEXT, SHOP_STATUS_VARIANT } from "#/shared/lib/shop-constants"

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
                onRetry={() => void shops.refetch()}
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
                                className="h-20 w-full rounded-2xl"
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
                    <Empty className="rounded-2xl border-border py-14">
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
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-5">
            <div className="space-y-1">
                <div className="flex items-center gap-3">
                    <h3 className="font-semibold">{shop.name}</h3>
                    <Badge variant={SHOP_STATUS_VARIANT[shop.status]}>
                        {SHOP_STATUS_TEXT[shop.status]}
                    </Badge>
                    {isCurrent ? <Badge variant="outline">当前经营</Badge> : undefined}
                </div>
                <p className="text-sm text-muted-foreground">
                    创建于 {new Date(shop.createdAt).toLocaleDateString("zh-CN")}
                </p>
            </div>
            {shop.status === "ACTIVE" && !isCurrent ? (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentShopId(shop.id)}
                >
                    设为当前店铺
                </Button>
            ) : undefined}
        </div>
    )
}

/** 待确认邀请：别人邀请我加入的店铺 */
function PendingInvites() {
    const queryClient = useQueryClient()
    const invites = useQuery({
        queryKey: ["shops", "invites"],
        queryFn: () => myInvites(),
    })

    const accept = useMutation({
        mutationFn: (memberId: string) => acceptInvite(memberId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["shops"] })
        },
    })

    if (!invites.data || invites.data.length === 0) return

    return (
        <section className="space-y-3">
            <h2 className="font-semibold">待确认邀请</h2>
            <ul className="space-y-2">
                {invites.data.map((invite) => (
                    <li
                        key={invite.memberId}
                        className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
                    >
                        <div className="flex items-center gap-3">
                            <MailPlus className="size-5 text-muted-foreground" />
                            <span className="text-sm">
                                「{invite.shopName ?? "未知店铺"}」邀请你成为店铺成员
                            </span>
                        </div>
                        <Button
                            size="sm"
                            disabled={accept.isPending}
                            onClick={() => accept.mutate(invite.memberId)}
                            className="bg-primary text-primary-foreground hover:bg-primary-hover"
                        >
                            同意加入
                        </Button>
                    </li>
                ))}
            </ul>
        </section>
    )
}

/** 开店表单：提交后落 PENDING_REVIEW，等平台和核 */
function CreateShopForm() {
    const queryClient = useQueryClient()
    const [name, setName] = useState("")
    const [error, setError] = useState<string | undefined>()
    const [done, setDone] = useState(false)

    const create = useMutation({
        mutationFn: (value: string) => createShop({ name: value }),
        onSuccess: () => {
            setName("")
            setError(undefined)
            setDone(true)
            void queryClient.invalidateQueries({ queryKey: ["shops"] })
        },
        onError: (e) => {
            const err = toApiError(e)
            setError(err.detail)
        },
    })

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(undefined)
        setDone(false)
        const result = CreateShopNameSchema.safeParse(name)
        if (!result.success) {
            setError(result.error.issues[0]?.message ?? "请输入店铺名称")
            return
        }
        create.mutate(result.data)
    }

    return (
        <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold">开新店</h2>
            <p className="mt-1 text-sm text-muted-foreground">
                填写店铺名称即可提交，平台审核通过后即可开始经营。
            </p>
            <form
                className="mt-4 flex items-start gap-2"
                onSubmit={handleSubmit}
            >
                <div className="flex-1 space-y-1.5">
                    <Input
                        placeholder="给你的店铺起个名字"
                        maxLength={50}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    {error ? (
                        <p className="flex items-center gap-1 text-sm text-destructive">
                            <CircleAlert className="size-3.5" />
                            {error}
                        </p>
                    ) : undefined}
                    {done ? (
                        <p className="flex items-center gap-1 text-sm text-success">
                            <CheckCircle2 className="size-3.5" />
                            已提交，等待平台审核
                        </p>
                    ) : undefined}
                </div>
                <Button
                    type="submit"
                    disabled={create.isPending || !name.trim()}
                    className="bg-primary text-primary-foreground hover:bg-primary-hover"
                >
                    {create.isPending ? "提交中…" : "提交申请"}
                </Button>
            </form>
        </section>
    )
}

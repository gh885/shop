import { Store, Trash2, UserPlus } from "lucide-react"

import { useShop, shopKeys, shopMembersOptions } from "#/shop"
import { InviteFormSchema, isShopOwner } from "#/shop/member"
import { useMe } from "#/shared/lib/me"
import { ShopsApi } from "@shop/api/sdk"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
    Empty,
    EmptyHeader,
    Badge,
    EmptyMedia,
    EmptyTitle,
    EmptyDescription,
    useAppForm,
    Skeleton,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Button,
    Field,
    FieldError,
    ButtonGroup,
    Input,
    MaskedValueCell,
    confirm,
} from "@shop/ui-web"

import { PHONE_DIGITS } from "@shop/app-kit"

export const Route = createFileRoute("/_app/shop/member")({
    component: MembersPage,
})

/** 店员管理：基于当前经营店铺（顶栏可切换） */
function MembersPage() {
    const shop = useShop()

    return (
        <div className="mx-auto w-full max-w-3xl space-y-6">
            <div>
                <h1 className="text-xl font-bold">店员管理</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    「{shop.name}」的成员，店主可邀请或移除店员。
                </p>
            </div>
            <MemberPanel shopId={shop.id} />
        </div>
    )
}

function MemberPanel({ shopId }: { shopId: string }) {
    const me = useMe()
    const queryClient = useQueryClient()

    // 成员列表走域内 queryOptions（key 与失效规则同源，路由不直接拼 key）
    const members = useQuery(shopMembersOptions(shopId))

    // 「是不是店主」是决定这一页画不画破坏性动作的判定，规则在 #/shop/member（那里有单测）
    const isOwner = isShopOwner(members.data, me.data?.id)

    const invite = useMutation({
        mutationFn: (phone: string) =>
            ShopsApi.inviteShopMember({ path: { shopId }, body: { phone } }),
        meta: {
            success: "邀请已发送",
            error: "邀请发送失败",
            invalidates: [shopKeys.members(shopId)],
        },
    })

    const inviteForm = useAppForm({
        defaultValues: { phone: "" },
        validators: { onSubmit: InviteFormSchema },
        onSubmit: ({ value }) => invite.mutate(value.phone),
    })

    const remove = useMutation({
        mutationFn: (memberId: string) => ShopsApi.removeShopMember({ path: { shopId, memberId } }),
        meta: {
            success: "已移除该成员",
            error: "移除成员失败",
            invalidates: [shopKeys.members(shopId)],
        },
    })

    /** 移除二次确认：确认即移出，失败保持打开（错误提示走全局 mutation 反馈） */
    function confirmRemove(memberId: string) {
        void confirm({
            title: "移除成员",
            description: "确定将该成员移出店铺吗？移除后对方将无法访问本店铺。",
            confirmText: "移除",
            action: () => remove.mutateAsync(memberId),
        })
    }

    // 别人的号码后端只给掩码，明文逐条索取且在后端留痕（ACC-79）。取到写回列表缓存这一行、故意不失效
    // 列表：失效会立刻把刚拿到的明文冲掉，下次重新拉取自然又回掩码，明文不长期驻留
    const revealPhone = useMutation({
        mutationFn: (memberId: string) =>
            ShopsApi.revealMemberPhone({ path: { shopId, memberId } }),
        meta: { error: "查看成员电话失败" },
        onSuccess: (res, memberId) =>
            queryClient.setQueryData<NonNullable<typeof members.data>>(
                shopKeys.members(shopId),
                (prev) =>
                    prev?.map((m) => (m.memberId === memberId ? { ...m, phone: res.phone } : m)),
            ),
    })

    // 失败已由全局默认的 throwOnError 交给路由错误页
    if (members.isPending) {
        return (
            <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                    <Skeleton
                        key={i}
                        className="h-12 w-full rounded-xl"
                    />
                ))}
            </div>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>成员列表</CardTitle>
            </CardHeader>
            <CardContent>
                {!members.data || members.data.length === 0 ? (
                    <Empty className="mt-3 py-10">
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <Store />
                            </EmptyMedia>
                            <EmptyTitle>暂无成员</EmptyTitle>
                            <EmptyDescription>
                                邀请对方加入店铺后，成员会出现在这里
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    <ul className="mt-3 divide-y divide-border">
                        {members.data.map((m) => (
                            <li
                                key={m.memberId}
                                className="flex items-center justify-between py-3 text-sm"
                            >
                                {/* 本人那行给的是明文，入口自然不出现；号码缺席时退回显示 userId，值恒有 */}
                                <MaskedValueCell
                                    value={m.phone ?? m.userId}
                                    revealing={
                                        revealPhone.isPending &&
                                        revealPhone.variables === m.memberId
                                    }
                                    onReveal={() => revealPhone.mutate(m.memberId)}
                                />
                                <span className="flex items-center gap-2">
                                    <Badge variant={m.role === "OWNER" ? "default" : "secondary"}>
                                        {m.role === "OWNER" ? "店主" : "店员"}
                                    </Badge>
                                    {m.status === "PENDING" ? (
                                        <Badge variant="outline">待确认</Badge>
                                    ) : undefined}
                                    {isOwner && m.role !== "OWNER" ? (
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            disabled={remove.isPending}
                                            onClick={() => confirmRemove(m.memberId)}
                                            aria-label="移除成员"
                                        >
                                            <Trash2 className="size-4 text-muted-foreground" />
                                        </Button>
                                    ) : undefined}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}

                {isOwner ? (
                    <form
                        className="mt-5"
                        onSubmit={(e) => {
                            e.preventDefault()
                            void inviteForm.handleSubmit()
                        }}
                    >
                        <inviteForm.AppField name="phone">
                            {(field) => (
                                <Field>
                                    <ButtonGroup>
                                        <Input
                                            aria-label="被邀请人手机号"
                                            aria-invalid={!field.state.meta.isValid}
                                            placeholder="输入对方手机号，邀请加入店铺"
                                            inputMode="tel"
                                            maxLength={PHONE_DIGITS}
                                            value={field.state.value}
                                            onBlur={field.handleBlur}
                                            onChange={(e) =>
                                                field.handleChange(
                                                    e.target.value.replaceAll(/\D/g, ""),
                                                )
                                            }
                                        />
                                        <inviteForm.Subscribe selector={(s) => s.values.phone}>
                                            {(phone) => (
                                                <Button
                                                    type="submit"
                                                    variant="outline"
                                                    disabled={
                                                        invite.isPending || phone.length !== 11
                                                    }
                                                >
                                                    <UserPlus className="size-4" />
                                                    邀请
                                                </Button>
                                            )}
                                        </inviteForm.Subscribe>
                                    </ButtonGroup>
                                    <FieldError errors={field.state.meta.errors} />
                                </Field>
                            )}
                        </inviteForm.AppField>
                    </form>
                ) : (
                    <p className="mt-5 text-sm text-muted-foreground">
                        只有店主可以邀请或移除成员。
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

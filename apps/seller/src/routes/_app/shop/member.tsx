import { message } from "#/locales/message"
import { useT } from "#/locales/use-t"
import type { MemberRole } from "@shop/api/sdk"
import { Store, Trash2, UserPlus } from "lucide-react"
import { z } from "zod"

import { useShop, shopKeys, shopMembersOptions } from "#/shop"
import { isShopOwner } from "#/shop/member"
import { useMe } from "#/shared/lib/me"
import { ShopsApi } from "@shop/api/sdk"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
    applyServerFieldErrors,
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

import { PHONE_DIGITS, PhoneSchema } from "@shop/app-kit/auth"
import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
export const Route = createFileRoute("/_app/shop/member")({
    component: MembersPage,
})

/** 店员管理：基于当前经营店铺（顶栏可切换） */
function MembersPage() {
    const shop = useShop()
    const t = useT("shop")

    return (
        <div className="mx-auto w-full max-w-3xl space-y-6">
            <div>
                <h1 className="text-xl font-bold">{t("shop.member.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t("shop.member.subtitle", { name: shop.name })}
                </p>
            </div>
            <MemberPanel shopId={shop.id} />
        </div>
    )
}

/** 成员角色徽章：码值 → catalog key 单一来源（写错键即编译错，§6 枚举查表） */
const MEMBER_ROLE_LABEL: Record<MemberRole, "shop.member.role.OWNER" | "shop.member.role.MEMBER"> =
    {
        OWNER: "shop.member.role.OWNER",
        MEMBER: "shop.member.role.MEMBER",
    }

/**
 * 邀请手机号校验：形状 owner 是登录那侧的 `PhoneSchema`（app-kit），不在这里再写一份正则——
 * 曾经写过 `^1\d{10}$`（比登录的 `^1[3-9]\d{9}$` 宽），后果不是报错而是「邀请进去的手机号登录不了」。
 * 它只服务本页这一个表单，所以按「Schema 归属」跟着表单住在这里，不进 `#/shop/member`。
 */
const InviteFormSchema = z.object({ phone: PhoneSchema })

function MemberPanel({ shopId }: { shopId: string }) {
    const me = useMe()
    const queryClient = useQueryClient()
    const t = useT("shop")

    // 成员列表走域内 queryOptions（key 与失效规则同源，路由不直接拼 key）
    const members = useQuery(shopMembersOptions(shopId))

    // 「是不是店主」是决定这一页画不画破坏性动作的判定，规则在 #/shop/member（那里有单测）
    const isOwner = isShopOwner(members.data, me.data?.id)

    const invite = useMutation({
        mutationFn: (phone: string) =>
            ShopsApi.inviteShopMember({ path: { shopId }, body: { phone } }),
        meta: {
            success: message("shop.member.invite.sent"),
            error: message("shop.member.invite.failed"),
            invalidates: [shopKeys.members(shopId)],
        },
    })

    const inviteForm = useAppForm({
        defaultValues: { phone: "" },
        validators: { onSubmit: InviteFormSchema },
        onSubmit: async ({ value }) => {
            // DTO InviteMemberRequest 的 permissions 本表单没有对应输入框，不进 map；phone 同名有框（@NotBlank + @Pattern）。
            try {
                await invite.mutateAsync(value.phone)
            } catch (error) {
                applyServerFieldErrors(
                    inviteForm,
                    serverFieldErrors(error, {
                        phone: "phone",
                    }),
                )
                throw error
            }
        },
    })

    const remove = useMutation({
        mutationFn: (memberId: string) => ShopsApi.removeShopMember({ path: { shopId, memberId } }),
        meta: {
            success: message("shop.member.remove.done"),
            error: message("shop.member.remove.failed"),
            invalidates: [shopKeys.members(shopId)],
        },
    })

    /** 移除二次确认：确认即移出，失败保持打开（错误提示走全局 mutation 反馈） */
    function confirmRemove(memberId: string) {
        void confirm({
            title: t("shop.member.action.remove"),
            description: t("shop.member.remove.confirm.desc"),
            confirmText: t("shop.member.action.removeConfirm"),
            action: () => remove.mutateAsync(memberId),
        })
    }

    // 别人的号码后端只给掩码，明文逐条索取且在后端留痕（ACC-79）。取到写回列表缓存这一行、故意不失效
    // 列表：失效会立刻把刚拿到的明文冲掉，下次重新拉取自然又回掩码，明文不长期驻留
    const revealPhone = useMutation({
        mutationFn: (memberId: string) =>
            ShopsApi.revealMemberPhone({ path: { shopId, memberId } }),
        meta: { error: message("shop.member.phone.failed") },
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
                <CardTitle>{t("shop.member.list.title")}</CardTitle>
            </CardHeader>
            <CardContent>
                {!members.data || members.data.length === 0 ? (
                    <Empty className="mt-3 py-10">
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <Store />
                            </EmptyMedia>
                            <EmptyTitle>{t("shop.member.empty.title")}</EmptyTitle>
                            <EmptyDescription>{t("shop.member.empty.body")}</EmptyDescription>
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
                                        {t(MEMBER_ROLE_LABEL[m.role])}
                                    </Badge>
                                    {m.status === "PENDING" ? (
                                        <Badge variant="outline">
                                            {t("shop.member.status.PENDING")}
                                        </Badge>
                                    ) : undefined}
                                    {isOwner && m.role !== "OWNER" ? (
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            disabled={remove.isPending}
                                            onClick={() => confirmRemove(m.memberId)}
                                            aria-label={t("shop.member.action.remove")}
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
                            void submitForm(inviteForm)
                        }}
                    >
                        <inviteForm.AppField name="phone">
                            {(field) => (
                                <Field>
                                    <ButtonGroup>
                                        <Input
                                            aria-label={t("shop.member.invite.phone.aria")}
                                            aria-invalid={!field.state.meta.isValid}
                                            placeholder={t("shop.member.invite.phone.placeholder")}
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
                                                    {t("shop.member.invite.submit")}
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
                        {t("shop.member.notOwner")}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

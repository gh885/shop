import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Badge, Button, Input, Skeleton } from '@shop/ui-web';
import { CircleAlert, Store, Trash2, UserPlus } from 'lucide-react';

import { InviteMemberRequestSchema } from '@shop/api';

import { shopApi, toApiError } from '#/lib/api';
import { useMe } from '#/lib/me';
import { useCurrentShop } from '#/lib/shop';

export const Route = createFileRoute('/_app/members')({
    component: MembersPage,
});

/** 店员管理：基于当前经营店铺（顶栏可切换） */
function MembersPage() {
    const shop = useCurrentShop();

    if (!shop) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <Store className="size-10 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                    还没有正常营业的店铺，先到「店铺管理」创建或等待审核
                </p>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-3xl space-y-6">
            <div>
                <h1 className="text-xl font-bold tracking-tight">店员管理</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    「{shop.name}」的成员，店主可邀请或移除店员。
                </p>
            </div>
            <MemberPanel shopId={shop.id} />
        </div>
    );
}

function MemberPanel({ shopId }: { shopId: string }) {
    const queryClient = useQueryClient();
    const me = useMe();
    const [phone, setPhone] = useState('');
    const [error, setError] = useState<string | null>(null);

    const members = useQuery({
        queryKey: ['shops', shopId, 'members'],
        queryFn: () => shopApi.members(shopId),
    });

    const isOwner = members.data?.some(
        (m) => m.role === 'OWNER' && m.status === 'ACTIVE' && m.phone === me.data?.phone,
    );

    const invite = useMutation({
        mutationFn: (value: string) => shopApi.invite(shopId, { phone: value }),
        onSuccess: () => {
            setPhone('');
            setError(null);
            void queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'members'] });
        },
        onError: async (e) => {
            const err = await toApiError(e);
            setError(err.detail);
        },
    });

    const remove = useMutation({
        mutationFn: (memberId: string) => shopApi.removeMember(shopId, memberId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'members'] });
        },
    });

    if (members.isLoading) {
        return (
            <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                    <Skeleton
                        key={i}
                        className="h-12 w-full rounded-xl"
                    />
                ))}
            </div>
        );
    }

    return (
        <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold">成员列表</h2>

            <ul className="mt-3 divide-y divide-border">
                {members.data?.map((m) => (
                    <li
                        key={m.memberId}
                        className="flex items-center justify-between py-3 text-sm"
                    >
                        <span className="tabular-nums">{m.phone ?? m.userId}</span>
                        <span className="flex items-center gap-2">
                            <Badge variant={m.role === 'OWNER' ? 'default' : 'secondary'}>
                                {m.role === 'OWNER' ? '店主' : '店员'}
                            </Badge>
                            {m.status === 'PENDING' ? (
                                <Badge variant="outline">待确认</Badge>
                            ) : null}
                            {isOwner && m.role !== 'OWNER' ? (
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    disabled={remove.isPending}
                                    onClick={() => remove.mutate(m.memberId)}
                                    aria-label="移除成员"
                                >
                                    <Trash2 className="size-4 text-muted-foreground" />
                                </Button>
                            ) : null}
                        </span>
                    </li>
                ))}
            </ul>

            {isOwner ? (
                <form
                    className="mt-5 flex items-start gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        setError(null);
                        const result = InviteMemberRequestSchema.shape.phone.safeParse(phone);
                        if (!result.success) {
                            setError(result.error.issues[0]?.message ?? '请输入正确的手机号');
                            return;
                        }
                        invite.mutate(result.data);
                    }}
                >
                    <div className="flex-1 space-y-1.5">
                        <Input
                            placeholder="输入对方手机号，邀请加入店铺"
                            inputMode="tel"
                            maxLength={11}
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replaceAll(/\D/g, ''))}
                        />
                        {error ? (
                            <p className="flex items-center gap-1 text-sm text-destructive">
                                <CircleAlert className="size-3.5" />
                                {error}
                            </p>
                        ) : null}
                    </div>
                    <Button
                        type="submit"
                        variant="outline"
                        disabled={invite.isPending || phone.length !== 11}
                    >
                        <UserPlus className="size-4" />
                        邀请
                    </Button>
                </form>
            ) : (
                <p className="mt-5 text-sm text-muted-foreground">只有店主可以邀请或移除成员。</p>
            )}
        </section>
    );
}

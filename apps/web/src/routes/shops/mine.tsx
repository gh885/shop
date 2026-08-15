import { useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, MailPlus, Store, Trash2, UserPlus } from 'lucide-react';

import { Badge, Button, Input, buttonVariants } from '@shop/ui-web';
import type { Shop, ShopStatus } from '@shop/api';

import { requireAuth, shopApi, toApiError, useAuthGuard } from '../../lib/api';
import { useAuthStatus } from '../../lib/auth';
import { useMe } from '../../lib/me';

export const Route = createFileRoute('/shops/mine')({
    beforeLoad: () => requireAuth(),
    component: MyShops,
    head: () => ({
        meta: [{ title: '我的店铺 - Shop' }],
    }),
});

const STATUS_TEXT: Record<ShopStatus, string> = {
    PENDING_REVIEW: '审核中',
    ACTIVE: '正常营业',
    REJECTED: '审核未通过',
    DISABLED: '已封禁',
};

const STATUS_VARIANT: Record<ShopStatus, 'secondary' | 'default' | 'destructive' | 'outline'> = {
    PENDING_REVIEW: 'secondary',
    ACTIVE: 'default',
    REJECTED: 'destructive',
    DISABLED: 'outline',
};

function MyShops() {
    useAuthGuard();
    const authed = useAuthStatus() === 'authed';
    const queryClient = useQueryClient();
    const shops = useQuery({
        queryKey: ['shops', 'mine'],
        queryFn: () => shopApi.myShops(),
        enabled: authed,
    });
    const invites = useQuery({
        queryKey: ['shops', 'invites'],
        queryFn: () => shopApi.myInvites(),
        enabled: authed,
    });

    const accept = useMutation({
        mutationFn: (memberId: string) => shopApi.acceptInvite(memberId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['shops'] });
        },
    });

    return (
        <div className="mx-auto max-w-3xl space-y-10 px-4 py-12">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">我的店铺</h1>
                <Link
                    to="/shops/new"
                    className={buttonVariants()}
                >
                    开新店
                </Link>
            </div>

            {/* 待确认邀请 */}
            {invites.data && invites.data.length > 0 ? (
                <section className="space-y-3">
                    <h2 className="text-lg font-semibold">待确认邀请</h2>
                    <ul className="space-y-2">
                        {invites.data.map((invite) => (
                            <li
                                key={invite.memberId}
                                className="flex items-center justify-between rounded-xl border border-border p-4"
                            >
                                <div className="flex items-center gap-3">
                                    <MailPlus className="size-5 text-brand" />
                                    <span>
                                        「{invite.shopName ?? '未知店铺'}」邀请你成为店铺成员
                                    </span>
                                </div>
                                <Button
                                    size="sm"
                                    disabled={accept.isPending}
                                    onClick={() => accept.mutate(invite.memberId)}
                                    className="bg-brand text-brand-foreground hover:bg-brand-hover"
                                >
                                    同意加入
                                </Button>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* 店铺列表 */}
            <section className="space-y-4">
                {shops.isLoading ? (
                    <p className="text-muted-foreground">加载中…</p>
                ) : shops.data && shops.data.length > 0 ? (
                    shops.data.map((shop) => (
                        <ShopCard
                            key={shop.id}
                            shop={shop}
                        />
                    ))
                ) : (
                    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
                        <Store className="size-10 text-muted-foreground/50" />
                        <p className="text-muted-foreground">还没有店铺，免费开一家吧</p>
                        <Link
                            to="/shops/new"
                            className={buttonVariants({
                                className: 'bg-brand text-brand-foreground hover:bg-brand-hover',
                            })}
                        >
                            免费开店
                        </Link>
                    </div>
                )}
            </section>
        </div>
    );
}

function ShopCard({ shop }: { shop: Shop }) {
    return (
        <div className="space-y-0 rounded-2xl border border-border">
            <div className="flex items-center justify-between p-5">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold">{shop.name}</h3>
                        <Badge variant={STATUS_VARIANT[shop.status]}>
                            {STATUS_TEXT[shop.status]}
                        </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        创建于 {new Date(shop.createdAt).toLocaleDateString('zh-CN')}
                    </p>
                </div>
            </div>

            {shop.status === 'ACTIVE' ? <MemberPanel shopId={shop.id} /> : null}
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
        enabled: useAuthStatus() === 'authed',
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

    return (
        <div className="border-t border-border p-5">
            <h4 className="text-sm font-semibold">店铺成员</h4>

            <ul className="mt-3 divide-y divide-border">
                {members.data?.map((m) => (
                    <li
                        key={m.memberId}
                        className="flex items-center justify-between py-2.5 text-sm"
                    >
                        <span className="tabular-nums">{m.phone ?? m.userId}</span>
                        <span className="flex items-center gap-2">
                            <Badge variant={m.role === 'OWNER' ? 'default' : 'secondary'}>
                                {m.role === 'OWNER' ? '店主' : '成员'}
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
                    className="mt-4 flex items-start gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        setError(null);
                        invite.mutate(phone.trim());
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
            ) : null}
        </div>
    );
}

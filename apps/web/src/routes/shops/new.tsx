import { useState } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, CircleAlert, Store } from 'lucide-react';

import { Button, Input, useAppForm } from '@shop/ui-web';
import { CreateShopRequestSchema } from '@shop/api';

import { requireAuth, shopApi, toApiError, useAuthGuard } from '../../lib/api';

export const Route = createFileRoute('/shops/new')({
    beforeLoad: () => requireAuth(),
    component: NewShop,
    head: () => ({
        meta: [{ title: '免费开店 - Shop' }],
    }),
});

function NewShop() {
    useAuthGuard();
    const navigate = useNavigate();
    const [serverError, setServerError] = useState<string | null>(null);

    const form = useAppForm({
        defaultValues: { name: '' },
        validators: { onSubmit: CreateShopRequestSchema },
        onSubmit: async ({ value }) => {
            setServerError(null);
            try {
                await shopApi.createShop({ name: value.name });
                await navigate({ to: '/shops/mine' });
            } catch (error) {
                const err = await toApiError(error);
                setServerError(err.detail);
            }
        },
    });

    return (
        <div className="mx-auto max-w-xl px-4 py-16">
            <Link
                to="/sell"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
                <ArrowLeft className="size-4" />
                返回
            </Link>

            <div className="mt-8 space-y-2">
                <Store className="size-8 text-brand" />
                <h1 className="text-2xl font-bold tracking-tight">免费开店</h1>
                <p className="text-muted-foreground">
                    填写店铺名称即可提交，平台审核通过后即可开始经营。
                </p>
            </div>

            <form
                className="mt-8 space-y-5"
                onSubmit={(e) => {
                    e.preventDefault();
                    form.handleSubmit();
                }}
            >
                <form.AppField
                    name="name"
                    validators={{ onChange: CreateShopRequestSchema.shape.name }}
                >
                    {(field) => (
                        <div className="space-y-2">
                            <label
                                htmlFor="shop-name"
                                className="text-sm font-medium"
                            >
                                店铺名称
                            </label>
                            <Input
                                id="shop-name"
                                placeholder="给你的店铺起个名字"
                                maxLength={50}
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => field.handleChange(e.target.value)}
                            />
                            {field.state.meta.errors.length > 0 ? (
                                <p className="text-sm text-destructive">
                                    {field.state.meta.errors[0]?.message}
                                </p>
                            ) : null}
                        </div>
                    )}
                </form.AppField>

                {serverError ? (
                    <p className="flex items-center gap-1.5 text-sm text-destructive">
                        <CircleAlert className="size-4" />
                        {serverError}
                    </p>
                ) : null}

                <form.Subscribe selector={(s) => s.isSubmitting}>
                    {(isSubmitting) => (
                        <Button
                            type="submit"
                            size="lg"
                            disabled={isSubmitting}
                            className="w-full bg-brand text-brand-foreground hover:bg-brand-hover active:translate-y-px"
                        >
                            {isSubmitting ? '提交中…' : '提交开店申请'}
                        </Button>
                    )}
                </form.Subscribe>
            </form>
        </div>
    );
}

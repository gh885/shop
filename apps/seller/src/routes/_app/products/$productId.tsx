import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Badge, Button, Skeleton } from '@shop/ui-web';
import { ArrowLeft, CircleAlert } from 'lucide-react';

import type { ProductStatus } from '@shop/api';

import { BasicForm, type BasicFormValues } from '#/components/basic-form';
import { SkusTable } from '#/components/skus-table';
import { SpecsEditor } from '#/components/specs-editor';
import { productApi, toApiError } from '#/lib/api';
import { useCurrentShop } from '#/lib/shop';

export const Route = createFileRoute('/_app/products/$productId')({
    component: ProductEditPage,
});

const STATUS_TEXT: Record<ProductStatus, string> = {
    1: '上架中',
    0: '已下架',
    2: '草稿',
};

const STATUS_VARIANT: Record<ProductStatus, 'default' | 'outline' | 'secondary'> = {
    1: 'default',
    0: 'outline',
    2: 'secondary',
};

/** 商品编辑：基本信息 / 规格模板 / SKU 价格库存 三段，顶部按状态给出发布/上下架动作 */
function ProductEditPage() {
    const { productId } = Route.useParams();
    const shop = useCurrentShop();
    const queryClient = useQueryClient();
    const [serverError, setServerError] = useState<string | null>(null);

    const detail = useQuery({
        queryKey: ['products', shop?.id, productId],
        queryFn: () => productApi.detail(shop!.id, productId),
        enabled: !!shop,
    });

    /** 成功后刷新详情缓存；详情数据驱动规格/SKU 两个编辑器 */
    const refresh = () =>
        queryClient.invalidateQueries({ queryKey: ['products', shop?.id, productId] });

    const onError = async (e: unknown) => setServerError((await toApiError(e)).detail);

    const updateBasic = useMutation({
        mutationFn: (values: BasicFormValues) =>
            productApi.updateBasic(shop!.id, productId, {
                categoryId: values.categoryId,
                name: values.name,
                subtitle: values.subtitle || undefined,
                description: values.description || undefined,
                mainImage: values.mainImage || undefined,
                images: splitLines(values.imagesText),
                params: values.params.filter((p) => p.name.trim() && p.value.trim()),
            }),
        onSuccess: () => {
            setServerError(null);
            void refresh();
        },
        onError,
    });

    const updateSpecs = useMutation({
        mutationFn: (specs: Parameters<typeof productApi.updateSpecs>[2]) =>
            productApi.updateSpecs(shop!.id, productId, specs),
        onSuccess: () => {
            setServerError(null);
            void refresh();
        },
        onError,
    });

    const updateSkus = useMutation({
        mutationFn: (items: Parameters<typeof productApi.updateSkus>[2]) =>
            productApi.updateSkus(shop!.id, productId, items),
        onSuccess: () => {
            setServerError(null);
            void refresh();
        },
        onError,
    });

    const publish = useMutation({
        mutationFn: () => productApi.publish(shop!.id, productId),
        onSuccess: () => {
            setServerError(null);
            void refresh();
        },
        onError,
    });

    const off = useMutation({
        mutationFn: () => productApi.off(shop!.id, productId),
        onSuccess: () => {
            setServerError(null);
            void refresh();
        },
        onError,
    });

    const on = useMutation({
        mutationFn: () => productApi.on(shop!.id, productId),
        onSuccess: () => {
            setServerError(null);
            void refresh();
        },
        onError,
    });

    if (detail.isLoading || !shop) {
        return (
            <div className="mx-auto w-full max-w-4xl space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-64 w-full rounded-2xl" />
                <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
        );
    }

    if (detail.isError || !detail.data) {
        return (
            <div className="mx-auto w-full max-w-2xl space-y-4 py-16 text-center">
                <p className="text-muted-foreground">商品不存在或无权访问</p>
                <Link
                    to="/products"
                    search={{ page: 1, size: 10 }}
                    className="text-sm text-brand"
                >
                    返回商品列表
                </Link>
            </div>
        );
    }

    const { product, skus } = detail.data;

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link
                        to="/products"
                        search={{ page: 1, size: 10 }}
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        返回
                    </Link>
                    <h1 className="text-xl font-bold tracking-tight">{product.name}</h1>
                    <Badge variant={STATUS_VARIANT[product.status]}>
                        {STATUS_TEXT[product.status]}
                    </Badge>
                </div>

                <div className="flex items-center gap-2">
                    {product.status === 2 ? (
                        <Button
                            disabled={publish.isPending}
                            onClick={() => publish.mutate()}
                            className="bg-brand text-brand-foreground hover:bg-brand-hover"
                        >
                            发布上架
                        </Button>
                    ) : product.status === 1 ? (
                        <Button
                            variant="outline"
                            disabled={off.isPending}
                            onClick={() => off.mutate()}
                        >
                            下架
                        </Button>
                    ) : (
                        <Button
                            disabled={on.isPending}
                            onClick={() => on.mutate()}
                            className="bg-brand text-brand-foreground hover:bg-brand-hover"
                        >
                            重新上架
                        </Button>
                    )}
                </div>
            </div>

            {serverError ? (
                <p className="flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive-subtle p-3 text-sm text-destructive-subtle-foreground">
                    <CircleAlert className="size-4 shrink-0" />
                    {serverError}
                </p>
            ) : null}

            <section className="rounded-2xl border border-border bg-card p-6">
                <h2 className="mb-5 font-semibold">基本信息</h2>
                {/* key 驱动重挂载：保存成功后表单回填最新值 */}
                <BasicForm
                    key={product.updatedAt}
                    initial={product}
                    submitting={updateBasic.isPending}
                    submitText="保存基本信息"
                    onSubmit={(values) => updateBasic.mutate(values)}
                />
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
                <h2 className="mb-5 font-semibold">销售规格</h2>
                <SpecsEditor
                    key={product.updatedAt}
                    specs={product.specs}
                    submitting={updateSpecs.isPending}
                    onSave={(specs) => updateSpecs.mutate(specs)}
                />
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
                <h2 className="mb-5 font-semibold">SKU 价格与库存</h2>
                <SkusTable
                    skus={skus}
                    submitting={updateSkus.isPending}
                    onSave={(items) => updateSkus.mutate(items)}
                />
            </section>
        </div>
    );
}

function splitLines(text: string): string[] | undefined {
    const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    return lines.length > 0 ? lines : undefined;
}

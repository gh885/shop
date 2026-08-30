import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, CircleAlert, Store } from "lucide-react"

import { BasicForm, type BasicFormValues } from "#/components/basic-form"
import { toApiError } from "@shop/api"

import { productApi } from "#/shared/lib/api"
import { useCurrentShop } from "#/shared/lib/shop"

export const Route = createFileRoute("/_app/products/new")({
    component: NewProductPage,
})

/** 新建商品：先建草稿（基本信息），保存后进入编辑页补规格/SKU/定价 */
function NewProductPage() {
    const shop = useCurrentShop()
    const navigate = useNavigate()
    const [serverError, setServerError] = useState<string | null>(null)

    const create = useMutation({
        mutationFn: (values: BasicFormValues) =>
            productApi.create(shop!.id, {
                categoryId: values.categoryId,
                name: values.name,
                subtitle: values.subtitle || undefined,
                description: values.description || undefined,
                mainImage: values.mainImage || undefined,
                images: splitLines(values.imagesText),
                params: values.params.filter((p) => p.name.trim() && p.value.trim()),
            }),
        onSuccess: (product) => {
            void navigate({ to: "/products/$productId", params: { productId: product.id } })
        },
        onError: (e) => {
            setServerError(toApiError(e).detail)
        },
    })

    if (!shop) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <Store className="size-10 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                    还没有正常营业的店铺，先到「店铺管理」创建或等待审核
                </p>
            </div>
        )
    }

    return (
        <div className="mx-auto w-full max-w-2xl space-y-6">
            <Link
                to="/products"
                search={{ page: 1, size: 10 }}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
                <ArrowLeft className="size-4" />
                返回商品列表
            </Link>

            <div>
                <h1 className="text-xl font-bold tracking-tight">新建商品</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    先填基本信息保存草稿，下一步再设置规格、价格和库存。
                </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
                <BasicForm
                    submitting={create.isPending}
                    submitText="保存草稿"
                    onSubmit={(values) => {
                        setServerError(null)
                        create.mutate(values)
                    }}
                />
                {serverError ? (
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
                        <CircleAlert className="size-4" />
                        {serverError}
                    </p>
                ) : null}
            </div>
        </div>
    )
}

function splitLines(text: string): string[] | undefined {
    const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    return lines.length > 0 ? lines : undefined
}

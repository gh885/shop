import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, CircleAlert, Store } from "lucide-react"

import { BasicForm, type BasicFormValues } from "#/components/basic-form"
import { toApiError } from "@shop/api"

import { CategoryStep } from "#/products"
import { productApi } from "#/shared/lib/api"
import { useCurrentShop } from "#/shared/lib/shop"

interface NewProductSearch {
    /** 已选末级类目 id：有值 = 进入第二步（填基本信息），空 = 第一步选类目 */
    categoryId?: string
}

export const Route = createFileRoute("/_app/products/new")({
    validateSearch: (search: Record<string, unknown>): NewProductSearch => ({
        categoryId: typeof search.categoryId === "string" ? search.categoryId : undefined,
    }),
    component: NewProductPage,
})

/** 发布商品：第一步选类目（类目发布后不可改，单独成屏），第二步建草稿基本信息 */
function NewProductPage() {
    const shop = useCurrentShop()
    const navigate = useNavigate()
    const { categoryId } = Route.useSearch()
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

    // 第一步：选类目
    if (!categoryId) {
        return (
            <div className="mx-auto w-full max-w-[1184px]">
                <CategoryStep
                    value={null}
                    onConfirm={(leafId) =>
                        void navigate({ to: ".", search: { categoryId: leafId } })
                    }
                />
            </div>
        )
    }

    // 第二步：基本信息（类目已在第一步锁定，回上一步可重选）
    return (
        <div className="mx-auto w-full max-w-[1184px] space-y-6">
            <div className="flex items-center justify-between gap-3">
                <Link
                    to="."
                    search={{}}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="size-4" />
                    返回上一步（重选类目）
                </Link>
                <Link
                    to="/products"
                    search={{ page: 1, size: 10 }}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    退出发布
                </Link>
            </div>

            <div>
                <h1 className="text-xl font-bold tracking-tight">填写商品信息</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    先填基本信息保存草稿，下一步再设置规格、价格和库存。
                </p>
            </div>

            <div className="rounded-2xl bg-muted/40 p-6">
                <BasicForm
                    lockedCategoryId={categoryId}
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

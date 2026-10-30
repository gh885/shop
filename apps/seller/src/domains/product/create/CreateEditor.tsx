import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleAlert, ListTree } from "lucide-react"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
    Button,
    Skeleton,
    Spinner,
    StateError,
} from "@shop/ui-web"
import { toApiError } from "@shop/common/contract"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { notify } from "@shop/app-kit/data"
import { useUnsavedLeaveGuard } from "@shop/app-kit/forms"
import { SellerProductControllerApi } from "@shop/api/sdk"

import { useT } from "#/locales/use-t"
import { message } from "#/locales/message"
import { parseForbiddenWordError } from "../forbidden-word"
import {
    categoryTreeOptions,
    brandOptions,
    categoryConfigOptions,
    productCreateKeys,
} from "./queries"
import {
    combinationCount,
    emptyDraft,
    emptySku,
    matrixRows,
    MAX_SKU_COMBINATIONS,
    mergeSkuRows,
    specAttributes,
    type CreateDraft,
    type FieldErrors,
} from "./model"
import { clearCreateDraft, loadCreateDraft, saveCreateDraft } from "./draft-persist"
import { toCreateRequest, validateDraft } from "./submit"
import { findCategoryPath } from "./category/tree"
import { uploadImage } from "./upload"
import { BasicInfoSection } from "./sections/BasicInfoSection"
import { AttributeSection } from "./sections/AttributeSection"
import { SpecSection } from "./sections/SpecSection"
import { SpecImageSection } from "./sections/SpecImageSection"
import { SkuMatrix } from "./sections/SkuMatrix"

type SubmitMode = "draft" | "submit"

export function CreateEditor({
    shopId,
    categoryId,
    onFinished,
    onSwitchCategory,
}: {
    shopId: string
    categoryId: string
    onFinished: () => void
    onSwitchCategory: () => void
}) {
    const t = useT("product")
    const { locale } = useI18n()
    const queryClient = useQueryClient()
    const configQuery = useQuery(categoryConfigOptions(categoryId))
    const brandsQuery = useQuery(brandOptions)
    const treeQuery = useQuery(categoryTreeOptions)

    const [draft, setDraft] = useState<CreateDraft>(emptyDraft)
    const [errors, setErrors] = useState<FieldErrors>({})
    const [banner, setBanner] = useState<string>()
    // 本地草稿：进页面先看有没有存档；有且当前没打字就给恢复条，恢复/丢弃都是一次决定
    const [restorable, setRestorable] = useState<CreateDraft | null>(() => loadCreateDraft())
    const createdRef = useRef<string | undefined>(undefined)

    const config = configQuery.data
    const brands = brandsQuery.data ?? []
    const tree = treeQuery.data ?? []
    const categoryPath = findCategoryPath(tree, categoryId)
    const rows =
        config === undefined
            ? []
            : matrixRows(draft.dimensions, specAttributes(config), t("product.sku.singleSpec"))
    const overLimit =
        config !== undefined &&
        combinationCount(draft.dimensions, specAttributes(config)) > MAX_SKU_COMBINATIONS
    const dirty =
        draft.title !== "" ||
        draft.images.length > 0 ||
        draft.disabledKeys.length > 0 ||
        Object.values(draft.skus).some(
            (sku) => sku.price !== "" || sku.barcode !== "" || sku.merchantCode !== "",
        )
    useUnsavedLeaveGuard(() => dirty)

    // 边打字边存：只有 dirty 才写，避免空表单覆盖上一份存档
    useEffect(() => {
        if (dirty) saveCreateDraft(draft)
    }, [draft, dirty])

    const save = useMutation({
        mutationFn: async (mode: SubmitMode) => {
            let spuId = createdRef.current
            if (spuId === undefined) {
                const created = await SellerProductControllerApi.createProduct({
                    body: toCreateRequest(draft, categoryId, config!),
                })
                spuId = created.spuId
            }
            createdRef.current = spuId
            if (mode === "submit") {
                await SellerProductControllerApi.submitListing({
                    path: { spuId },
                    body: { shopId },
                })
            }
            return spuId
        },
        meta: { silentError: true },
    })

    if (configQuery.isError) {
        return (
            <StateError
                message={errorText(
                    toApiError(configQuery.error),
                    locale,
                    t("product.create.loadFailed"),
                )}
                onRetry={() => void configQuery.refetch()}
                retrying={configQuery.isFetching}
            />
        )
    }
    if (config === undefined || brandsQuery.isPending) {
        return <EditorSkeleton />
    }
    const resolvedConfig = config

    function patch(next: Partial<CreateDraft>) {
        setDraft((previous) => ({ ...previous, ...next }))
    }

    function changeDimensions(next: CreateDraft["dimensions"]) {
        setDraft((previous) => {
            const nextRows = matrixRows(
                next,
                specAttributes(resolvedConfig),
                t("product.sku.singleSpec"),
            )
            return { ...previous, dimensions: next, skus: mergeSkuRows(nextRows, previous.skus) }
        })
    }

    function patchSku(key: string, next: Partial<ReturnType<typeof emptySku>>) {
        setDraft((previous) => ({
            ...previous,
            skus: { ...previous.skus, [key]: { ...(previous.skus[key] ?? emptySku()), ...next } },
        }))
    }

    /** 禁用/恢复一个规格组合。禁用的行不提交，后端允许少一个组合。 */
    function toggleDisabled(key: string) {
        setDraft((previous) => ({
            ...previous,
            disabledKeys: previous.disabledKeys.includes(key)
                ? previous.disabledKeys.filter((entry) => entry !== key)
                : [...previous.disabledKeys, key],
        }))
    }

    /** 批量填充只覆盖启用中的行；禁用的行保持原样。 */
    function batchFill(next: Partial<ReturnType<typeof emptySku>>) {
        setDraft((previous) => {
            const skus = { ...previous.skus }
            const disabled = new Set(previous.disabledKeys)
            for (const row of rows) {
                if (disabled.has(row.key)) continue
                skus[row.key] = { ...(skus[row.key] ?? emptySku()), ...next }
            }
            return { ...previous, skus }
        })
    }

    function submit(mode: SubmitMode) {
        setBanner(undefined)
        const nextErrors = validateDraft(draft, resolvedConfig)
        setErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return

        save.mutate(mode, {
            onSuccess: () => {
                clearCreateDraft()
                setRestorable(null)
                void queryClient.invalidateQueries({ queryKey: productCreateKeys.all })
                notify.success(
                    mode === "draft"
                        ? message("product.create.toast.draftSaved")
                        : message("product.create.toast.submitted"),
                )
                onFinished()
            },
            onError: (error) => {
                const hit = parseForbiddenWordError(error)
                if (hit !== undefined && hit !== null) {
                    const key = hit.field === "name" ? "title" : "subtitle"
                    setErrors({
                        [key]: t("product.create.error.forbiddenWord", { word: hit.word ?? "" }),
                    })
                    return
                }
                if (hit === null) {
                    setBanner(t("product.create.error.forbiddenWordGlobal"))
                    return
                }
                setBanner(errorText(toApiError(error), locale))
            },
        })
    }

    return (
        <div className="mx-auto w-full max-w-narrow pb-24">
            <header className="mb-5">
                <h1 className="text-xl font-bold">{t("product.create.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("product.create.subtitle")}</p>
            </header>

            <div
                id="section-category"
                className="mb-4 flex scroll-mt-16 items-center gap-3 rounded-lg bg-background px-4 py-3 shadow-sm"
            >
                <ListTree className="size-4 shrink-0 text-muted-foreground" />
                <span className="shrink-0 text-sm text-muted-foreground">
                    {t("product.create.category.label")}
                </span>
                {categoryPath === undefined ? (
                    <Skeleton className="h-4 w-40 shrink-0" />
                ) : (
                    <Breadcrumb className="min-w-0 flex-1">
                        <BreadcrumbList className="flex-nowrap overflow-hidden whitespace-nowrap">
                            {categoryPath.names.map((name, index) => (
                                <BreadcrumbItem key={name}>
                                    {index > 0 ? <BreadcrumbSeparator /> : undefined}
                                    {index === categoryPath.names.length - 1 ? (
                                        <BreadcrumbPage>{name}</BreadcrumbPage>
                                    ) : (
                                        name
                                    )}
                                </BreadcrumbItem>
                            ))}
                        </BreadcrumbList>
                    </Breadcrumb>
                )}
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onSwitchCategory}
                    className="shrink-0"
                >
                    {t("product.create.category.switch")}
                </Button>
            </div>

            <div className="space-y-4">
                <BasicInfoSection
                    draft={draft}
                    errors={errors}
                    brands={brands}
                    brandPolicy={resolvedConfig.brandPolicy}
                    onPatch={patch}
                    upload={(file) =>
                        uploadImage(file).catch(() => {
                            throw new Error(t("product.create.uploadFailed"))
                        })
                    }
                />
                <AttributeSection
                    config={resolvedConfig}
                    values={draft.attributes}
                    errors={errors}
                    onChange={(attributes) => patch({ attributes })}
                />
                <SpecSection
                    config={resolvedConfig}
                    dimensions={draft.dimensions}
                    errors={errors}
                    onChange={changeDimensions}
                />
                <SpecImageSection
                    config={resolvedConfig}
                    dimensions={draft.dimensions}
                    images={draft.specImages}
                    onChange={(specImages) => patch({ specImages })}
                    upload={(file) =>
                        uploadImage(file).catch(() => {
                            throw new Error(t("product.create.uploadFailed"))
                        })
                    }
                />
                <SkuMatrix
                    rows={rows}
                    draft={draft}
                    errors={errors}
                    onChange={patchSku}
                    onToggleDisabled={toggleDisabled}
                    onBatchFill={batchFill}
                    overLimit={overLimit}
                />
            </div>

            {restorable !== null && !dirty ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm">
                    <span>{t("product.create.draft.found")}</span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            setDraft(restorable)
                            setRestorable(null)
                        }}
                    >
                        {t("product.create.draft.restore")}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            clearCreateDraft()
                            setRestorable(null)
                        }}
                    >
                        {t("product.create.draft.discard")}
                    </Button>
                </div>
            ) : null}

            {banner ? (
                <div
                    role="alert"
                    className="fixed inset-x-0 bottom-16 z-sticky px-6"
                >
                    <p className="mx-auto flex w-full max-w-narrow items-center gap-2 rounded-lg bg-destructive-subtle px-4 py-2.5 text-sm text-destructive-subtle-foreground shadow-md">
                        <CircleAlert className="size-4 shrink-0" />
                        {banner}
                    </p>
                </div>
            ) : null}

            <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-background/90 py-3 backdrop-blur">
                <div className="mx-auto flex w-full max-w-narrow items-center justify-end gap-3 px-6">
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={save.isPending}
                        onClick={() => submit("draft")}
                        className="h-10"
                    >
                        {t("product.create.action.saveDraft")}
                    </Button>
                    <Button
                        type="button"
                        disabled={save.isPending}
                        onClick={() => submit("submit")}
                        className="h-10"
                    >
                        {save.isPending ? <Spinner /> : null}
                        {t("product.create.action.submit")}
                    </Button>
                </div>
            </div>
        </div>
    )
}

function EditorSkeleton() {
    return (
        <div className="mx-auto w-full max-w-narrow">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-4 h-28 w-full rounded-lg" />
            <Skeleton className="mt-4 h-64 w-full rounded-lg" />
            <Skeleton className="mt-4 h-40 w-full rounded-lg" />
        </div>
    )
}

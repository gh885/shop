import { useRef, useState } from "react"
import { Navigate, createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"

import { Skeleton } from "@shop/ui-web"

import { toApiError } from "@shop/common"

import { PublishBasicStep, type BasicStepValues, type SubmitMode } from "#/product"
import {
    parseForbiddenWordError,
    type ForbiddenHit,
    type ForbiddenWordFound,
} from "#/product/forbidden-word"
import { useProductDraft } from "#/product/create/basic/use-product-draft"
import { errorText, notify, useI18n, useUnsavedLeaveGuard } from "@shop/app-kit"
import { useT } from "#/locales/use-t"
import { useShop } from "#/shop"

interface BasicSearch {
    /** 已选末级类目 id（第一步确认后跳转带入，必填） */
    categoryId?: string
    /** 商品 id：新建后点保存/提交回写；编辑已有商品（草稿/仓库中/已发布）由列表页带入，刷新可续编 */
    productId?: string
}

export const Route = createFileRoute("/_app/product/create/basic")({
    validateSearch: (search: Record<string, unknown>): BasicSearch => ({
        categoryId: typeof search.categoryId === "string" ? search.categoryId : undefined,
        productId: typeof search.productId === "string" ? search.productId : undefined,
    }),
    component: NewProductBasicStep,
})

/** 发布第二步：填商品信息建档（新建/继续编辑共用）。categoryId 必填，缺失回第一步 */
function NewProductBasicStep() {
    const shop = useShop()
    const { locale } = useI18n()
    const t = useT()
    const navigate = useNavigate()
    const shopId = shop.id
    const { categoryId, productId } = Route.useSearch()
    const [serverError, setServerError] = useState<string | undefined>()
    /** 违禁词闸门（COM-01）的命中：交给发布表单定位到字段，不占全局横幅 */
    const [forbiddenWord, setForbiddenWord] = useState<ForbiddenHit | undefined>()

    const draft = useProductDraft({
        shopId,
        categoryId,
        productId,
        onCreated: (newProductId) =>
            void navigate({
                to: "/product/create/basic",
                search: { categoryId, productId: newProductId },
                replace: true,
            }),
    })

    // 未保存更改离开提醒（脏判定 + 基线复位归本页，拦截与确认面见 useUnsavedLeaveGuard）
    // onBasicChange 会在表单值每次变化（含回填）时触发：以回填完成后的首个观测值为基线，
    // 其后内容变化即视为脏。hydratedBasic 变化（编辑回填完成）时重置基线，避免把程序性回填误判为用户编辑。
    const [dirty, setDirty] = useState(false)
    const hydratedBasic = draft.hydratedBasic
    const baselineRef = useRef<BasicStepValues | undefined>(undefined)
    const lastHydratedRef = useRef(hydratedBasic)

    function handleBasicChange(values: BasicStepValues) {
        const hydratedChanged = lastHydratedRef.current !== hydratedBasic
        lastHydratedRef.current = hydratedBasic
        if (baselineRef.current === undefined || hydratedChanged) {
            baselineRef.current = values
            return
        }
        if (JSON.stringify(values) !== JSON.stringify(baselineRef.current)) {
            setDirty(true)
        }
    }

    useUnsavedLeaveGuard(() => dirty, { onLeave: () => setDirty(false) })

    // 编辑已有商品时把状态带到发布页（BasicStep 据此决定能否切类目 / 规格是否冻结）；新建无。
    // 类型即 useProductDraft 返回的 ProductStatus | undefined（DraftProductStatus 别名已在重构中删除）
    const editingStatus = draft.productStatus

    async function onSubmit(values: BasicStepValues, mode: SubmitMode) {
        setServerError(undefined)
        setForbiddenWord(undefined)
        try {
            await draft.submit(values, mode)
            // 保存草稿：留在当前页（productId 已由 onCreated 写回 URL，可刷新续编），toast 确认；
            // 提交/入库才跳回列表。保存成功后重置脏标记与基线。
            baselineRef.current = undefined
            setDirty(false)
            if (mode === "draft") {
                notify.success("草稿已保存")
                return
            }
            void navigate({ to: "/product/list", search: { page: 1, size: 10 } })
        } catch (error) {
            // 违禁词命中按码分支（COM-01）：能定位到字段就交给表单就地标红，
            // 认不出字段（null）与其它错误一样回落横幅，宁可不定位也不猜一个字段。
            const hit = parseForbiddenWordError(error)
            if (hit) {
                setForbiddenWord(forbiddenMarkOf(hit, error))
                return
            }
            setServerError(errorText(toApiError(error), locale))
        }
    }

    /**
     * 违禁词命中 → 表单要写进 errorMap 的那笔（state 收的是 ForbiddenHit）。
     * 命中词是词表数据、原样给出；句子本身走 catalog。认不出词时退回那条链，
     * 而不是把后端那句 detail 直接印到屏幕上（§7.3）。
     */
    function forbiddenMarkOf(hit: ForbiddenWordFound, error: unknown): ForbiddenHit {
        return {
            field: hit.field,
            message:
                hit.word === undefined
                    ? errorText(toApiError(error), locale)
                    : t("product.publish.forbiddenWordHit", { word: hit.word }),
        }
    }

    // 直接访问缺 categoryId（手输 URL / 旧链接）：第一步还没选类目，回第一步而不是留空白页
    if (!categoryId) {
        return (
            <Navigate
                to="/product/create/category"
                search={{}}
                replace
            />
        )
    }

    // 编辑态回填未完成：整页骨架，**不挂表单**。
    // 这不是「锦上添花的 loading」——详情到达前 productStatus 是 undefined，
    // `editRules(undefined)` 给的是 DRAFT 权限全集（可切类目 / 可改规格 / 显示发布动作 / 免设价门槛），
    // 挂载空表单等于把「已上架商品」暂时降级成「草稿」；而详情**失败**时该状态会永久持续，
    // 用户点一次保存就是 `persistBasic` / `persistSpecs` 拿空值整份覆盖已有商品。
    // 所以闸门在「挂不挂表单」这一层，失败路径另由路由错误页接管（见 product/queries.ts 的注释）。
    if (draft.hydrating) return <PublishStepSkeleton />

    return (
        <div className="mx-auto w-full max-w-narrow">
            <PublishBasicStep
                categoryId={categoryId}
                productStatus={editingStatus}
                submitting={draft.submitting}
                creating={draft.creating}
                onSwitchCategory={() =>
                    void navigate({ to: "/product/create/category", search: {} })
                }
                selections={draft.selections}
                skuRows={draft.skuRows}
                onSelectionsChange={draft.setSelections}
                onSkuRowsChange={draft.setSkuRows}
                submit={onSubmit}
                onBasicChange={handleBasicChange}
                initialBasic={draft.hydratedBasic}
                forbiddenWord={forbiddenWord}
            />
            {serverError ? (
                /* 提交失败：浮在底部操作条正上方，与触发按钮保持视觉关联 */
                <div
                    role="alert"
                    className="fixed inset-x-0 bottom-16 z-30 px-6"
                >
                    <p className="mx-auto flex w-full max-w-narrow items-center gap-2 rounded-lg bg-destructive-subtle px-4 py-2.5 text-sm text-destructive-subtle-foreground shadow-md">
                        <CircleAlert className="size-4 shrink-0" />
                        {serverError}
                    </p>
                </div>
            ) : undefined}
        </div>
    )
}

/**
 * 编辑回填期间的整页骨架：形状对齐 `PublishBasicStep`（面包屑 + 若干信息段 + 底部操作条），
 * 降低详情到达时的布局抖动。纯展示，无文案故不需要 i18n。
 */
function PublishStepSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="mx-auto w-full max-w-narrow"
        >
            <Skeleton className="h-4 w-40 shrink-0" />
            <Skeleton className="mt-4 h-28 w-full rounded-xl" />
            <Skeleton className="mt-4 h-64 w-full rounded-xl" />
            <Skeleton className="mt-4 h-40 w-full rounded-xl" />
            {/* 底部操作条 */}
            <div className="mt-6 flex items-center justify-end gap-2">
                <Skeleton className="h-9 w-24 rounded-lg" />
                <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
        </div>
    )
}

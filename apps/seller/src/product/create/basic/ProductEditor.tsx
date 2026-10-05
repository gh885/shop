import { message } from "#/locales/message"
import { useRef, useState } from "react"
import { CircleAlert } from "lucide-react"
import { Skeleton } from "@shop/ui-web"
import { toApiError } from "@shop/common/contract"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { notify } from "@shop/app-kit/data"
import { useUnsavedLeaveGuard } from "@shop/app-kit/forms"

import { useT } from "#/locales/use-t"
import { EMPTY_PRODUCT_BASIC_FORM, type ProductBasicForm } from "../../draft-model"
import {
    parseForbiddenWordError,
    type ForbiddenHit,
    type ForbiddenWordFound,
} from "../../forbidden-word"
import { BasicStep, type BasicStepValues, type SubmitMode } from "./BasicStep"
import { BusinessError } from "./draft-persist"
import { useProductDraft } from "./use-product-draft"

/** 完整编辑会话：调用者只提供身份和导航，不参与回填、保存或离页判断。 */
interface ProductEditorProps {
    shopId: string
    categoryId: string
    productId?: string
    onCreated: (productId: string) => void
    onFinished: () => void
    onSwitchCategory: () => void
}

export function ProductEditor(props: ProductEditorProps) {
    const [createdId, setCreatedId] = useState<string | undefined>()
    // 新建后回写 ID 仍是同一会话；切到另一商品/店铺/类目则从干净的会话重挂。
    const sessionId = props.productId === createdId ? "new" : (props.productId ?? "new")
    return (
        <EditorSession
            key={JSON.stringify([props.shopId, props.categoryId, sessionId])}
            {...props}
            onCreated={(id) => {
                setCreatedId(id)
                props.onCreated(id)
            }}
        />
    )
}

function EditorSession({ onFinished, onSwitchCategory, ...identity }: ProductEditorProps) {
    const draft = useProductDraft(identity)
    // 详情到齐才挂表单：初值与编辑权限一起生效，失败绝不放行空表单。
    if (draft.hydrating) return <PublishStepSkeleton />
    return (
        <EditorForm
            categoryId={identity.categoryId}
            draft={draft}
            onFinished={onFinished}
            onSwitchCategory={onSwitchCategory}
        />
    )
}

function EditorForm({
    categoryId,
    draft,
    onFinished,
    onSwitchCategory,
}: {
    categoryId: string
    draft: ReturnType<typeof useProductDraft>
    onFinished: () => void
    onSwitchCategory: () => void
}) {
    const { locale } = useI18n()
    const t = useT()
    const [serverError, setServerError] = useState<string | undefined>()
    /** 违禁词闸门（COM-01）的命中：交给发布表单定位到字段，不占全局横幅 */
    const [forbiddenWord, setForbiddenWord] = useState<ForbiddenHit | undefined>()

    const changes = useEditorChanges(draft.hydratedBasic ?? EMPTY_PRODUCT_BASIC_FORM)
    useUnsavedLeaveGuard(changes.isDirty)

    // 编辑已有商品时把状态带到发布页（BasicStep 据此决定能否切类目 / 规格是否冻结）；新建无。
    // 类型即 useProductDraft 返回的 ProductStatus | undefined（DraftProductStatus 别名已在重构中删除）
    const editingStatus = draft.productStatus

    async function onSubmit(values: BasicStepValues, mode: SubmitMode) {
        setServerError(undefined)
        setForbiddenWord(undefined)
        const revision = changes.revision()
        try {
            await draft.submit(values, mode)
            // 保存草稿：留在当前页（productId 已由 onCreated 写回 URL，可刷新续编），toast 确认；
            // 提交/入库才跳回列表。保存成功后重置脏标记与基线。
            changes.saved(revision)
            if (mode === "draft") {
                notify.success(message("seller.product.toast.draftSaved"))
                return
            }
            if (!changes.isDirty()) onFinished()
        } catch (error) {
            // 违禁词命中按码分支（COM-01）：能定位到字段就交给表单就地标红，
            // 认不出字段（null）与其它错误一样回落横幅，宁可不定位也不猜一个字段。
            const hit = parseForbiddenWordError(error)
            if (hit) {
                setForbiddenWord(forbiddenMarkOf(hit, error))
                throw error
            }
            // 本模块主动拒绝的业务门槛（缺店/缺类目/未设价）：错误带的是 catalog key，
            // 直接按当前语言换成横幅那句，不绕 errorText 的 detail 支（那会把 key 印到屏幕上）
            if (error instanceof BusinessError) {
                setServerError(t(error.key))
                throw error
            }
            setServerError(errorText(toApiError(error), locale))
            // 继续往外抛：BasicStep 的 catch 会把 422 的字段级明细落到对应输入框上
            // （横幅那句是无定位时的兜底，两者并存——与范本的「toast + 落框」同构），
            // 接住这条 rejection 的是 submitForm；在这里吞掉就等于让那条通道永远不亮
            throw error
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

    return (
        <div className="mx-auto w-full max-w-narrow">
            <BasicStep
                categoryId={categoryId}
                productStatus={editingStatus}
                submitting={draft.submitting}
                creating={draft.creating}
                onSwitchCategory={onSwitchCategory}
                selections={draft.selections}
                skuRows={draft.skuRows}
                onSelectionsChange={(next) => {
                    changes.changed()
                    draft.setSelections(next)
                }}
                onSkuRowsChange={(next) => {
                    changes.changed()
                    draft.setSkuRows(next)
                }}
                submit={onSubmit}
                onBasicChange={changes.basicChanged}
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

/** 只记录用户编辑；回填不算修改。保存只确认提交那一版，等待期间的新编辑不能被洗成已保存。 */
function useEditorChanges(initial: ProductBasicForm) {
    const state = useRef({ basic: JSON.stringify(initial), revision: 0, saved: 0 })
    return {
        basicChanged: (values: ProductBasicForm) => {
            const next = JSON.stringify(values)
            if (next === state.current.basic) return
            state.current.basic = next
            state.current.revision += 1
        },
        changed: () => {
            state.current.revision += 1
        },
        revision: () => state.current.revision,
        saved: (revision: number) => {
            state.current.saved = revision
        },
        isDirty: () => state.current.revision !== state.current.saved,
    }
}

/**
 * 编辑回填期间的整页骨架：形状对齐 `BasicStep`（面包屑 + 若干信息段 + 底部操作条），
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

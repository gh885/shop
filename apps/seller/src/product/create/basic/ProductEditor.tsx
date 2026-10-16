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
    // 新建后回写 ID 仍是同一会话；切到另一商品/店铺/类目才从干净会话重挂
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
    // 详情到齐才挂表单：初值与编辑权限一起生效，失败绝不放行空表单
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
    const [forbiddenWord, setForbiddenWord] = useState<ForbiddenHit | undefined>()

    const changes = useEditorChanges(draft.hydratedBasic ?? EMPTY_PRODUCT_BASIC_FORM)
    useUnsavedLeaveGuard(changes.isDirty)

    const editingStatus = draft.productStatus

    async function onSubmit(values: BasicStepValues, mode: SubmitMode) {
        setServerError(undefined)
        setForbiddenWord(undefined)
        const revision = changes.revision()
        try {
            await draft.submit(values, mode)
            changes.saved(revision)
            if (mode === "draft") {
                notify.success(message("product.toast.draftSaved"))
                return
            }
            if (!changes.isDirty()) onFinished()
        } catch (error) {
            // 违禁词命中按码分支（COM-01）：能定位到字段就交给表单就地标红，认不出字段宁可不定位也不猜
            const hit = parseForbiddenWordError(error)
            if (hit) {
                setForbiddenWord(forbiddenMarkOf(hit, error))
                throw error
            }
            // 本模块主动拒绝的门槛错误带的是 catalog key，直接 t 成横幅那句（不绕 errorText 的 detail 支，那会把 key 印到屏幕上）
            if (error instanceof BusinessError) {
                setServerError(t(error.key))
                throw error
            }
            setServerError(errorText(toApiError(error), locale))
            // 继续抛出：BasicStep 的 catch 据此把 422 字段级明细落到对应输入框；在这里吞掉那条通道就永远不亮
            throw error
        }
    }

    // 命中词是词表数据、原样给出；认不出词时退回错误链走 catalog，不直接把后端 detail 印到屏幕
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
                <div
                    role="alert"
                    className="fixed inset-x-0 bottom-16 z-sticky px-6"
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

function PublishStepSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="mx-auto w-full max-w-narrow"
        >
            <Skeleton className="h-4 w-40 shrink-0" />
            <Skeleton className="mt-4 h-28 w-full rounded-lg" />
            <Skeleton className="mt-4 h-64 w-full rounded-lg" />
            <Skeleton className="mt-4 h-40 w-full rounded-lg" />
            <div className="mt-6 flex items-center justify-end gap-2">
                <Skeleton className="h-9 w-24 rounded-lg" />
                <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
        </div>
    )
}

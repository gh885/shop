import { useEffect, useRef, useState } from "react"
import { CheckCircle2, ChevronRight, ListTree } from "lucide-react"
import { Badge, Button, Sticky, Tabs, TabsList, TabsTrigger, useAppForm } from "@shop/ui-web"

import type { SpecSelection } from "../../data"
import type { SkuDraftRow } from "./product-form-state"

import { BasicInfoSection } from "./BasicInfoSection"
import { SalesInfoSection } from "./SalesInfoSection"
import { useLeafPaths } from "../../use-category"

/** 吸顶页签占位（h-12 + mb-4）：发布页是窗口级滚动，页签吸在视口最顶，
    锚点滚动让位与滚动侦测都按这个高度算（顶栏已随内容滚走，不再计入） */
const TAB_BAR_SPACE = 64

/** 页内区块：顺序即页签顺序，id 即锚点。后续「图文描述」在这里追加 */
const SECTIONS = [
    { id: "section-category", label: "当前类目" },
    { id: "section-basic", label: "基础信息" },
    { id: "section-sales", label: "销售信息" },
] as const

export interface BasicStepValues {
    mainImage: string
    name: string
    subtitle: string
}

/** 提交方式：草稿与提交走同一份校验、同一个建档接口，只是落地后去向不同 */
export type SubmitMode = "submit" | "draft"

/**
 * 发布第二步：填商品信息（整体壳）。
 * 上→下＝吸顶锚点页签、分区卡片（当前类目 / 基础信息 / 销售信息）、底部固定操作条。
 *
 * 这里只负责「编排」：创建 useAppForm 持有 basic 字段、组装三个分区、底部操作条、锚点。
 * basic（主图/标题/卖点）字段渲染在 BasicInfoSection；selections/skuRows 由外层(use-product-draft)
 * 持有交由 SalesInfoSection；编辑态与草稿持久化都交给外层。
 */
export function BasicStep({
    categoryId,
    submitting,
    creating,
    onSwitchCategory,
    selections,
    skuRows,
    onSelectionsChange,
    onSkuRowsChange,
    submit,
    onBasicChange,
}: {
    categoryId: string
    submitting: boolean
    creating: boolean
    onSwitchCategory: () => void
    selections: SpecSelection[]
    skuRows: SkuDraftRow[]
    onSelectionsChange: (selections: SpecSelection[]) => void
    onSkuRowsChange: (rows: SkuDraftRow[]) => void
    submit: (values: BasicStepValues, mode: SubmitMode) => Promise<void>
    /** 表单字段值变化上报（父级做防抖 autosave 落库） */
    onBasicChange: (values: BasicStepValues) => void
}) {
    const leafPaths = useLeafPaths()
    const categoryNames = leafPaths.find((p) => p.id === categoryId)?.names ?? []
    const active = useActiveSection()

    // 两个提交按钮共用一次校验：按下时先记模式，再交给 form.handleSubmit
    const mode = useRef<SubmitMode>("submit")
    // 防抖回调用 ref：避免 subscribe 里每次重渲染触发不稳定闭包
    const basicChangeRef = useRef(onBasicChange)
    useEffect(() => {
        basicChangeRef.current = onBasicChange
    }, [onBasicChange])

    const form = useAppForm({
        defaultValues: { mainImage: "", name: "", subtitle: "" } as BasicStepValues,
        onSubmit: ({ value }) => void submit(value, mode.current),
    })

    function submitAs(next: SubmitMode) {
        mode.current = next
        void form.handleSubmit()
    }

    return (
        <form.AppForm>
            <form.Subscribe selector={(s) => s.values}>
                {(values) => {
                    basicChangeRef.current(values)
                    return null
                }}
            </form.Subscribe>
            <form
                className="pb-24"
                onSubmit={(e) => {
                    e.preventDefault()
                    submitAs(mode.current)
                }}
            >
                <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                    <div>
                        <h1 className="text-lg font-semibold tracking-tight">填写商品信息</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            带 <span className="text-destructive">*</span>{" "}
                            为必填；基础信息修改后自动保存草稿
                        </p>
                    </div>
                    {/* 流程步骤：第一步已完成，当前停在第二步 */}
                    <ol className="flex items-center gap-1.5 text-sm">
                        <li className="flex items-center gap-1.5 text-muted-foreground">
                            <CheckCircle2 className="size-4 text-success" />
                            选择类目
                        </li>
                        <li aria-hidden="true">
                            <ChevronRight className="size-4 text-muted-foreground/40" />
                        </li>
                        <li className="flex items-center gap-1.5 font-medium text-foreground">
                            <Badge>2</Badge>
                            填写商品信息
                        </li>
                    </ol>
                </header>

                <Sticky
                    top={0}
                    className="-mx-6 mb-4 px-6"
                >
                    <div className="flex h-12 w-full items-center rounded-xl bg-background px-2 shadow-sm">
                        <Tabs
                            value={active}
                            onValueChange={(next) => scrollToSection(String(next))}
                            className="w-full"
                        >
                            <TabsList className="h-full w-full justify-start gap-1 rounded-lg bg-transparent">
                                {SECTIONS.map((section) => (
                                    <TabsTrigger
                                        key={section.id}
                                        value={section.id}
                                        className="flex-none p-4"
                                    >
                                        {section.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>
                </Sticky>

                <div className="space-y-6">
                    {/* 当前类目：千牛式紧凑单项条（白底薄卡 + 面包屑 + 右侧切换），不走大头卡片 */}
                    <div
                        id="section-category"
                        className="flex scroll-mt-16 items-center gap-3 rounded-xl bg-background px-4 py-3 shadow-sm"
                    >
                        <ListTree className="size-4 shrink-0 text-muted-foreground" />
                        <span className="shrink-0 text-sm text-muted-foreground">当前类目</span>
                        <p className="min-w-0 flex-1 truncate text-sm">
                            {categoryNames.length > 0 ? (
                                categoryNames.map((name, i) => (
                                    <span key={name}>
                                        {i > 0 && (
                                            <span className="mx-1.5 text-muted-foreground">
                                                &gt;
                                            </span>
                                        )}
                                        {name}
                                    </span>
                                ))
                            ) : (
                                <span className="text-muted-foreground">类目加载中…</span>
                            )}
                        </p>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onSwitchCategory}
                        >
                            切换类目
                        </Button>
                    </div>

                    <BasicInfoSection form={form} />

                    <SalesInfoSection
                        categoryId={categoryId}
                        selections={selections}
                        skuRows={skuRows}
                        onSelectionsChange={onSelectionsChange}
                        onSkuRowsChange={onSkuRowsChange}
                    />
                </div>

                <ActionBar
                    submitting={submitting}
                    creating={creating}
                    onSubmit={() => submitAs("submit")}
                    onSaveDraft={() => submitAs("draft")}
                />
            </form>
        </form.AppForm>
    )
}

/** 底部固定操作条：通栏铺满，内容与主区同宽对齐 */
function ActionBar({
    submitting,
    creating,
    onSubmit,
    onSaveDraft,
}: {
    submitting: boolean
    creating: boolean
    onSubmit: () => void
    onSaveDraft: () => void
}) {
    return (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 py-3 backdrop-blur">
            <div className="mx-auto flex w-full max-w-narrow items-center justify-end gap-3 px-6">
                <Button
                    type="button"
                    variant="ghost"
                    disabled={submitting || creating}
                    onClick={onSaveDraft}
                    className="h-10 px-6"
                >
                    保存草稿
                </Button>
                <Button
                    type="button"
                    disabled={submitting || creating}
                    onClick={onSubmit}
                    className="h-10 px-10"
                >
                    {submitting ? "提交中…" : creating ? "保存中…" : "提交商品信息"}
                </Button>
            </div>
        </div>
    )
}

/** 锚点页签的高亮跟随滚动：当前滚动光标（页签吸顶高度处）落在哪个区块，就激活对应页签。
    用滚动位置比较而非 IntersectionObserver：IO 只在交叉状态改变时回调，连续滚动时可能不触发，
    导致高亮滞后；位置比较则实时、稳定。 */
function useActiveSection(): string {
    const [active, setActive] = useState<string>(SECTIONS[0].id)

    useEffect(() => {
        function compute() {
            // 光标等于页签吸顶线：区块顶部越过该线即视为已滚到
            const cursor = window.scrollY + TAB_BAR_SPACE
            let current: string = SECTIONS[0].id
            for (const section of SECTIONS) {
                const el = document.getElementById(section.id)
                if (el && el.getBoundingClientRect().top + window.scrollY <= cursor) {
                    current = section.id
                }
            }
            // 兜底：滚到最底时最后区块顶部可能尚未越过光标，强制激活最后一个
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1) {
                current = SECTIONS[SECTIONS.length - 1].id
            }
            setActive(current)
        }

        compute()
        window.addEventListener("scroll", compute, { passive: true })
        window.addEventListener("resize", compute)
        return () => {
            window.removeEventListener("scroll", compute)
            window.removeEventListener("resize", compute)
        }
    }, [])

    return active
}

function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

import { useEffect, useRef, useState } from "react"
import { Button, Sticky, Tabs, TabsList, TabsTrigger, useAppForm } from "@shop/ui-web"

import type { SpecSelection } from "../../data"
import type { SkuDraftRow } from "./product-form-state"

import { BasicInfoSection } from "./BasicInfoSection"
import { SalesInfoSection } from "./SalesInfoSection"
import { useLeafPaths } from "../../use-category"

/** 顶栏高度（h-14），吸顶页签据此判定「已吸住」并做锚点让位 */
const TOPBAR_HEIGHT = 56

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
                <Sticky
                    top={0}
                    stuckAt={TOPBAR_HEIGHT}
                    className="-mx-6 mb-4 px-6"
                >
                    <div className="flex h-12 w-full items-center rounded-xl bg-background px-2 shadow-sm">
                        <Tabs
                            value={active}
                            onValueChange={(next) => scrollToSection(String(next))}
                            className="w-full"
                        >
                            <TabsList
                                variant="line"
                                className="h-full w-full justify-start gap-1 bg-transparent p-0"
                            >
                                {SECTIONS.map((section) => (
                                    <TabsTrigger
                                        key={section.id}
                                        value={section.id}
                                        className="flex-none rounded-lg px-4 text-sm text-muted-foreground transition-colors after:hidden hover:text-foreground data-active:bg-primary-subtle data-active:font-semibold data-active:text-primary data-active:shadow-sm data-active:hover:text-primary"
                                    >
                                        {section.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>
                </Sticky>

                <div className="space-y-4">
                    {/* 当前类目：千牛式紧凑单项条（白底薄卡 + 面包屑 + 右侧切换），不走大头卡片 */}
                    <div
                        id="section-category"
                        className="flex scroll-mt-20 items-center gap-3 rounded-xl bg-background px-4 py-3 shadow-sm"
                    >
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
        <div className="fixed inset-x-0 bottom-0 z-30 bg-background/90 py-3 backdrop-blur">
            <div className="mx-auto flex w-full max-w-narrow items-center justify-center gap-3 px-6">
                <Button
                    type="button"
                    disabled={submitting || creating}
                    onClick={onSubmit}
                    className="h-10 px-10"
                >
                    {submitting ? "提交中…" : creating ? "保存中…" : "提交商品信息"}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    disabled={submitting || creating}
                    onClick={onSaveDraft}
                    className="h-10 px-6"
                >
                    保存草稿
                </Button>
            </div>
        </div>
    )
}

/** 锚点页签的高亮跟随滚动：取当前视口内最靠上的区块 */
function useActiveSection(): string {
    const [active, setActive] = useState<string>(SECTIONS[0].id)

    useEffect(() => {
        // getElementById 找不到返回 null，须排除 null 而非 undefined，否则 observe(null) 抛错
        const elements = SECTIONS.map((s) => document.getElementById(s.id)).filter(
            (el): el is HTMLElement => el !== null,
        )
        if (elements.length === 0) return

        const observer = new IntersectionObserver(
            (entries) => {
                const top = entries
                    .filter((e) => e.isIntersecting)
                    .toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
                if (top) setActive(top.target.id)
            },
            { rootMargin: `-${TOPBAR_HEIGHT + 48}px 0px -55% 0px` },
        )
        elements.forEach((el) => observer.observe(el))
        return () => observer.disconnect()
    }, [])

    return active
}

function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

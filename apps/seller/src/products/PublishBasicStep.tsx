import { useEffect, useRef, useState } from "react"
import { ImageOff } from "lucide-react"
import {
    Button,
    Input,
    Sticky,
    Tabs,
    TabsList,
    TabsTrigger,
    firstFieldError,
    useAppForm,
} from "@shop/ui-web"

import { ProductNameSchema, SellingPointSchema } from "@shop/api"
import type { SkuUpdateItem } from "@shop/api"
import type { SkuResponse } from "@shop/api/sdk"

import type { SpecSelection } from "#/shared/lib/api"

import { CountedInput } from "./CountedInput"
import { FieldRow, SectionCard } from "./SectionCard"
import { SalesInfoSection } from "./SalesInfoSection"
import { useLeafPaths } from "./use-category"

/** 顶栏高度（h-14），吸顶页签据此判定「已吸住」并做锚点让位 */
const TOPBAR_HEIGHT = 56

/** 页内区块：顺序即页签顺序，id 即锚点。后续「销售信息」「图文描述」在这里追加 */
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
 * 发布第二步：填商品信息。
 * 上→下＝吸顶锚点页签、分区卡片（当前类目 / 基础信息）、底部固定操作条。
 * 本期只做主图 + 标题 + 卖点三个字段，规格/价格/库存在建档后的商品编辑页继续。
 */
export function PublishBasicStep({
    categoryId,
    submitting,
    onSwitchCategory,
    applySpecs,
    onSubmit,
}: {
    categoryId: string
    submitting: boolean
    onSwitchCategory: () => void
    /** 生成 SKU 网格：父级确保草稿存在并调用 applySpecs */
    applySpecs: (values: BasicStepValues, selections: SpecSelection[]) => Promise<SkuResponse[]>
    onSubmit: (values: BasicStepValues, mode: SubmitMode, skuItems: SkuUpdateItem[]) => void
}) {
    const leafPaths = useLeafPaths()
    const categoryNames = leafPaths.find((p) => p.id === categoryId)?.names ?? []
    const active = useActiveSection()

    // 两个提交按钮共用一次校验：按下时先记模式，再交给 form.handleSubmit
    const mode = useRef<SubmitMode>("submit")

    // 销售规格网格最新值：SalesInfoSection 上报，随发布一起 updateSkus
    const skuItemsRef = useRef<SkuUpdateItem[]>([])

    const form = useAppForm({
        defaultValues: { mainImage: "", name: "", subtitle: "" } as BasicStepValues,
        onSubmit: ({ value }) => onSubmit(value, mode.current, skuItemsRef.current),
    })

    function submitAs(next: SubmitMode) {
        mode.current = next
        void form.handleSubmit()
    }

    return (
        <form.AppForm>
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

                    <SectionCard
                        id="section-basic"
                        title="基础信息"
                    >
                        <form.AppField
                            name="mainImage"
                            validators={{
                                onSubmit: ({ value }) => (value ? undefined : "请填写主图"),
                            }}
                        >
                            {(field) => (
                                <FieldRow
                                    label="主图"
                                    required
                                    htmlFor="pf-main-image"
                                    error={firstFieldError(field)}
                                    hint="列表缩略图与详情首图共用，建议 1:1 正方形、800×800 以上（图片上传待接入，先填 URL）"
                                >
                                    <div className="flex items-start gap-3">
                                        <MainImagePreview url={field.state.value} />
                                        <Input
                                            id="pf-main-image"
                                            value={field.state.value}
                                            placeholder="https://…/main.jpg"
                                            maxLength={255}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                            onBlur={field.handleBlur}
                                            className="h-10 flex-1 bg-background"
                                        />
                                    </div>
                                </FieldRow>
                            )}
                        </form.AppField>

                        <form.AppField
                            name="name"
                            validators={{ onBlur: ProductNameSchema, onSubmit: ProductNameSchema }}
                        >
                            {(field) => (
                                <FieldRow
                                    label="商品标题"
                                    required
                                    htmlFor="pf-name"
                                    error={firstFieldError(field)}
                                    hint="买家搜索靠它命中，把品牌、品类、核心属性写进去"
                                >
                                    <CountedInput
                                        id="pf-name"
                                        value={field.state.value}
                                        max={30}
                                        placeholder="如：宠物智能喂食器 定时定量 大容量"
                                        invalid={Boolean(firstFieldError(field))}
                                        onChange={field.handleChange}
                                        onBlur={field.handleBlur}
                                    />
                                </FieldRow>
                            )}
                        </form.AppField>

                        <form.AppField
                            name="subtitle"
                            validators={{
                                onBlur: SellingPointSchema,
                                onSubmit: SellingPointSchema,
                            }}
                        >
                            {(field) => (
                                <FieldRow
                                    label="商品卖点"
                                    htmlFor="pf-subtitle"
                                    error={firstFieldError(field)}
                                    hint="选填；填了就写 10~30 字，展示在商品详情页标题下方"
                                >
                                    <CountedInput
                                        id="pf-subtitle"
                                        value={field.state.value}
                                        max={30}
                                        placeholder="如：定时定量不撑食，断电续航 72 小时"
                                        invalid={Boolean(firstFieldError(field))}
                                        onChange={field.handleChange}
                                        onBlur={field.handleBlur}
                                    />
                                </FieldRow>
                            )}
                        </form.AppField>
                    </SectionCard>

                    <SalesInfoSection
                        categoryId={categoryId}
                        onApply={(selections) => applySpecs(form.state.values, selections)}
                        onSpecsChange={() => undefined}
                        onItemsChange={(items) => {
                            skuItemsRef.current = items
                        }}
                    />
                </div>

                <ActionBar
                    submitting={submitting}
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
    onSubmit,
    onSaveDraft,
}: {
    submitting: boolean
    onSubmit: () => void
    onSaveDraft: () => void
}) {
    return (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-background/90 py-3 backdrop-blur">
            <div className="mx-auto flex w-full max-w-[1184px] items-center justify-center gap-3 px-6">
                <Button
                    type="button"
                    disabled={submitting}
                    onClick={onSubmit}
                    className="h-10 px-10"
                >
                    {submitting ? "提交中…" : "提交商品信息"}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    disabled={submitting}
                    onClick={onSaveDraft}
                    className="h-10 px-6"
                >
                    保存草稿
                </Button>
            </div>
        </div>
    )
}

/** 主图预览：填了 URL 才显示图，加载失败退回占位（不做上传，先给个「填得对不对」的即时反馈） */
function MainImagePreview({ url }: { url: string }) {
    const [broken, setBroken] = useState(false)

    useEffect(() => setBroken(false), [url])

    if (!url || broken) {
        return (
            <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground/60">
                <ImageOff className="size-5" />
            </div>
        )
    }
    return (
        <img
            src={url}
            alt="主图预览"
            className="size-20 shrink-0 rounded-lg bg-muted object-cover"
            onError={() => setBroken(true)}
        />
    )
}

/** 锚点页签的高亮跟随滚动：取当前视口内最靠上的区块 */
function useActiveSection(): string {
    const [active, setActive] = useState<string>(SECTIONS[0].id)

    useEffect(() => {
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

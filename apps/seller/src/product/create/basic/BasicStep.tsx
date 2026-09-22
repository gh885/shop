import { editRules } from "#/product/edit-rules"
import type { ProductStatus } from "@shop/api/sdk"

import type {
    ListingTime,
    ProductBasicForm,
    SkuDraftRow,
    SpecSelection,
} from "#/product/draft-model"

import { BasicInfoSection } from "./BasicInfoSection"
import { DetailImagesSection } from "./DetailImagesSection"
import { SalesInfoSection } from "./SalesInfoSection"
import { uploadProductImage, useLeafPaths } from "../../queries"
import { CheckCircle2, ChevronRight, Badge, ListTree } from "lucide-react"
import { useState, useRef, useEffect, Fragment } from "react"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
    Button,
    Skeleton,
    Spinner,
    Tabs,
    TabsList,
    TabsTrigger,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    useAppForm,
} from "@shop/ui-web"

/** 吸顶页签占位（h-12 + mb-4）：发布页是窗口级滚动，页签吸在视口最顶，
    锚点滚动让位与滚动侦测都按这个高度算（顶栏已随内容滚走，不再计入） */
const TAB_BAR_SPACE = 64

/** 页内区块：顺序即页签顺序，id 即锚点。后续「图文描述」在这里追加 */
const SECTIONS = [
    { id: "section-category", label: "当前类目" },
    { id: "section-basic", label: "基础信息" },
    { id: "section-sales", label: "销售信息" },
    { id: "section-detail", label: "图文详情" },
] as const

// 图片上传：X-Shop-Id 店铺上下文由 SDK client 拦截自动注入
const uploadImage = (file: File) => uploadProductImage(file)

/** basic 表单字段值（形状单一来源是 draft-model 的 ProductBasicForm，此处只保留表单语境的名字） */
export type BasicStepValues = ProductBasicForm

/**
 * 表单默认值（须为**模块级稳定引用**）。
 *
 * TanStack Form 的 {@code update()} 在每次渲染比较传入的 {@code defaultValues} 引用：若引用变了且表单未被触碰
 * （{@code !isTouched}），会把 values 重置回 defaultValues。若这里用每次渲染新建的对象字面量，则编辑回显
 * {@code form.reset(initialBasic)} 填入的值会在下一次渲染被重置回空（「出现一下就没」）。保持同一引用可避免该坑。
 */
const BASIC_DEFAULT_VALUES: BasicStepValues = {
    images: [],
    name: "",
    subtitle: "",
    detailImages: [],
}

/**
 * 提交方式：草稿与提交走同一份校验、同一个建档接口，只是落地后去向不同。
 *  - submit    立即上架（上架时间=立即上架，发布后 PUBLISHED）
 *  - warehouse 放入仓库（上架时间=放入仓库，落 WAREHOUSE，不在售）
 *  - draft     保存草稿（仍是 DRAFT，下次可继续编辑）
 * 三种都走 updateSkus；仅 submit 触发 publish。warehouse 的目标态由后端 publish target 支撑。
 */
export type SubmitMode = "submit" | "warehouse" | "draft"

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
    productStatus,
    submitting,
    creating,
    onSwitchCategory,
    selections,
    skuRows,
    onSelectionsChange,
    onSkuRowsChange,
    submit,
    onBasicChange,
    initialBasic,
}: {
    categoryId: string
    /** 编辑已有商品当前状态（新建 undefined）：驱动 edit-rules 会话能力表（类目可改/规格冻结/能否发布/价格必填） */
    productStatus?: ProductStatus
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
    /** 编辑回显：detail 拉回后的 basic 初值，仅首帧灌 form（经 form.reset）；新建为 undefined */
    initialBasic?: BasicStepValues
}) {
    const leafPaths = useLeafPaths()
    const categoryNames = leafPaths.find((p) => p.id === categoryId)?.names ?? []
    const active = useActiveSection()

    // 编辑约束（对齐后端「状态 × 字段」矩阵）：
    //  - 切类目：仅草稿可改（或新建）；仓库中/上架须先下架（结构性变更）。
    //  - 规格冻结：上架商品规格不可改（价格/库存仍可运营），改规格要先下架。
    // 是否「新建 / 草稿态」编辑：决定能否切类目、显示上架时间、以及操作条是否提供「保存草稿+发布」——
    // 仓库中/上架商品已不可回草稿，操作条只剩「保存变更」（严格校验 + 不发布）。
    // 编辑约束统一来自 edit-rules 表（后端 ProductStatus 状态机的声明式镜像），不再散落推导：
    //  - 切类目：仅 DRAFT（含新建）可改——类目是结构性字段，发布后（含仓库中）不可改
    //  - 规格冻结：PUBLISHED 禁改规格（价格/库存仍可运营），改规格先下架
    //  - 上架时间/发布：仅 DRAFT（含新建）会话有发布目标；仓库/上架只剩「保存变更」（状态不回退）
    const rules = editRules(productStatus)
    const canSwitchCategory = rules.switchCategory
    const specsLocked = !rules.specsEditable
    const listingTimeEditable = rules.publishTargets !== undefined
    const canSaveDraft = rules.publishTargets !== undefined
    const editingNotice = rules.notice

    // 上架时间：决定「提交商品信息」落 PUBLISHED 还是 WAREHOUSE。
    // 默认立即上架；定时上架本轮不做。
    const [listingTime, setListingTime] = useState<ListingTime>("now")

    // 提交方式在点击时由「上架时间」推导：立即上架→submit，放入仓库→warehouse；保存草稿→draft
    const mode = useRef<SubmitMode>("submit")
    // 防抖回调用 ref：避免 subscribe 里每次重渲染触发不稳定闭包
    const basicChangeRef = useRef(onBasicChange)
    useEffect(() => {
        basicChangeRef.current = onBasicChange
    }, [onBasicChange])

    const form = useAppForm({
        defaultValues: BASIC_DEFAULT_VALUES,
        onSubmit: ({ value }) => void submit(value, mode.current),
    })

    // 表单值变化上报（脏标记/防抖 autosave）：副作用必须在 effect 里跑，不能放进渲染期——
    // 原先写在 form.Subscribe 的 render-prop 回调里，等于在 TanStack Form 内部组件（LocalSubscribe）
    // 渲染期间 setState 父级 NewProductBasicStep，触发 React 的 setState-in-render 告警。
    // 改为在 effect 里直接订阅 store（listener 收到新 state），值不变则不触发，行为与之前等价；
    // 不引入新依赖：@tanstack/react-store 未在 seller 声明，form.store 是 FormApi 自带能力。
    useEffect(() => {
        const sub = form.store.subscribe((state) => {
            basicChangeRef.current(state.values)
        })
        return () => sub.unsubscribe()
    }, [form])

    // 编辑回显：detail 拉回后把 basic 字段灌进表单（form.reset 同时更新 defaultValues）。
    // key：用 ref 记录已灌的商品 id 来源，避免后续重渲染反复重置用户输入。
    // 若用户已在表单里打字（值非空），说明回灌前已输入——跳过 reset，避免用服务端旧值洗掉用户输入。
    const hydratedRef = useRef(false)
    useEffect(() => {
        if (!initialBasic || hydratedRef.current) return
        const untouched =
            !form.state.values.name &&
            !form.state.values.subtitle &&
            form.state.values.images.length === 0 &&
            form.state.values.detailImages.length === 0
        if (untouched) {
            hydratedRef.current = true
            // keepDefaultValues：reset 只改 values、不改 this.options.defaultValues，保持其指向模块级稳定常量，
            // 避免下一次渲染 update() 因 defaultValues 引用变化把刚回填的 values 重置回空。
            form.reset({ ...initialBasic }, { keepDefaultValues: true })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialBasic])

    function submitAs(next: SubmitMode) {
        // 「保存草稿」无门槛：不触发 onSubmit 全字段校验，直接把当前值交给 submit(mode=draft)。
        //（提交/发布才需要标题/图片/SKU 价齐，走 handleSubmit 触发校验。）
        if (next === "draft") {
            void submit(form.state.values, "draft")
            return
        }
        mode.current = next
        void form.handleSubmit()
    }

    // 上架时间 → 提交模式：立即上架走 submit；放入仓库走 warehouse
    function submitAsListing(listing: ListingTime) {
        submitAs(listing === "warehouse" ? "warehouse" : "submit")
    }

    return (
        <form
            className="pb-24"
            onSubmit={(e) => {
                e.preventDefault()
                submitAs(mode.current)
            }}
        >
            <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">填写商品信息</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        带 <span className="text-destructive">*</span>{" "}
                        为必填；点「保存草稿」或「提交商品信息」时才会保存
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

            <div className="sticky top-0 z-30 -mx-6 mb-4 px-6">
                <div className="flex h-12 w-full items-center rounded-xl bg-background px-2 shadow-sm">
                    <Tabs
                        value={active}
                        onValueChange={(next) => scrollToSection(String(next))}
                        className="w-full"
                    >
                        <TabsList
                            variant="line"
                            className="h-full w-full justify-start"
                        >
                            {SECTIONS.map((section) => (
                                <TabsTrigger
                                    key={section.id}
                                    value={section.id}
                                    size="lg"
                                    className="flex-none"
                                >
                                    {section.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            <div className="space-y-6">
                {/* 当前类目：千牛式紧凑单项条（白底薄卡 + 面包屑 + 右侧切换），不走大头卡片 */}
                <div
                    id="section-category"
                    className="flex scroll-mt-16 items-center gap-3 rounded-xl bg-background px-4 py-3 shadow-sm"
                >
                    <ListTree className="size-4 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 text-sm text-muted-foreground">当前类目</span>
                    {categoryNames.length > 0 ? (
                        <Breadcrumb className="min-w-0 flex-1">
                            <BreadcrumbList className="flex-nowrap overflow-hidden whitespace-nowrap">
                                {categoryNames.map((name, i) => (
                                    <Fragment key={name}>
                                        {i > 0 && <BreadcrumbSeparator />}
                                        <BreadcrumbItem>
                                            {i === categoryNames.length - 1 ? (
                                                <BreadcrumbPage>{name}</BreadcrumbPage>
                                            ) : (
                                                name
                                            )}
                                        </BreadcrumbItem>
                                    </Fragment>
                                ))}
                            </BreadcrumbList>
                        </Breadcrumb>
                    ) : (
                        <Skeleton className="h-4 w-40 shrink-0" />
                    )}
                    <Tooltip disabled={canSwitchCategory}>
                        <TooltipTrigger
                            render={
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={!canSwitchCategory}
                                    className="shrink-0"
                                    onClick={onSwitchCategory}
                                >
                                    切换类目
                                </Button>
                            }
                        />
                        <TooltipContent>类目在发布时确定，发布后不可修改</TooltipContent>
                    </Tooltip>
                </div>

                <BasicInfoSection
                    form={form}
                    uploadImage={uploadImage}
                />

                {editingNotice ? (
                    <div
                        role="note"
                        className="rounded-xl bg-muted px-4 py-2.5 text-sm text-muted-foreground"
                    >
                        {editingNotice}
                    </div>
                ) : undefined}

                <SalesInfoSection
                    fileUpload={uploadImage}
                    categoryId={categoryId}
                    selections={selections}
                    skuRows={skuRows}
                    listingTime={listingTime}
                    specsLocked={specsLocked}
                    listingTimeEditable={listingTimeEditable}
                    onSelectionsChange={onSelectionsChange}
                    onSkuRowsChange={onSkuRowsChange}
                    onListingTimeChange={setListingTime}
                />

                <DetailImagesSection
                    form={form}
                    uploadImage={uploadImage}
                />
            </div>

            <ActionBar
                submitting={submitting}
                creating={creating}
                onSubmit={() => submitAsListing(listingTime)}
                onSaveDraft={() => submitAs("draft")}
                draftEditable={canSaveDraft}
            />
        </form>
    )
}

/** 底部固定操作条：通栏铺满，内容与主区同宽对齐 */
function ActionBar({
    submitting,
    creating,
    onSubmit,
    onSaveDraft,
    draftEditable,
}: {
    submitting: boolean
    creating: boolean
    onSubmit: () => void
    onSaveDraft: () => void
    /** 草稿态编辑才提供「保存草稿」；仓库中/上架商品不可回草稿，仅保留「保存变更」 */
    draftEditable: boolean
}) {
    return (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 py-3 backdrop-blur">
            <div className="mx-auto flex w-full max-w-narrow items-center justify-end gap-3 px-6">
                {draftEditable ? (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={submitting || creating}
                        onClick={onSaveDraft}
                        className="h-10"
                    >
                        保存草稿
                    </Button>
                ) : undefined}
                <Button
                    type="button"
                    disabled={submitting || creating}
                    onClick={onSubmit}
                    className="h-10"
                >
                    {(submitting || creating) && <Spinner />}
                    {draftEditable ? "提交商品信息" : "保存变更"}
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
                current = SECTIONS.at(-1)!.id
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

import { editRules } from "#/product/edit-rules"
import type { ProductStatus } from "@shop/api/sdk"
import type { FormEvent } from "react"

import { EMPTY_PRODUCT_BASIC_FORM } from "#/product/draft-model"
import type {
    ListingTime,
    ProductBasicForm,
    SkuDraftRow,
    SpecSelection,
} from "#/product/draft-model"

import { BasicInfoSection } from "./BasicInfoSection"
import { DetailImagesSection } from "./DetailImagesSection"
import type { BasicForm } from "./form-instance"
import { useForbiddenWordMark } from "./forbidden-word-mark"
import { SalesInfoSection } from "./SalesInfoSection"
import type { ForbiddenHit } from "../../forbidden-word"
import { UploadTicketFailure, uploadProductImage, useLeafPaths } from "../../queries"
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
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"
import { scrollToElement } from "@shop/common/domain"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { serverFieldErrorTexts, submitForm } from "@shop/app-kit/forms"
import type { AppLocale } from "@shop/common/i18n"
import { useT } from "#/locales/use-t"

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

// 图片上传：X-Shop-Id 店铺上下文由 SDK client 拦截自动注入；失败的那句话由本区按 locale 定稿
// （见下 uploadImage），所以它必须是组件里的闭包，不能留在模块作用域。

/** basic 表单字段值（形状单一来源是 draft-model 的 ProductBasicForm，此处只保留表单语境的名字） */
export type BasicStepValues = ProductBasicForm

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
/** 发布第二步（整体壳）的入参：外部只给「商品状态 + 草稿接线 + 表单接线」，分区数据由外层持有 */
type BasicStepProps = {
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
    /** 上一次提交被违禁词闸门（COM-01）拦下的命中：定位到标题/卖点字段就地标红；没有则 undefined */
    forbiddenWord?: ForbiddenHit
}

// 抑制理由：这是个纯编排组件——把 6 个 hook 的结果与 13 个 prop 装配给三个子组件
// （BasicStepHeader / StepBody / ActionBar），自身没有分支逻辑（cc 仅 3，CRAP 远在门槛下）。
// 认知复杂度与体积超线都来自「把整张发布表单的接线集中在这一处」，那是它的职责；
// 真要降只能把接线散给子组件，那是拿结构换指标、把一处可见的装配变成三处不可见的。
// fallow-ignore-next-line complexity
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
    forbiddenWord,
}: BasicStepProps) {
    const leafPaths = useLeafPaths()
    const categoryNames = leafPaths.find((p) => p.id === categoryId)?.names ?? []
    const active = useActiveSection()

    const { locale } = useI18n()
    const t = useT()
    // ImageUpload 这块皮肤只读 `error.message`，所以递给它之前把错误压成一句本 locale 的话：
    // 中文界面是后端那个具体原因（如「文件存储未配置」），其它语言是「取凭证失败」那句场景文案。
    // 直传七牛那一发是本层自己写的句子，原样透给皮肤。
    const uploadImage = (file: File) => toLocalizedUploadError(file, locale, t)

    // 表单与提交：值变化上报（防抖 autosave）、编辑回显、上架时间与三种提交方式都在这个 hook 里
    const { form, submitAs, listingTime, setListingTime, submitForListing } = useBasicForm({
        submit,
        onBasicChange,
        initialBasic,
    })

    useForbiddenWordMark({ form, hit: forbiddenWord })

    // 编辑约束来自 edit-rules 表（后端 ProductStatus 状态机的声明式镜像）：类目仅 DRAFT 可改、
    // PUBLISHED 冻结规格、只有 DRAFT 会话有发布目标（仓库/上架只剩「保存变更」，状态不回退）。
    const rules = editRules(productStatus)

    // 提交动作提成具名 handler：原先直接内联在 JSX 上（onSubmit / onSaveDraft），
    // 内联箭头会被健康扫描按嵌套计入认知复杂度，而这里并没有嵌套语义——
    // 主组件是纯装配，认知复杂度应该留给真正需要分支的地方（门槛 15）
    const handleFormSubmit = (e: FormEvent) => {
        e.preventDefault()
        submitAs()
    }
    const handleSaveDraft = () => submitAs("draft")

    return (
        <form
            className="pb-24"
            onSubmit={handleFormSubmit}
        >
            <BasicStepHeader />
            <SectionTabs active={active} />

            <StepBody
                form={form}
                categoryId={categoryId}
                categoryNames={categoryNames}
                rules={rules}
                onSwitchCategory={onSwitchCategory}
                selections={selections}
                skuRows={skuRows}
                listingTime={listingTime}
                onListingTimeChange={setListingTime}
                onSelectionsChange={onSelectionsChange}
                onSkuRowsChange={onSkuRowsChange}
                uploadImage={uploadImage}
            />

            <ActionBar
                submitting={submitting}
                creating={creating}
                onSubmit={submitForListing}
                onSaveDraft={handleSaveDraft}
                draftEditable={rules.publishTargets !== undefined}
            />
        </form>
    )
}

/** 页内主体：当前类目条 + 三个分区卡片（顺序即页签顺序） */
function StepBody({
    form,
    categoryId,
    categoryNames,
    rules,
    onSwitchCategory,
    selections,
    skuRows,
    listingTime,
    onListingTimeChange,
    onSelectionsChange,
    onSkuRowsChange,
    uploadImage,
}: {
    form: BasicForm
    categoryId: string
    categoryNames: string[]
    rules: SessionRules
    onSwitchCategory: () => void
    selections: SpecSelection[]
    skuRows: SkuDraftRow[]
    listingTime: ListingTime
    onListingTimeChange: (listing: ListingTime) => void
    onSelectionsChange: (selections: SpecSelection[]) => void
    onSkuRowsChange: (rows: SkuDraftRow[]) => void
    /** 已按 locale 定稿过错误句子的上传入口（见 BasicStep 里的 uploadImage） */
    uploadImage: (file: File) => Promise<string>
}) {
    return (
        <div className="space-y-6">
            {/* 当前类目：千牛式紧凑单项条（白底薄卡 + 面包屑 + 右侧切换），不走大头卡片 */}
            <CategoryBar
                names={categoryNames}
                canSwitch={rules.switchCategory}
                onSwitch={onSwitchCategory}
            />
            <StepSections
                form={form}
                categoryId={categoryId}
                rules={rules}
                selections={selections}
                skuRows={skuRows}
                listingTime={listingTime}
                onListingTimeChange={onListingTimeChange}
                onSelectionsChange={onSelectionsChange}
                onSkuRowsChange={onSkuRowsChange}
                uploadImage={uploadImage}
            />
        </div>
    )
}

/** 编辑约束（edit-rules 表的产物）在三个分区里的投影：类目可改、规格冻结、能否选上架目标 */
type SessionRules = ReturnType<typeof editRules>

/** 三个分区卡片：基础信息（+编辑提示）· 销售信息 · 图文详情 */
function StepSections({
    form,
    categoryId,
    rules,
    selections,
    skuRows,
    listingTime,
    onListingTimeChange,
    onSelectionsChange,
    onSkuRowsChange,
    uploadImage,
}: {
    form: BasicForm
    categoryId: string
    rules: SessionRules
    selections: SpecSelection[]
    skuRows: SkuDraftRow[]
    listingTime: ListingTime
    onListingTimeChange: (listing: ListingTime) => void
    onSelectionsChange: (selections: SpecSelection[]) => void
    onSkuRowsChange: (rows: SkuDraftRow[]) => void
    uploadImage: (file: File) => Promise<string>
}) {
    return (
        <>
            <BasicInfoSection
                form={form}
                uploadImage={uploadImage}
            />

            {rules.notice ? (
                <div
                    role="note"
                    className="rounded-xl bg-muted px-4 py-2.5 text-sm text-muted-foreground"
                >
                    {rules.notice}
                </div>
            ) : undefined}

            <SalesInfoSection
                fileUpload={uploadImage}
                categoryId={categoryId}
                selections={selections}
                skuRows={skuRows}
                listingTime={listingTime}
                specsLocked={!rules.specsEditable}
                listingTimeEditable={rules.publishTargets !== undefined}
                onSelectionsChange={onSelectionsChange}
                onSkuRowsChange={onSkuRowsChange}
                onListingTimeChange={onListingTimeChange}
            />

            <DetailImagesSection
                form={form}
                uploadImage={uploadImage}
            />
        </>
    )
}

/** 页头：标题 + 必填说明 + 流程步骤（第一步已完成，当前停在第二步） */
function BasicStepHeader() {
    return (
        <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
                <h1 className="text-xl font-bold">填写商品信息</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    带 <span className="text-destructive">*</span>{" "}
                    为必填；点「保存草稿」或「提交商品信息」时才会保存
                </p>
            </div>
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
    )
}

/** 吸顶锚点页签：点一下滚到对应区块，高亮跟随滚动（见 useActiveSection） */
function SectionTabs({ active }: { active: string }) {
    return (
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
    )
}

/** 当前类目条：面包屑 + 「切换类目」（仅 DRAFT 会话可点，其余给 tooltip 说明为什么锁着） */
function CategoryBar({
    names,
    canSwitch,
    onSwitch,
}: {
    names: string[]
    canSwitch: boolean
    onSwitch: () => void
}) {
    return (
        <div
            id="section-category"
            className="flex scroll-mt-16 items-center gap-3 rounded-xl bg-background px-4 py-3 shadow-sm"
        >
            <ListTree className="size-4 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-sm text-muted-foreground">当前类目</span>
            {names.length > 0 ? (
                <Breadcrumb className="min-w-0 flex-1">
                    <BreadcrumbList className="flex-nowrap overflow-hidden whitespace-nowrap">
                        {names.map((name, i) => (
                            <Fragment key={name}>
                                {i > 0 && <BreadcrumbSeparator />}
                                <BreadcrumbItem>
                                    {i === names.length - 1 ? (
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
            <Tooltip disabled={canSwitch}>
                <TooltipTrigger
                    render={
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!canSwitch}
                            className="shrink-0"
                            onClick={onSwitch}
                        >
                            切换类目
                        </Button>
                    }
                />
                <TooltipContent>类目在发布时确定，发布后不可修改</TooltipContent>
            </Tooltip>
        </div>
    )
}

/**
 * 表单的两条副作用接线：值变化上报（防抖 autosave）与编辑回显（detail 拉回后首帧 reset）。
 *
 * 两者都订阅 form store 而不是渲染期读：原先写在 form.Subscribe 的 render-prop 回调里，
 * 等于在 TanStack Form 内部组件（LocalSubscribe）渲染期间 setState 父级，触发 React 的
 * setState-in-render 告警。改为在 effect 里直接订阅 store（listener 收到新 state），
 * 值不变则不触发，行为与之前等价；不引入新依赖：@tanstack/react-store 未在 seller 声明，
 * form.store 是 FormApi 自带能力。
 */
function useBasicFormSync({
    form,
    onBasicChange,
    initialBasic,
}: {
    form: BasicForm
    onBasicChange: (values: BasicStepValues) => void
    initialBasic: BasicStepValues | undefined
}) {
    // 防抖回调用 ref：避免 subscribe 里每次重渲染触发不稳定闭包
    const basicChangeRef = useRef(onBasicChange)
    useEffect(() => {
        basicChangeRef.current = onBasicChange
    }, [onBasicChange])

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
        if (isBasicUntouched(form.state.values)) {
            hydratedRef.current = true
            // keepDefaultValues：reset 只改 values、不改 this.options.defaultValues，保持其指向模块级稳定常量，
            // 避免下一次渲染 update() 因 defaultValues 引用变化把刚回填的 values 重置回空。
            form.reset({ ...initialBasic }, { keepDefaultValues: true })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialBasic])
}

/** 表单还是空的（没打字、没图）才允许回灌编辑初值；否则服务端旧值会洗掉用户已输入 */
function isBasicUntouched(values: ProductBasicForm): boolean {
    return (
        !values.name &&
        !values.subtitle &&
        values.images.length === 0 &&
        values.detailImages.length === 0
    )
}

/**
 * 后端 `CreateProductRequest` / `UpdateProductRequest` 的字段路径 → 这张 basic 表单的框
 * （`{ 服务端: 表单 }` 白名单：没列进来的路径不落红）。
 *
 * <p>三处不显然的对应，都是「DTO 有这一格、表单没有那一个框」的产物：
 * - **`mainImage` 落在「商品图片」那一格**：`toBasicPayload` 把 `images[0]` 当主图发出去，
 *   表单里根本没有独立的「主图」输入，后端对 mainImage 说的话只能指回那一串图；
 * - **`images[i]` / `detailImages[i]`**（元素级 `@Size`）报的是带下标的路径，按当前值逐个列出来——
 *   少列一个下标，那一条就永远落不了地；
 * - **`categoryId` / `params[i].*` 不列**：类目是第一步定的（不在这张表单里），而 `params` 这条发布流程
 *   压根不发（`toBasicPayload` 里没有这一格），落进白名单也只会是永远命不中的死条目。
 *
 * <p>`detailImages` 列了但**今天看不见**：那一格只挂了 `FieldDescription`、没挂错误位
 * （`DetailImagesSection.tsx`，不在本次改动范围内）。补上那一条的瞬间这里就已经是通的。
 */
export function productBasicServerFieldMap(values: ProductBasicForm): Record<string, string> {
    const map: Record<string, string> = {
        name: "name",
        subtitle: "subtitle",
        mainImage: "images",
        images: "images",
        detailImages: "detailImages",
    }
    for (const [index] of values.images.entries()) map[`images[${index}]`] = "images"
    for (const [index] of values.detailImages.entries()) {
        map[`detailImages[${index}]`] = "detailImages"
    }
    return map
}

/**
 * 后端 422 的字段级明细 → 标到 basic 表单对应的输入框上。
 *
 * 违禁词（COM-01）那条通道**不走这里**：它是 400 + `FORBIDDEN_WORD_HIT`，由 `useForbiddenWordMark`
 * 写进 `errorMap.onSubmit`（见 forbidden-word-mark.ts）。这里只写 `onServer`，两条各占一个槽位，
 * 谁也不覆盖谁。
 */
export function markProductBasicFieldErrors(
    form: BasicForm,
    error: unknown,
    locale: AppLocale,
): void {
    applyServerFieldErrors(
        form,
        serverFieldErrorTexts(error, locale, productBasicServerFieldMap(form.state.values)),
    )
}

/**
 * 发布第二步的表单本体：实例 + 三种提交方式。
 *
 * 提交方式存在 ref 里（用户点哪个就是哪个，表单自己不猜默认模式），而表单的 onSubmit
 * 回调要读它——所以 ref 与 form 必须在同一个 hook 里建，不能由调用方拆开传。
 *
 * - 值变化上报（防抖 autosave）与编辑回显都订阅 form store，副作用一律在 effect 里跑；
 * - `submitAs()` 不带参数 = 「按当前方式提交」（表单 onSubmit / 回车），带参数 = 点某个按钮；
 * - 上架时间也在这个 hook 里：它只决定「点提交时用哪种方式」，与表单值无关但与提交方式成对。
 */
function useBasicForm({
    submit,
    onBasicChange,
    initialBasic,
}: {
    submit: (values: BasicStepValues, mode: SubmitMode) => Promise<void>
    /** 表单字段值变化上报（父级做防抖 autosave 落库） */
    onBasicChange: (values: BasicStepValues) => void
    /** 编辑回显：detail 拉回后的 basic 初值，仅首帧灌 form（经 form.reset）；新建为 undefined */
    initialBasic?: BasicStepValues
}) {
    const modeRef = useRef<SubmitMode>("submit")
    const { locale } = useI18n()
    const form = useAppForm({
        defaultValues: EMPTY_PRODUCT_BASIC_FORM,
        onSubmit: async ({ value }) => {
            try {
                await submit(value, modeRef.current)
            } catch (error) {
                // 422 的字段级明细落到那一个框上（此前整条链路只有页顶那一句横幅，说不清是哪一格）。
                // 调用方（路由）在横幅之后把错误继续抛出，这条通道才收得到 422
                markProductBasicFieldErrors(form, error, locale)
                // 抛出：form-core 才会把 isSubmitSuccessful 复位；接住 rejection 是 submitForm 的事
                throw error
            }
        },
    })

    useBasicFormSync({ form, onBasicChange, initialBasic })

    // 上架时间：决定「提交商品信息」落 PUBLISHED 还是 WAREHOUSE。默认立即上架；定时上架本轮不做。
    const [listingTime, setListingTime] = useState<ListingTime>("now")

    /**
     * 「保存草稿」无门槛：不触发 onSubmit 全字段校验，直接把当前值交给 `submit(mode=draft)`。
     * （提交/发布才需要标题/图片/SKU 价齐，走 handleSubmit 触发校验。）
     * 但它同样要落 422、同样需要一个接 rejection 的出口，所以照旧交给 `submitForm`——
     * 那个函数只要求对象**有** `handleSubmit`（返回 promise），不要求它是表单本尊。
     */
    const submitDraft = async () => {
        try {
            await submit(form.state.values, "draft")
        } catch (error) {
            markProductBasicFieldErrors(form, error, locale)
            throw error
        }
    }

    const submitAs = (next?: SubmitMode) => {
        if (next === undefined) {
            // 不写 void form.handleSubmit()：void 不接 rejection，抛出的错误会变成未处理的异步异常
            void submitForm(form)
            return
        }
        if (next === "draft") {
            void submitForm({ handleSubmit: submitDraft })
            return
        }
        modeRef.current = next
        void submitForm(form)
    }

    // 上架时间 → 提交方式：立即上架走 submit；放入仓库走 warehouse
    const submitForListing = () => submitAs(listingTime === "warehouse" ? "warehouse" : "submit")

    return { form, submitAs, listingTime, setListingTime, submitForListing }
}

/** 底部固定操作条：通栏铺满，内容与主区同宽对齐 */
// fallow-ignore-next-line complexity -- 操作条的两按钮是同一形状的重复，分支只是「草稿态能不能回草稿」这一个判空
/**
 * 直传图片，并把「取凭证失败」压成本 locale 的一句。
 *
 * ImageUpload 这块皮肤只读 `error.message`，所以递给它之前要把错误压成一句话：
 * 中文界面是后端那个具体原因（如「文件存储未配置」），其它语言是「取凭证失败」那句场景文案。
 * 直传七牛那一发的错是本层自己写的句子，原样透给皮肤（不套这条）。
 * 抽成模块级函数是为了把 instanceof 那一支从 BasicStep 的认知复杂度里摘出去
 * （健康扫描的 maxCognitive 是 15，而 BasicStep 主体是编排 + 装配，不该背着这个分支）。
 */
function toLocalizedUploadError(
    file: File,
    locale: AppLocale,
    t: ReturnType<typeof useT>,
): Promise<string> {
    return uploadProductImage(file).catch((error: unknown): never => {
        if (error instanceof UploadTicketFailure) {
            throw new Error(errorText(error.apiError, locale, t(error.sceneKey)), { cause: error })
        }
        throw error
    })
}

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
    // 「正在提交」是 submitting || creating 一个概念，收成一处：原来它散在三处各自写一遍，
    // 是本函数 cc 的一半（健康扫描的 CRAP 门槛卡在 cc 5）
    const busy = submitting || creating
    return (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 py-3 backdrop-blur">
            <div className="mx-auto flex w-full max-w-narrow items-center justify-end gap-3 px-6">
                {draftEditable ? (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={onSaveDraft}
                        className="h-10"
                    >
                        保存草稿
                    </Button>
                ) : undefined}
                <SubmitButton
                    busy={busy}
                    draftEditable={draftEditable}
                    onClick={onSubmit}
                />
            </div>
        </div>
    )
}

/** 主按钮：草稿态是「提交商品信息」，其余是「保存变更」；忙碌时带转圈 */
function SubmitButton({
    busy,
    draftEditable,
    onClick,
}: {
    busy: boolean
    draftEditable: boolean
    onClick: () => void
}) {
    return (
        <Button
            type="button"
            disabled={busy}
            onClick={onClick}
            className="h-10"
        >
            {busy && <Spinner />}
            {draftEditable ? "提交商品信息" : "保存变更"}
        </Button>
    )
}

/** 锚点页签的高亮跟随滚动：当前滚动光标（页签吸顶高度处）落在哪个区块，就激活对应页签。
    用滚动位置比较而非 IntersectionObserver：IO 只在交叉状态改变时回调，连续滚动时可能不触发，
    导致高亮滞后；位置比较则实时、稳定。 */
function useActiveSection(): string {
    const [active, setActive] = useState<string>(SECTIONS[0].id)

    useEffect(() => {
        const compute = () => setActive(currentSectionId())

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

/** 当前滚动光标（页签吸顶高度处）落在哪个区块；滚到最底时强制落在最后一块 */
// fallow-ignore-next-line complexity -- 滚动光标落在哪个区块的扫面：循环 + 「已越过吸顶线」+ 「滚到底兜底」三条规则就是全部语义
function currentSectionId(): string {
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
    return current
}

function scrollToSection(id: string) {
    scrollToElement(id)
}

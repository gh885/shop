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
import { useLeafPaths } from "../../queries"
import {
    UploadDirectFailureError,
    UploadTicketFailure,
    UploadTicketInvalidError,
    uploadProductImage,
} from "../../upload"
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
import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import type { AppLocale } from "@shop/i18n"
import { useT } from "#/locales/use-t"
import type { SellerMessageKey, SellerTranslate } from "#/locales/messages.gen"

// 吸顶页签占位高度（h-12+mb-4）：锚点滚动让位与滚动侦测都按这个数算（顶栏已滚走不计入）
const TAB_BAR_SPACE = 64

const SECTIONS = [
    { id: "section-category", labelKey: "product.basic.section.category" },
    { id: "section-basic", labelKey: "product.basic.section.info" },
    { id: "section-sales", labelKey: "product.basic.section.sales" },
    { id: "section-detail", labelKey: "product.basic.section.detail" },
] as const satisfies ReadonlyArray<{ id: string; labelKey: SellerMessageKey }>

export type BasicStepValues = ProductBasicForm

// 三种提交方式都走 updateSkus；仅 submit 触发 publish（warehouse 的目标态由后端 publish target 支撑）
export type SubmitMode = "submit" | "warehouse" | "draft"

type BasicStepProps = {
    categoryId: string
    productStatus?: ProductStatus
    submitting: boolean
    creating: boolean
    onSwitchCategory: () => void
    selections: SpecSelection[]
    skuRows: SkuDraftRow[]
    onSelectionsChange: (selections: SpecSelection[]) => void
    onSkuRowsChange: (rows: SkuDraftRow[]) => void
    submit: (values: BasicStepValues, mode: SubmitMode) => Promise<void>
    onBasicChange: (values: BasicStepValues) => void
    initialBasic?: BasicStepValues
    forbiddenWord?: ForbiddenHit
}

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

    const t = useT()
    const { locale } = useI18n()
    const uploadImage = (file: File) => toLocalizedUploadError(file, locale, t)

    const { form, submitAs, listingTime, setListingTime, submitForListing } = useBasicForm({
        submit,
        onBasicChange,
        initialBasic,
    })

    useForbiddenWordMark({ form, hit: forbiddenWord })

    // 编辑约束来自 edit-rules 表：类目仅 DRAFT 可改、PUBLISHED 冻结规格、只有 DRAFT 会话有发布目标
    const rules = editRules(productStatus)

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
                draftEditable={rules.canPublish}
            />
        </form>
    )
}

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
    uploadImage: (file: File) => Promise<string>
}) {
    return (
        <div className="space-y-6">
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

type SessionRules = ReturnType<typeof editRules>

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
    const t = useT()
    return (
        <>
            <BasicInfoSection
                form={form}
                uploadImage={uploadImage}
            />

            {rules.noticeKey ? (
                <div
                    role="note"
                    className="rounded-lg bg-muted px-4 py-2.5 text-sm text-muted-foreground"
                >
                    {t(rules.noticeKey)}
                </div>
            ) : undefined}

            <SalesInfoSection
                fileUpload={uploadImage}
                categoryId={categoryId}
                selections={selections}
                skuRows={skuRows}
                listingTime={listingTime}
                specsLocked={!rules.specsEditable}
                listingTimeEditable={rules.canPublish}
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

function BasicStepHeader() {
    const t = useT("product")
    return (
        <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
                <h1 className="text-xl font-bold">{t("product.basic.header.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t("product.basic.header.requiredPrefix")}{" "}
                    <span className="text-destructive">*</span>{" "}
                    {t("product.basic.header.requiredSuffix")}
                </p>
            </div>
            <ol className="flex items-center gap-1.5 text-sm">
                <li className="flex items-center gap-1.5 text-muted-foreground">
                    <CheckCircle2 className="size-4 text-success" />
                    {t("product.basic.header.stepCategory")}
                </li>
                <li aria-hidden="true">
                    <ChevronRight className="size-4 text-muted-foreground/40" />
                </li>
                <li className="flex items-center gap-1.5 font-medium text-foreground">
                    <Badge>2</Badge>
                    {t("product.basic.header.stepInfo")}
                </li>
            </ol>
        </header>
    )
}

function SectionTabs({ active }: { active: string }) {
    const t = useT("product")
    return (
        <div className="sticky top-0 z-sticky -mx-6 mb-4 px-6">
            <div className="flex h-12 w-full items-center rounded-lg bg-background px-2 shadow-sm">
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
                                {t(section.labelKey)}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>
        </div>
    )
}

function CategoryBar({
    names,
    canSwitch,
    onSwitch,
}: {
    names: string[]
    canSwitch: boolean
    onSwitch: () => void
}) {
    const t = useT("product")
    return (
        <div
            id="section-category"
            className="flex scroll-mt-16 items-center gap-3 rounded-lg bg-background px-4 py-3 shadow-sm"
        >
            <ListTree className="size-4 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-sm text-muted-foreground">
                {t("product.basic.category.label")}
            </span>
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
                            {t("product.basic.category.switch")}
                        </Button>
                    }
                />
                <TooltipContent>{t("product.basic.category.switchLockedNotice")}</TooltipContent>
            </Tooltip>
        </div>
    )
}

// 仅订阅值变化；Editor 在回填完成后才挂表单，defaultValues 就是本会话初值
function useBasicFormSync({
    form,
    onBasicChange,
}: {
    form: BasicForm
    onBasicChange: (values: BasicStepValues) => void
}) {
    const basicChangeRef = useRef(onBasicChange)
    useEffect(() => {
        basicChangeRef.current = onBasicChange
    }, [onBasicChange])
    useEffect(() => {
        const sub = form.store.subscribe((state) => basicChangeRef.current(state.values))
        return () => sub.unsubscribe()
    }, [form])
}

// 服务端 DTO 字段路径 → basic 表单框的白名单（没列进来的不落红）：mainImage 落回 images（表单无独立主图框，toBasicPayload 发的是 images[0]）；
// images[i]/detailImages[i] 按当前值逐个列全下标（少一个那条就永远落不了地）；categoryId/params 故意不列（前者第一步定的、后者这条流程不发）
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

// 后端 422 字段级明细 → 只写 onServer 槽；违禁词（400）走 useForbiddenWordMark 写 onSubmit 槽，两条各占一位不互相覆盖
export function markProductBasicFieldErrors(form: BasicForm, error: unknown): void {
    applyServerFieldErrors(
        form,
        serverFieldErrors(error, productBasicServerFieldMap(form.state.values)),
    )
}

// 提交方式存在 ref（用户点哪个就是哪个，表单不猜默认）而 onSubmit 回调要读它 → ref 与 form 必须建在同一个 hook 里，不能拆开传
function useBasicForm({
    submit,
    onBasicChange,
    initialBasic,
}: {
    submit: (values: BasicStepValues, mode: SubmitMode) => Promise<void>
    onBasicChange: (values: BasicStepValues) => void
    initialBasic?: BasicStepValues
}) {
    const modeRef = useRef<SubmitMode>("submit")
    const form = useAppForm({
        defaultValues: initialBasic ?? EMPTY_PRODUCT_BASIC_FORM,
        onSubmit: async ({ value }) => {
            try {
                await submit(value, modeRef.current)
            } catch (error) {
                markProductBasicFieldErrors(form, error)
                // 继续抛出：form-core 才会复位 isSubmitSuccessful；接住 rejection 是 submitForm 的事
                throw error
            }
        },
    })

    useBasicFormSync({ form, onBasicChange })

    const [listingTime, setListingTime] = useState<ListingTime>("now")

    // 草稿无门槛：不过 onSubmit 全字段校验，直接把当前值交给 submit(draft)；但仍要落 422、要接 rejection 出口，故仍交给 submitForm
    const submitDraft = async () => {
        try {
            await submit(form.state.values, "draft")
        } catch (error) {
            markProductBasicFieldErrors(form, error)
            throw error
        }
    }

    const submitAs = (next?: SubmitMode) => {
        if (next === undefined) {
            // 不能写成 form.handleSubmit()：它不被 submitForm 接住 rejection，抛出的错误会变成未处理的异步异常
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

    const submitForListing = () => submitAs(listingTime === "warehouse" ? "warehouse" : "submit")

    return { form, submitAs, listingTime, setListingTime, submitForListing }
}

// ImageUpload 皮肤只读 error.message：递给它前把凭证失败压成本 locale 的一句（直传七牛那一发的错是本层自己写的句子，原样透）
function toLocalizedUploadError(
    file: File,
    locale: AppLocale,
    // 写整份 SellerTranslate 而非 ReturnType<typeof useT>：useT 是重载函数，ReturnType 取最后一个收窄签名会把调用点逼成单 namespace key
    t: SellerTranslate,
): Promise<string> {
    return uploadProductImage(file).catch((error: unknown): never => {
        if (error instanceof UploadTicketFailure) {
            throw new TypeError(errorText(error.apiError, locale, t(error.sceneKey)), {
                cause: error,
            })
        }
        if (error instanceof UploadTicketInvalidError) {
            throw new TypeError(t("common.upload.ticketInvalid"), { cause: error })
        }
        if (error instanceof UploadDirectFailureError) {
            throw new TypeError(t("common.upload.directFailed", { status: error.status }), {
                cause: error,
            })
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
    draftEditable: boolean
}) {
    const t = useT("product")
    const busy = submitting || creating
    return (
        <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-background/90 py-3 backdrop-blur">
            <div className="mx-auto flex w-full max-w-narrow items-center justify-end gap-3 px-6">
                {draftEditable ? (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={onSaveDraft}
                        className="h-10"
                    >
                        {t("product.basic.action.saveDraft")}
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

function SubmitButton({
    busy,
    draftEditable,
    onClick,
}: {
    busy: boolean
    draftEditable: boolean
    onClick: () => void
}) {
    const t = useT("product")
    return (
        <Button
            type="button"
            disabled={busy}
            onClick={onClick}
            className="h-10"
        >
            {busy && <Spinner />}
            {draftEditable
                ? t("product.basic.action.submit")
                : t("product.basic.action.saveChanges")}
        </Button>
    )
}

// 用滚动位置比较而非 IntersectionObserver：IO 只在交叉态改变时回调，连续滚动可能不触发导致高亮滞后
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

function currentSectionId(): string {
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

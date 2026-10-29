import { useState } from "react"
import type { CategoryAttributeView, CategoryAttributeValueView } from "@shop/api/sdk"
import { useQuery } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"

import { serverFieldErrors } from "@shop/app-kit/forms"
import {
    Badge,
    Button,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
    FieldDescription,
    FieldTitle,
    Separator,
    Skeleton,
    Spinner,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { InlineFormCard } from "#/shared/ui/inline-form-card"
import {
    addAttributeFormSchema,
    addValueFormSchema,
    describeAttrRules,
    editAttributeFormSchema,
    editValueFormSchema,
    editValuesOf,
    parseOptions,
    ATTR_CODE_MAX,
    ATTR_NAME_MAX,
    ATTR_VALUE_MAX,
    VALUE_TYPES,
    type AddAttributeFormValues,
} from "./attr-form"
import {
    categoryConfigOptions,
    useAddCategoryAttributes,
    useCreateAttributeValue,
    useUpdateCategoryAttribute,
    useUpdateAttributeValue,
} from "./queries"

/**
 * 类目属性面板。
 *
 * <p>属性<b>只增不删</b>（后端口径）：下线走 status = disabled，存量 spu_attr 保留。
 * 可编辑的是运营元数据（名称 / 必填 / 筛选 / 多选 / 自定义值 / 排序 / 上下线）；
 * valueType / code / identity 是身份键的一部分，创建后锁死——契约的更新请求里根本没有这些字段。
 * visibleWhen 条件显隐暂时只读展示：清除规则目前只能重建属性，编辑入口等有真实需求再加。
 */
export function AttrPanel({ categoryId }: { categoryId: string }) {
    const { data: config, isPending } = useQuery(categoryConfigOptions(categoryId))
    const [creating, setCreating] = useState(false)
    const t = useT()
    const attributes = config?.attributes ?? []

    return (
        <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <FieldTitle>{t("category.title")}</FieldTitle>
                    <FieldDescription>{t("category.description")}</FieldDescription>
                </div>
                {!creating && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreating(true)}
                    >
                        <PlusIcon data-slot="icon" />
                        {t("category.attr.add")}
                    </Button>
                )}
            </div>

            {creating && (
                <AttrCreateForm
                    categoryId={categoryId}
                    nextSort={(attributes.at(-1)?.sort ?? 0) + 10}
                    onDone={() => setCreating(false)}
                />
            )}

            {isPending ? (
                <Skeleton className="h-24 w-full" />
            ) : attributes.length === 0 ? (
                <Empty className="py-8">
                    <EmptyHeader>
                        <EmptyTitle>{t("category.empty.title")}</EmptyTitle>
                        <EmptyDescription>{t("category.empty.description")}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                attributes.map((attr) => (
                    <AttrCard
                        key={attr.id}
                        categoryId={categoryId}
                        attr={attr}
                        attributes={attributes}
                    />
                ))
            )}
        </section>
    )
}

function AttrCard({
    categoryId,
    attr,
    attributes,
}: {
    categoryId: string
    attr: CategoryAttributeView
    attributes: CategoryAttributeView[]
}) {
    const [editing, setEditing] = useState(false)
    const t = useT()
    const nameOf = (id: string) => attributes.find((a) => a.id === id)?.name ?? id

    return (
        <article className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <AttrCardHeader
                categoryId={categoryId}
                attr={attr}
                editing={editing}
                onToggleEditing={() => setEditing((open) => !open)}
            />

            {editing && (
                <AttrEditForm
                    categoryId={categoryId}
                    attr={attr}
                    onDone={() => setEditing(false)}
                />
            )}

            {attr.visibleWhen && (
                <p className="text-xs text-muted-foreground">
                    {t("category.attr.visibleWhen", {
                        attribute: nameOf(attr.visibleWhen.attributeId),
                        values: attr.visibleWhen.values.join(" / "),
                    })}
                </p>
            )}

            {attr.valueType === "enum" && (
                <>
                    <Separator />
                    <AttrValues
                        categoryId={categoryId}
                        attr={attr}
                    />
                </>
            )}
        </article>
    )
}

function AttrCardHeader({
    categoryId,
    attr,
    editing,
    onToggleEditing,
}: {
    categoryId: string
    attr: CategoryAttributeView
    editing: boolean
    onToggleEditing: () => void
}) {
    const update = useUpdateCategoryAttribute()
    const t = useT()

    return (
        <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{attr.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{attr.code}</span>
                <Badge variant="info">{attr.valueType}</Badge>
                {attr.unit && <span className="text-xs text-muted-foreground">{attr.unit}</span>}
                <Badge variant={attr.status === "active" ? "success" : "outline"}>
                    {t(
                        attr.status === "active"
                            ? "category.status.ENABLED"
                            : "category.status.DISABLED",
                    )}
                </Badge>
                <span className="text-xs text-muted-foreground">{describeAttrRules(attr, t)}</span>
            </div>

            <div className="flex items-center gap-1.5">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleEditing}
                >
                    {editing ? t("category.action.collapse") : t("category.action.edit")}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={update.isPending}
                    onClick={() =>
                        void update.mutateAsync({
                            categoryId,
                            attributeId: attr.id,
                            body: { status: attr.status === "active" ? "disabled" : "active" },
                        })
                    }
                >
                    {t(
                        attr.status === "active"
                            ? "category.action.disable"
                            : "category.action.enable",
                    )}
                </Button>
            </div>
        </header>
    )
}

function AttrCreateForm({
    categoryId,
    nextSort,
    onDone,
}: {
    categoryId: string
    nextSort: number
    onDone: () => void
}) {
    const t = useT()
    const add = useAddCategoryAttributes()

    const form = useAppForm({
        defaultValues: {
            code: "",
            name: "",
            valueType: "text",
            unit: "",
            optionsText: "",
            allowCustom: false,
            salesSpec: false,
            required: false,
            identity: false,
            filterable: false,
            multi: false,
        } as AddAttributeFormValues,
        validators: { onSubmit: addAttributeFormSchema },
        onSubmit: async ({ value }) => {
            const options = parseOptions(value.optionsText)
            try {
                await add.mutateAsync({
                    categoryId,
                    attributes: [
                        {
                            code: value.code.trim(),
                            name: value.name.trim(),
                            valueType: value.valueType,
                            ...(value.valueType === "number" && value.unit.trim()
                                ? { unit: value.unit.trim() }
                                : {}),
                            ...(value.valueType === "enum" && options.length > 0
                                ? { options }
                                : {}),
                            ...(value.valueType === "enum"
                                ? { allowCustom: value.allowCustom }
                                : {}),
                            salesSpec: value.salesSpec,
                            required: value.required,
                            identity: value.identity,
                            filterable: value.filterable,
                            multi: value.multi,
                            sort: nextSort,
                        },
                    ],
                })
                onDone()
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        code: "code",
                        name: "name",
                        valueType: "valueType",
                    }),
                )
                throw error
            }
        },
    })

    return (
        <InlineFormCard
            className="flex flex-col gap-3 rounded-lg border border-border p-3"
            form={form}
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <form.AppField name="code">
                    {(field) => (
                        <field.TextField
                            label={t("category.form.attrCode.label")}
                            required
                            maxLength={ATTR_CODE_MAX}
                            placeholder={t("category.form.attrCode.placeholder")}
                        />
                    )}
                </form.AppField>
                <form.AppField name="name">
                    {(field) => (
                        <field.TextField
                            label={t("category.form.attrName.label")}
                            required
                            maxLength={ATTR_NAME_MAX}
                        />
                    )}
                </form.AppField>
                <form.AppField name="valueType">
                    {(field) => (
                        <field.SelectField
                            label={t("category.form.valueType.label")}
                            required
                            items={VALUE_TYPES.map((type) => ({ value: type, label: type }))}
                        />
                    )}
                </form.AppField>
                <form.Subscribe selector={(state) => state.values.valueType}>
                    {(valueType) => (
                        <>
                            {valueType === "number" && (
                                <form.AppField name="unit">
                                    {(field) => (
                                        <field.TextField
                                            label={t("category.form.unit.label")}
                                            maxLength={16}
                                            placeholder={t("category.form.unit.placeholder")}
                                        />
                                    )}
                                </form.AppField>
                            )}
                        </>
                    )}
                </form.Subscribe>
            </div>
            <form.Subscribe selector={(state) => state.values.valueType}>
                {(valueType) =>
                    valueType === "enum" ? (
                        <>
                            <form.AppField name="optionsText">
                                {(field) => (
                                    <field.TextareaField
                                        label={t("category.form.options.label")}
                                        hint={t("category.form.options.hint")}
                                        rows={3}
                                    />
                                )}
                            </form.AppField>
                            <form.AppField name="allowCustom">
                                {(field) => (
                                    <field.CheckboxField
                                        label={t("category.flag.allowCustom")}
                                        hint={t("category.flag.allowCustomHint")}
                                    />
                                )}
                            </form.AppField>
                        </>
                    ) : null
                }
            </form.Subscribe>
            <div className="flex flex-wrap gap-4">
                <form.AppField name="salesSpec">
                    {(field) => <field.CheckboxField label={t("category.flag.salesSpec")} />}
                </form.AppField>
                <form.AppField name="required">
                    {(field) => <field.CheckboxField label={t("category.flag.required")} />}
                </form.AppField>
                <form.Subscribe selector={(state) => state.values.valueType}>
                    {(valueType) => (
                        <form.AppField name="identity">
                            {(field) => (
                                <field.CheckboxField
                                    label={t("category.flag.identity")}
                                    hint={
                                        valueType === "enum" || valueType === "number"
                                            ? undefined
                                            : t("category.form.err.identityType")
                                    }
                                />
                            )}
                        </form.AppField>
                    )}
                </form.Subscribe>
                <form.AppField name="filterable">
                    {(field) => <field.CheckboxField label={t("category.flag.filterable")} />}
                </form.AppField>
                <form.AppField name="multi">
                    {(field) => <field.CheckboxField label={t("category.flag.multi")} />}
                </form.AppField>
            </div>
            <div className="flex items-center gap-2">
                <Button
                    type="submit"
                    size="sm"
                    disabled={add.isPending}
                >
                    {add.isPending && <Spinner />}
                    {t("category.form.submitCreate")}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onDone}
                >
                    {t("category.form.cancel")}
                </Button>
            </div>
        </InlineFormCard>
    )
}

function AttrEditForm({
    categoryId,
    attr,
    onDone,
}: {
    categoryId: string
    attr: CategoryAttributeView
    onDone: () => void
}) {
    const t = useT()
    const update = useUpdateCategoryAttribute()

    const form = useAppForm({
        defaultValues: editValuesOf(attr),
        validators: { onSubmit: editAttributeFormSchema },
        onSubmit: async ({ value }) => {
            try {
                await update.mutateAsync({
                    categoryId,
                    attributeId: attr.id,
                    body: {
                        name: value.name.trim(),
                        required: value.required,
                        filterable: value.filterable,
                        multi: value.multi,
                        ...(attr.valueType === "enum" ? { allowCustom: value.allowCustom } : {}),
                        sort: Number.parseInt(value.sort.trim(), 10),
                    },
                })
                onDone()
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, { name: "name" }))
                throw error
            }
        },
    })

    return (
        <InlineFormCard
            className="flex flex-col gap-3 rounded-lg border border-border p-3"
            form={form}
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <form.AppField name="name">
                    {(field) => (
                        <field.TextField
                            label={t("category.form.attrName.label")}
                            required
                            maxLength={ATTR_NAME_MAX}
                        />
                    )}
                </form.AppField>
                <form.AppField name="sort">
                    {(field) => <field.TextField label={t("category.form.sort.label")} />}
                </form.AppField>
            </div>
            <div className="flex flex-wrap gap-4">
                <form.AppField name="required">
                    {(field) => <field.CheckboxField label={t("category.flag.required")} />}
                </form.AppField>
                <form.AppField name="filterable">
                    {(field) => <field.CheckboxField label={t("category.flag.filterable")} />}
                </form.AppField>
                <form.AppField name="multi">
                    {(field) => <field.CheckboxField label={t("category.flag.multi")} />}
                </form.AppField>
                {attr.valueType === "enum" && (
                    <form.AppField name="allowCustom">
                        {(field) => (
                            <field.CheckboxField
                                label={t("category.flag.allowCustom")}
                                hint={t("category.flag.allowCustomHint")}
                            />
                        )}
                    </form.AppField>
                )}
            </div>
            <div className="flex items-center gap-2">
                <Button
                    type="submit"
                    size="sm"
                    disabled={update.isPending}
                >
                    {update.isPending && <Spinner />}
                    {t("category.form.submitSave")}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onDone}
                >
                    {t("category.form.cancel")}
                </Button>
            </div>
        </InlineFormCard>
    )
}

function AttrValues({ categoryId, attr }: { categoryId: string; attr: CategoryAttributeView }) {
    const [adding, setAdding] = useState(false)
    const [editingId, setEditingId] = useState<string>()
    const t = useT()
    const values = attr.values ?? []

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <FieldTitle>{t("category.values.title")}</FieldTitle>
                {!adding && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAdding(true)}
                    >
                        <PlusIcon data-slot="icon" />
                        {t("category.values.add")}
                    </Button>
                )}
            </div>

            {adding && (
                <AddValueForm
                    categoryId={categoryId}
                    attributeId={attr.id}
                    nextSort={(values.at(-1)?.sort ?? 0) + 10}
                    onDone={() => setAdding(false)}
                />
            )}

            {values.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("category.values.empty")}</p>
            ) : (
                <ul className="flex flex-col gap-1.5">
                    {values.map((value) => (
                        <li key={value.id}>
                            {editingId === value.id ? (
                                <EditValueForm
                                    categoryId={categoryId}
                                    attributeId={attr.id}
                                    value={value}
                                    onDone={() => setEditingId(undefined)}
                                />
                            ) : (
                                <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="truncate text-sm">{value.value}</span>
                                        {value.imageUrl && (
                                            <span className="font-mono text-xs text-muted-foreground">
                                                {t("category.values.hasImage")}
                                            </span>
                                        )}
                                        {value.status === "disabled" && (
                                            <Badge variant="outline">
                                                {t("category.status.DISABLED")}
                                            </Badge>
                                        )}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setEditingId(value.id)}
                                    >
                                        {t("category.action.edit")}
                                    </Button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

function AddValueForm({
    categoryId,
    attributeId,
    nextSort,
    onDone,
}: {
    categoryId: string
    attributeId: string
    nextSort: number
    onDone: () => void
}) {
    const t = useT()
    const create = useCreateAttributeValue()

    const form = useAppForm({
        defaultValues: { value: "", imageUrl: "" },
        validators: { onSubmit: addValueFormSchema },
        onSubmit: async ({ value }) => {
            try {
                await create.mutateAsync({
                    categoryId,
                    attributeId,
                    body: {
                        value: value.value.trim(),
                        sort: nextSort,
                        ...(value.imageUrl.trim() ? { imageUrl: value.imageUrl.trim() } : {}),
                    },
                })
                onDone()
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, { value: "value" }))
                throw error
            }
        },
    })

    return (
        <InlineFormCard
            className="flex items-end gap-3 rounded-lg border border-border p-3"
            form={form}
        >
            <form.AppField name="value">
                {(field) => (
                    <field.TextField
                        label={t("category.form.value.label")}
                        required
                        maxLength={ATTR_VALUE_MAX}
                    />
                )}
            </form.AppField>
            <form.AppField name="imageUrl">
                {(field) => (
                    <field.TextField
                        label={t("category.form.imageUrl.label")}
                        maxLength={1024}
                    />
                )}
            </form.AppField>
            <div className="flex items-center gap-2">
                <Button
                    type="submit"
                    size="sm"
                    disabled={create.isPending}
                >
                    {create.isPending && <Spinner />}
                    {t("category.form.submitCreate")}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onDone}
                >
                    {t("category.form.cancel")}
                </Button>
            </div>
        </InlineFormCard>
    )
}

function EditValueForm({
    categoryId,
    attributeId,
    value,
    onDone,
}: {
    categoryId: string
    attributeId: string
    value: CategoryAttributeValueView
    onDone: () => void
}) {
    const t = useT()
    const update = useUpdateAttributeValue()

    const form = useAppForm({
        defaultValues: {
            imageUrl: value.imageUrl ?? "",
            sort: String(value.sort),
            status: value.status === "disabled" ? "disabled" : "active",
        },
        validators: { onSubmit: editValueFormSchema },
        onSubmit: async ({ value: next }) => {
            try {
                await update.mutateAsync({
                    categoryId,
                    attributeId,
                    valueId: value.id,
                    body: {
                        imageUrl: next.imageUrl.trim(),
                        sort: Number.parseInt(next.sort.trim(), 10),
                        status: next.status,
                    },
                })
                onDone()
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, { imageUrl: "imageUrl" }))
                throw error
            }
        },
    })

    return (
        <InlineFormCard
            className="flex items-end gap-3 rounded-lg border border-border p-3"
            form={form}
        >
            <form.AppField name="imageUrl">
                {(field) => (
                    <field.TextField
                        label={t("category.form.imageUrl.label")}
                        maxLength={1024}
                    />
                )}
            </form.AppField>
            <form.AppField name="sort">
                {(field) => <field.TextField label={t("category.form.sort.label")} />}
            </form.AppField>
            <form.AppField name="status">
                {(field) => (
                    <field.SelectField
                        label={t("category.form.status.label")}
                        items={[
                            { value: "active", label: t("category.status.ENABLED") },
                            { value: "disabled", label: t("category.status.DISABLED") },
                        ]}
                    />
                )}
            </form.AppField>
            <div className="flex items-center gap-2">
                <Button
                    type="submit"
                    size="sm"
                    disabled={update.isPending}
                >
                    {update.isPending && <Spinner />}
                    {t("category.form.submitSave")}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onDone}
                >
                    {t("category.form.cancel")}
                </Button>
            </div>
        </InlineFormCard>
    )
}

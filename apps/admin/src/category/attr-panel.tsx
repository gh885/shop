import { useState } from "react"
import type {
    CategoryAttrNodeResponse,
    CategoryAttrResponse,
    CategoryAttrValueResponse,
} from "@shop/api/sdk"
import { useQuery } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"

import { serverFieldErrorTexts, useI18n } from "@shop/app-kit"
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

import { InlineFormCard } from "#/shared/ui/inline-form-card"
import {
    attrFormSchema,
    ATTR_NAME_MAX,
    ATTR_VALUE_MAX,
    describeAttrRules,
    valueFormSchema,
    type AttrFormValues,
} from "./attr-form"
import {
    ATTR_KIND_LABEL,
    ATTR_KIND_OPTIONS,
    ATTR_STATUS_LABEL,
    ATTR_VALUE_SOURCE_LABEL,
} from "./constants"
import {
    categoryAttrsOptions,
    useCreateCategoryAttr,
    useCreateCategoryAttrValue,
    useSetCategoryAttrStatus,
    useUpdateCategoryAttr,
    useUpdateCategoryAttrValue,
} from "./queries"

/**
 * 类目属性模板（仅三级类目，后端也会拒非叶子）。
 *
 * 禁用的语义是查询侧裁剪：存量商品引用的属性/值仍然自洽，所以这里只有启用/禁用，没有删除。
 * 校验与摘要文案在 `./attr-form`（那里无 React，可单测）。
 */
export function AttrPanel({ categoryId }: { categoryId: string }) {
    const { data: nodes = [], isPending } = useQuery(categoryAttrsOptions(categoryId))
    const [creating, setCreating] = useState(false)

    return (
        <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <FieldTitle>属性模板</FieldTitle>
                    <FieldDescription>
                        销售属性决定 SKU
                        组合，参数是商品资料；禁用的条目新商品不可再选，存量引用不受影响
                    </FieldDescription>
                </div>
                {!creating && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreating(true)}
                    >
                        <PlusIcon data-slot="icon" />
                        新增属性
                    </Button>
                )}
            </div>

            {creating && (
                <AttrCreateForm
                    categoryId={categoryId}
                    onDone={() => setCreating(false)}
                />
            )}

            {isPending ? (
                <Skeleton className="h-24 w-full" />
            ) : nodes.length === 0 ? (
                <Empty className="py-8">
                    <EmptyHeader>
                        <EmptyTitle>还没有属性模板</EmptyTitle>
                        <EmptyDescription>
                            卖家发布挂在该类目下的商品时，只能按这里的属性与值域填
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                nodes.map((node) => (
                    <AttrCard
                        key={node.attr.id}
                        node={node}
                    />
                ))
            )}
        </section>
    )
}

/** 一条属性：头部（名称/类型/状态 + 编辑与启停）、可展开的编辑表单、值域 */
function AttrCard({ node }: { node: CategoryAttrNodeResponse }) {
    const { attr, values } = node
    const [editing, setEditing] = useState(false)

    return (
        <article className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <AttrCardHeader
                attr={attr}
                editing={editing}
                onToggleEditing={() => setEditing((open) => !open)}
            />

            {editing && (
                <AttrEditForm
                    attr={attr}
                    onDone={() => setEditing(false)}
                />
            )}

            <Separator />

            <AttrValues
                attrId={attr.id}
                values={values}
            />
        </article>
    )
}

function AttrCardHeader({
    attr,
    editing,
    onToggleEditing,
}: {
    attr: CategoryAttrResponse
    editing: boolean
    onToggleEditing: () => void
}) {
    const status = useSetCategoryAttrStatus()

    return (
        <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{attr.name}</span>
                <Badge variant={attr.kind === "SPEC" ? "info" : "outline"}>
                    {ATTR_KIND_LABEL[attr.kind]}
                </Badge>
                <Badge variant={attr.status === "ENABLED" ? "success" : "outline"}>
                    {ATTR_STATUS_LABEL[attr.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">{describeAttrRules(attr)}</span>
            </div>

            <div className="flex items-center gap-1.5">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleEditing}
                >
                    {editing ? "收起" : "编辑"}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={status.isPending}
                    onClick={() =>
                        void status.mutateAsync({
                            attrId: attr.id,
                            status: attr.status === "ENABLED" ? "DISABLED" : "ENABLED",
                        })
                    }
                >
                    {attr.status === "ENABLED" ? "禁用" : "启用"}
                </Button>
            </div>
        </header>
    )
}

/** 值域：列表 + 新增/改名（两者共用同一个表单组件） */
function AttrValues({
    attrId,
    values,
}: {
    attrId: string
    values: CategoryAttrNodeResponse["values"]
}) {
    const [adding, setAdding] = useState(false)
    const [editing, setEditing] = useState<CategoryAttrValueResponse>()

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                    值域 {values.length} 项
                    {values.length === 0 && "（空值域 + 可自定义 = 卖家自由填）"}
                </span>
                {!adding && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAdding(true)}
                    >
                        <PlusIcon data-slot="icon" />
                        添加值
                    </Button>
                )}
            </div>

            {values.length > 0 && (
                <ul className="flex max-h-48 flex-col overflow-y-auto">
                    {values.map((value) => (
                        <li
                            key={value.id}
                            className="flex items-center justify-between gap-2 py-0.5 text-sm"
                        >
                            <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate">{value.value}</span>
                                <Badge variant="outline">
                                    {ATTR_VALUE_SOURCE_LABEL[value.source]}
                                </Badge>
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditing(value)}
                                aria-label={`改「${value.value}」`}
                            >
                                改
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            {adding && (
                <ValueForm
                    attrId={attrId}
                    onDone={() => setAdding(false)}
                />
            )}
            {editing && (
                <ValueForm
                    key={editing.id}
                    attrId={attrId}
                    editing={editing}
                    onDone={() => setEditing(undefined)}
                />
            )}
        </div>
    )
}

/** 新增属性：kind 可选 */
function AttrCreateForm({ categoryId, onDone }: { categoryId: string; onDone: () => void }) {
    const create = useCreateCategoryAttr()
    return (
        <AttrForm
            defaults={{
                name: "",
                kind: "SPEC",
                required: false,
                allowCustom: true,
                allowImage: false,
            }}
            busy={create.isPending}
            submitLabel="新增"
            onSubmit={(values) => create.mutateAsync({ categoryId, ...values })}
            onDone={onDone}
        />
    )
}

/** 编辑属性：kind 锁死（改类型会让存量 SKU 失去出处） */
function AttrEditForm({ attr, onDone }: { attr: CategoryAttrResponse; onDone: () => void }) {
    const update = useUpdateCategoryAttr()
    return (
        <AttrForm
            defaults={{
                name: attr.name,
                kind: attr.kind,
                required: attr.required,
                allowCustom: attr.allowCustom,
                allowImage: attr.allowImage,
            }}
            lockedKind={attr.kind}
            busy={update.isPending}
            submitLabel="保存"
            onSubmit={(values) =>
                update.mutateAsync({
                    attrId: attr.id,
                    // kind 后端会忽略，照原值回传，不编一个假的
                    kind: attr.kind,
                    name: values.name,
                    required: values.required,
                    allowCustom: values.allowCustom,
                    allowImage: values.allowImage,
                })
            }
            onDone={onDone}
        />
    )
}

/**
 * 属性表单：只管字段与提交，不认 mutation（新增/编辑各自接线）。
 * `lockedKind` 有值时类型不可改——那一格在契约里也是创建后不再生效的。
 */
function AttrForm({
    defaults,
    lockedKind,
    busy,
    submitLabel,
    onSubmit,
    onDone,
}: {
    defaults: AttrFormValues
    lockedKind?: CategoryAttrResponse["kind"]
    busy: boolean
    submitLabel: string
    onSubmit: (values: AttrFormValues) => Promise<unknown>
    onDone: () => void
}) {
    const { locale } = useI18n()
    const form = useAppForm({
        defaultValues: defaults,
        validators: { onSubmit: attrFormSchema },
        onSubmit: async ({ value }) => {
            try {
                await onSubmit({ ...value, name: value.name.trim() })
                onDone()
            } catch (error) {
                // CategoryAttrRequest 里有校验注且表单有框的只有 name（@NotBlank + 上限）与 kind
                // （@NotNull）。编辑态 kind 锁死且后端忽略那一格，那条错误也就落不到不存在的框上；
                // required/allowCustom/allowImage 是无注解的 Boolean、sort 由后端排，都不进白名单
                applyServerFieldErrors(
                    form,
                    serverFieldErrorTexts(error, locale, {
                        name: "name",
                        kind: "kind",
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
            <form.AppField name="name">
                {(field) => (
                    <field.TextField
                        label="属性名称"
                        required
                        maxLength={ATTR_NAME_MAX}
                        placeholder="如 颜色 / 尺码 / 材质"
                    />
                )}
            </form.AppField>

            {lockedKind ? (
                <FieldDescription>
                    类型为{ATTR_KIND_LABEL[lockedKind]}，创建后不可更改
                </FieldDescription>
            ) : (
                <form.AppField name="kind">
                    {(field) => (
                        <field.RadioGroupField
                            label="类型"
                            required
                            options={ATTR_KIND_OPTIONS}
                        />
                    )}
                </form.AppField>
            )}

            <div className="flex flex-wrap gap-4">
                <form.AppField name="required">
                    {(field) => (
                        <field.CheckboxField
                            label="商品必填"
                            hint="只对参数有意义"
                        />
                    )}
                </form.AppField>
                <form.AppField name="allowCustom">
                    {(field) => (
                        <field.CheckboxField
                            label="允许卖家扩充值"
                            hint="关闭后只能选值域里的预置值"
                        />
                    )}
                </form.AppField>
                <form.AppField name="allowImage">
                    {(field) => (
                        <field.CheckboxField
                            label="取值可配图"
                            hint="如颜色色卡"
                        />
                    )}
                </form.AppField>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    type="submit"
                    size="sm"
                    disabled={busy}
                >
                    {busy && <Spinner />}
                    {submitLabel}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onDone}
                >
                    取消
                </Button>
            </div>
        </InlineFormCard>
    )
}

/** 值域新增/改名共用：改名会连带刷新引用 SKU 的取值快照，所以文案要写清这一点 */
function ValueForm({
    attrId,
    editing,
    onDone,
}: {
    attrId: string
    /** 传入 = 改这一行的值名/配图；不传 = 新增 */
    editing?: CategoryAttrValueResponse
    onDone: () => void
}) {
    const create = useCreateCategoryAttrValue()
    const update = useUpdateCategoryAttrValue()
    const busy = create.isPending || update.isPending
    const { locale } = useI18n()

    const form = useAppForm({
        defaultValues: { value: editing?.value ?? "", image: editing?.image ?? "" },
        validators: { onSubmit: valueFormSchema },
        onSubmit: async ({ value }) => {
            const name = value.value.trim()
            const image = value.image.trim()
            try {
                if (editing) {
                    await update.mutateAsync({ valueId: editing.id, value: name, image })
                } else {
                    await create.mutateAsync({ attrId, value: name, image })
                }
                onDone()
            } catch (error) {
                // CategoryAttrValueRequest 两个带注解的组件名与表单字段同名（value 的必填与上限、
                // image 的 URL 上限）；sort 由后端排、表单没有那一格，不列
                applyServerFieldErrors(
                    form,
                    serverFieldErrorTexts(error, locale, {
                        value: "value",
                        image: "image",
                    }),
                )
                throw error
            }
        },
    })

    return (
        <InlineFormCard
            className="flex flex-col gap-2 rounded-md border border-border p-2"
            form={form}
        >
            <form.AppField name="value">
                {(field) => (
                    <field.TextField
                        label="取值"
                        required
                        maxLength={ATTR_VALUE_MAX}
                        placeholder="如 红色 / XL / 纯棉"
                    />
                )}
            </form.AppField>
            <form.AppField name="image">
                {(field) => (
                    <field.TextField
                        label="取值配图 URL"
                        placeholder="可选"
                        hint={editing ? "改名会同步刷新已引用该值的商品 SKU 快照" : undefined}
                    />
                )}
            </form.AppField>
            <div className="flex items-center gap-2">
                <Button
                    type="submit"
                    size="sm"
                    disabled={busy}
                >
                    {busy && <Spinner />}
                    {editing ? "保存" : "添加"}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onDone}
                >
                    取消
                </Button>
            </div>
        </InlineFormCard>
    )
}

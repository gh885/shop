import type { CategoryConfig } from "@shop/api/sdk"
import { useQuery } from "@tanstack/react-query"
import { serverFieldErrors } from "@shop/app-kit/forms"
import { messageFactFactory } from "@shop/i18n"
import {
    applyServerFieldErrors,
    Button,
    Checkbox,
    FieldDescription,
    FieldTitle,
    Label,
    Skeleton,
    Spinner,
    useAppForm,
} from "@shop/ui-web"
import { z } from "zod"

import type { AdminMessageKey, AdminParamsByKey } from "#/locales/messages.gen"
import { useT } from "#/locales/use-t"
import { InlineFormCard } from "#/shared/ui/inline-form-card"

import { categoryConfigOptions, useUpdateCategoryConfig } from "./queries"

/**
 * 叶子类目配置：识别键 / 匹配策略 / 品牌策略 / 资质 / 免审。
 *
 * <p>识别键与匹配策略在类目有商品后被服务端锁死（`CATEGORY_CONFIG_LOCKED`）——改了会让
 * 存量商品的 match_key 全部失效。前端不为此多查一个「有没有商品」接口，改了就吃 409 的 toast。
 *
 * <p>词表镜像后端枚举（`IdentityKind` / `BrandPolicy`），不进契约，改了枚举这里要跟。
 */
const IDENTITY_KEYS = ["model_no", "article_no", "param_hash", "none"] as const
const SKU_IDENTITY_KINDS = ["gtin", "param_hash", "none"] as const
const BRAND_POLICIES = ["required", "optional", "forbidden"] as const

const err = messageFactFactory<
    Extract<AdminMessageKey, `category.config.err.${string}`>,
    AdminParamsByKey
>()

const configFormSchema = z
    .object({
        identityKeys: z.array(z.string()),
        skuIdentityKinds: z.array(z.string()),
        matchStrategies: z.array(z.string()),
        brandPolicy: z.enum(BRAND_POLICIES),
        qualificationText: z.string(),
        autoApprove: z.boolean(),
    })
    .superRefine((value, ctx) => {
        if (value.identityKeys.length === 0) {
            ctx.addIssue({
                code: "custom",
                path: ["identityKeys"],
                message: err("category.config.err.identityKeysRequired").message,
            })
        }
        if (value.skuIdentityKinds.length === 0) {
            ctx.addIssue({
                code: "custom",
                path: ["skuIdentityKinds"],
                message: err("category.config.err.skuKindsRequired").message,
            })
        }
        if (value.identityKeys.includes("none") && value.identityKeys.length > 1) {
            ctx.addIssue({
                code: "custom",
                path: ["identityKeys"],
                message: err("category.config.err.noneExclusive").message,
            })
        }
        if (value.skuIdentityKinds.includes("none") && value.skuIdentityKinds.length > 1) {
            ctx.addIssue({
                code: "custom",
                path: ["skuIdentityKinds"],
                message: err("category.config.err.noneExclusive").message,
            })
        }
        for (const strategy of value.matchStrategies) {
            if (!value.identityKeys.includes(strategy)) {
                ctx.addIssue({
                    code: "custom",
                    path: ["matchStrategies"],
                    message: err("category.config.err.strategySubset").message,
                })
            }
        }
    })

type ConfigFormValues = z.infer<typeof configFormSchema>

function valuesOf(config: CategoryConfig): ConfigFormValues {
    return {
        identityKeys: [...config.identityKeys],
        skuIdentityKinds: [...config.skuIdentityKinds],
        matchStrategies: [...(config.matchStrategies ?? [])],
        brandPolicy: (BRAND_POLICIES as readonly string[]).includes(config.brandPolicy)
            ? (config.brandPolicy as ConfigFormValues["brandPolicy"])
            : "optional",
        qualificationText: (config.qualificationCodes ?? []).join("、"),
        autoApprove: config.autoApprove,
    }
}

/** 多选词表：勾选/取消一项，其余保持 */
function toggleValue(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

const KEY_LABELS = {
    model_no: "category.config.key.model_no",
    article_no: "category.config.key.article_no",
    param_hash: "category.config.key.param_hash",
    none: "category.config.key.none",
    gtin: "category.config.key.gtin",
} as const satisfies Record<string, AdminMessageKey>

const POLICY_LABELS = {
    required: "category.config.policy.required",
    optional: "category.config.policy.optional",
    forbidden: "category.config.policy.forbidden",
} as const satisfies Record<(typeof BRAND_POLICIES)[number], AdminMessageKey>

function CheckGroupField({
    label,
    value,
    onChange,
    options,
    disabledValues,
}: {
    label: string
    value: string[]
    onChange: (next: string[]) => void
    options: readonly string[]
    disabledValues?: readonly string[]
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <FieldTitle>{label}</FieldTitle>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
                {options.map((option) => (
                    <Label
                        key={option}
                        className="flex items-center gap-2 text-sm font-normal"
                    >
                        <Checkbox
                            checked={value.includes(option)}
                            disabled={disabledValues?.includes(option)}
                            onCheckedChange={() => onChange(toggleValue(value, option))}
                        />
                        {KEY_LABELS[option as keyof typeof KEY_LABELS]}
                    </Label>
                ))}
            </div>
        </div>
    )
}

export function ConfigPanel({ categoryId }: { categoryId: string }) {
    // 与 AttrPanel 同一个 queryKey：TanStack 去重，不产生第二次请求
    const { data: config, isPending } = useQuery(categoryConfigOptions(categoryId))

    if (isPending || !config) {
        return <Skeleton className="h-24 w-full" />
    }
    // key=categoryId：换类目即重挂载，表单默认值按新配置重算（hook 顺序也不能让 early return 打破）
    return (
        <ConfigForm
            key={categoryId}
            config={config}
        />
    )
}

function ConfigForm({ config }: { config: CategoryConfig }) {
    const t = useT()
    const update = useUpdateCategoryConfig()

    const form = useAppForm({
        defaultValues: valuesOf(config),
        validators: { onSubmit: configFormSchema },
        onSubmit: async ({ value }) => {
            try {
                await update.mutateAsync({
                    categoryId: config.categoryId,
                    body: {
                        identityKeys: value.identityKeys,
                        skuIdentityKinds: value.skuIdentityKinds,
                        matchStrategies: value.matchStrategies,
                        brandPolicy: value.brandPolicy,
                        qualificationCodes: value.qualificationText
                            .split(/[,\n，、]/)
                            .map((code) => code.trim())
                            .filter(Boolean),
                        autoApprove: value.autoApprove,
                    },
                })
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, {}))
                throw error
            }
        },
    })

    return (
        <InlineFormCard
            className="flex flex-col gap-3"
            form={form}
        >
            <div>
                <FieldTitle>{t("category.config.title")}</FieldTitle>
                <FieldDescription>{t("category.config.description")}</FieldDescription>
            </div>

            <form.AppField name="identityKeys">
                {(field) => (
                    <CheckGroupField
                        label={t("category.config.identityKeys")}
                        value={field.state.value}
                        onChange={(next) => {
                            field.handleChange(next)
                            // 匹配策略必须是识别键的子集：识别键一变，出局的策略跟着摘掉
                            form.setFieldValue(
                                "matchStrategies",
                                form.state.values.matchStrategies.filter((strategy) =>
                                    next.includes(strategy),
                                ),
                            )
                        }}
                        options={IDENTITY_KEYS}
                    />
                )}
            </form.AppField>

            <form.AppField name="skuIdentityKinds">
                {(field) => (
                    <CheckGroupField
                        label={t("category.config.skuIdentityKinds")}
                        value={field.state.value}
                        onChange={(next) => field.handleChange(next)}
                        options={SKU_IDENTITY_KINDS}
                    />
                )}
            </form.AppField>

            <form.AppField name="matchStrategies">
                {(field) => (
                    <CheckGroupField
                        label={t("category.config.matchStrategies")}
                        value={field.state.value}
                        onChange={(next) => field.handleChange(next)}
                        options={IDENTITY_KEYS}
                        disabledValues={IDENTITY_KEYS.filter(
                            (key) => !form.state.values.identityKeys.includes(key),
                        )}
                    />
                )}
            </form.AppField>

            <div className="grid gap-3 sm:grid-cols-2">
                <form.AppField name="brandPolicy">
                    {(field) => (
                        <field.SelectField
                            label={t("category.config.brandPolicy")}
                            required
                            items={BRAND_POLICIES.map((policy) => ({
                                value: policy,
                                label: t(POLICY_LABELS[policy]),
                            }))}
                        />
                    )}
                </form.AppField>
                <form.AppField name="qualificationText">
                    {(field) => (
                        <field.TextField
                            label={t("category.config.qualificationCodes")}
                            placeholder={t("category.config.qualificationPlaceholder")}
                        />
                    )}
                </form.AppField>
            </div>

            <form.AppField name="autoApprove">
                {(field) => (
                    <field.CheckboxField
                        label={t("category.config.autoApprove")}
                        hint={t("category.config.autoApproveHint")}
                    />
                )}
            </form.AppField>

            <div>
                <Button
                    type="submit"
                    size="sm"
                    disabled={update.isPending}
                >
                    {update.isPending && <Spinner />}
                    {t("category.form.submitSave")}
                </Button>
            </div>
        </InlineFormCard>
    )
}

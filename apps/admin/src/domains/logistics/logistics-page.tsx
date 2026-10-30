import { useState } from "react"
import type { MapRow, TraceRow } from "@shop/api/sdk"
import { useQuery } from "@tanstack/react-query"
import { TrashIcon } from "lucide-react"

import { serverFieldErrors } from "@shop/app-kit/forms"
import {
    applyServerFieldErrors,
    Badge,
    Button,
    confirm,
    FieldDescription,
    FieldTitle,
    Skeleton,
    Spinner,
    useAppForm,
} from "@shop/ui-web"
import { z } from "zod"

import type { AdminMessageKey } from "#/locales/messages.gen"
import { useT } from "#/locales/use-t"
import { PageHeader } from "#/shared/ui/page-header"
import { InlineFormCard } from "#/shared/ui/inline-form-card"
import { CARRIERS, RECORDABLE_CODES, STANDARD_CODES } from "./constants"

/** 徽章元数据查不到就按原码 + 中性色兜底：后端对陌生档位照实给值，别收窄成枚举 */
function standardCodeMeta(code: string) {
    return STANDARD_CODES.find((entry) => entry.code === code)
}
import {
    codeMapOptions,
    tracesNewestFirst,
    unmappedOptions,
    timelineOptions,
    useDeleteCodeMap,
    useRecordTrace,
    useUpsertCodeMap,
} from "./queries"

/**
 * 轨迹工单台：手工补录 / 按单号核对 / 承运商码表 + 缺口清单。
 *
 * <p>补录与推送口同等危险（能推进包裹到已签收并触发结算解冻），闸门在后端
 * （`LOGISTICS_MANAGE` + 平台员工身份）；这里只负责把证据要求（note 必填）摆到人面前。
 */
export function LogisticsPage() {
    const t = useT()
    return (
        <div className="space-y-6">
            <PageHeader
                title={t("logistics.page.title")}
                description={t("logistics.page.description")}
            />
            <RecordTraceCard />
            <TraceLookupCard />
            <CodeMapCard />
        </div>
    )
}

/** 补录表单：standardCode 不提供 unknown——unknown 只该由码表翻译失败产生 */
function RecordTraceCard() {
    const t = useT()
    const record = useRecordTrace()

    const form = useAppForm({
        defaultValues: {
            carrierCode: "sf",
            trackingNo: "",
            standardCode: "COLLECTED",
            note: "",
            signedBy: "",
            occurredAt: "",
        },
        validators: {
            onSubmit: z.object({
                carrierCode: z.string().min(1),
                trackingNo: z.string().trim().min(1, errFact("logistics.record.err.trackingNo")),
                standardCode: z.string().min(1),
                note: z.string().trim().min(1, errFact("logistics.record.err.note")),
                signedBy: z.string(),
                occurredAt: z.string(),
            }),
        },
        onSubmit: async ({ value }) => {
            try {
                await record.mutateAsync({
                    carrierCode: value.carrierCode,
                    trackingNo: value.trackingNo.trim(),
                    standardCode: value.standardCode,
                    note: value.note.trim(),
                    signedBy: value.signedBy.trim(),
                    occurredAt: value.occurredAt.trim(),
                })
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, { trackingNo: "trackingNo" }))
                throw error
            }
        },
    })

    return (
        <section className="flex flex-col gap-3">
            <div>
                <FieldTitle>{t("logistics.record.title")}</FieldTitle>
                <FieldDescription>{t("logistics.record.description")}</FieldDescription>
            </div>
            <InlineFormCard
                className="flex flex-col gap-3"
                form={form}
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <form.AppField name="carrierCode">
                        {(field) => (
                            <field.SelectField
                                label={t("logistics.form.carrier")}
                                required
                                items={CARRIERS.map((carrier) => ({
                                    value: carrier.code,
                                    label: t(carrier.labelKey),
                                }))}
                            />
                        )}
                    </form.AppField>
                    <form.AppField name="trackingNo">
                        {(field) => (
                            <field.TextField
                                label={t("logistics.form.trackingNo")}
                                required
                            />
                        )}
                    </form.AppField>
                    <form.AppField name="standardCode">
                        {(field) => (
                            <field.SelectField
                                label={t("logistics.form.standardCode")}
                                required
                                items={RECORDABLE_CODES.map((entry) => ({
                                    value: entry.code,
                                    label: t(entry.labelKey),
                                }))}
                            />
                        )}
                    </form.AppField>
                    <form.AppField name="signedBy">
                        {(field) => (
                            <field.TextField
                                label={t("logistics.form.signedBy")}
                                hint={t("logistics.form.signedByHint")}
                            />
                        )}
                    </form.AppField>
                </div>
                <form.AppField name="note">
                    {(field) => (
                        <field.TextareaField
                            label={t("logistics.form.note")}
                            required
                            hint={t("logistics.form.noteHint")}
                            rows={2}
                        />
                    )}
                </form.AppField>
                <form.AppField name="occurredAt">
                    {(field) => (
                        <field.TextField
                            label={t("logistics.form.occurredAt")}
                            hint={t("logistics.form.occurredAtHint")}
                            placeholder="2026-10-29T10:00:00Z"
                        />
                    )}
                </form.AppField>
                <div>
                    <Button
                        type="submit"
                        size="sm"
                        disabled={record.isPending}
                    >
                        {record.isPending && <Spinner />}
                        {t("logistics.record.submit")}
                    </Button>
                </div>
            </InlineFormCard>
        </section>
    )
}

/** 核对：查到的是「我们到底收到过什么」，含被翻成 unknown 的原始记录——排查用，不写任何东西 */
function TraceLookupCard() {
    const t = useT()
    const [params, setParams] = useState<{ carrierCode: string; trackingNo: string }>()
    const { data, isFetching } = useQuery({
        ...timelineOptions(params?.carrierCode ?? "", params?.trackingNo ?? ""),
        enabled: params !== undefined,
    })

    const form = useAppForm({
        defaultValues: { carrierCode: "sf", trackingNo: "" },
        validators: {
            onSubmit: z.object({
                carrierCode: z.string().min(1),
                trackingNo: z.string().trim().min(1, errFact("logistics.record.err.trackingNo")),
            }),
        },
        onSubmit: async ({ value }) => {
            setParams({ carrierCode: value.carrierCode, trackingNo: value.trackingNo.trim() })
        },
    })

    return (
        <section className="flex flex-col gap-3">
            <div>
                <FieldTitle>{t("logistics.lookup.title")}</FieldTitle>
                <FieldDescription>{t("logistics.lookup.description")}</FieldDescription>
            </div>
            <InlineFormCard
                className="flex items-end gap-3"
                form={form}
            >
                <form.AppField name="carrierCode">
                    {(field) => (
                        <field.SelectField
                            label={t("logistics.form.carrier")}
                            required
                            items={CARRIERS.map((carrier) => ({
                                value: carrier.code,
                                label: t(carrier.labelKey),
                            }))}
                        />
                    )}
                </form.AppField>
                <form.AppField name="trackingNo">
                    {(field) => (
                        <field.TextField
                            label={t("logistics.form.trackingNo")}
                            required
                        />
                    )}
                </form.AppField>
                <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={isFetching}
                >
                    {isFetching && <Spinner />}
                    {t("logistics.lookup.submit")}
                </Button>
            </InlineFormCard>
            {params && (
                <TraceTimeline
                    traces={data?.traces ?? []}
                    isPending={isFetching}
                />
            )}
        </section>
    )
}

function TraceTimeline({ traces, isPending }: { traces: TraceRow[]; isPending: boolean }) {
    const t = useT()
    if (isPending) {
        return <Skeleton className="h-16 w-full" />
    }
    if (traces.length === 0) {
        return <p className="text-sm text-muted-foreground">{t("logistics.lookup.empty")}</p>
    }
    return (
        <ol className="flex flex-col gap-2">
            {tracesNewestFirst(traces).map((trace) => {
                const meta = standardCodeMeta(trace.standardCode)
                return (
                    <li
                        key={trace.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
                    >
                        <Badge variant={meta?.variant ?? "outline"}>
                            {meta ? t(meta.labelKey) : trace.standardCode}
                        </Badge>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            {trace.occurredAt}
                        </span>
                        <span className="text-sm">{trace.description}</span>
                        {trace.location && (
                            <span className="text-xs text-muted-foreground">{trace.location}</span>
                        )}
                        <span className="ml-auto font-mono text-xs text-muted-foreground">
                            {t("logistics.lookup.rawCode")}: {trace.rawCode}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}

function CodeMapCard() {
    const t = useT()
    const [adding, setAdding] = useState(false)
    const { data: mappings = [], isPending } = useQuery(codeMapOptions())
    const { data: unmapped = [] } = useQuery(unmappedOptions())

    return (
        <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <FieldTitle>{t("logistics.codeMap.title")}</FieldTitle>
                    <FieldDescription>{t("logistics.codeMap.description")}</FieldDescription>
                </div>
                {!adding && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAdding(true)}
                    >
                        {t("logistics.codeMap.add")}
                    </Button>
                )}
            </div>

            {adding && <UpsertMapForm onDone={() => setAdding(false)} />}

            {unmapped.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-warning-subtle-foreground/20 bg-warning-subtle p-3">
                    <FieldTitle>{t("logistics.unmapped.title")}</FieldTitle>
                    <FieldDescription>{t("logistics.unmapped.description")}</FieldDescription>
                    <ul className="flex flex-col gap-1">
                        {unmapped.map((row) => (
                            <li
                                key={`${row.carrierCode}:${row.rawCode}`}
                                className="flex items-center gap-2 text-sm"
                            >
                                <span className="font-mono text-xs">{row.carrierCode}</span>
                                <span className="font-mono text-xs">{row.rawCode}</span>
                                <span className="text-xs text-muted-foreground">
                                    {t("logistics.unmapped.occurrences", {
                                        count: row.occurrences,
                                    })}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {isPending ? (
                <Skeleton className="h-16 w-full" />
            ) : mappings.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("logistics.codeMap.empty")}</p>
            ) : (
                <ul className="flex flex-col gap-1.5">
                    {mappings.map((row) => (
                        <MapRowItem
                            key={`${row.carrierCode}:${row.rawCode}`}
                            row={row}
                        />
                    ))}
                </ul>
            )}
        </section>
    )
}

function MapRowItem({ row }: { row: MapRow }) {
    const t = useT()
    const remove = useDeleteCodeMap()
    const meta = standardCodeMeta(row.standardCode)

    return (
        <li className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
            <span className="font-mono text-xs">{row.carrierCode}</span>
            <span className="font-mono text-xs">{row.rawCode}</span>
            <Badge variant={meta?.variant ?? "outline"}>
                {meta ? t(meta.labelKey) : row.standardCode}
            </Badge>
            {row.note && <span className="truncate text-xs text-muted-foreground">{row.note}</span>}
            <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                disabled={remove.isPending}
                onClick={async () => {
                    await confirm({
                        title: t("logistics.codeMap.deleteTitle"),
                        description: t("logistics.codeMap.deleteConfirm", {
                            carrier: row.carrierCode,
                            rawCode: row.rawCode,
                        }),
                        action: () =>
                            remove.mutateAsync({
                                carrierCode: row.carrierCode,
                                rawCode: row.rawCode,
                            }),
                    })
                }}
            >
                <TrashIcon />
                <span className="sr-only">{t("logistics.codeMap.delete")}</span>
            </Button>
        </li>
    )
}

function UpsertMapForm({ onDone }: { onDone: () => void }) {
    const t = useT()
    const upsert = useUpsertCodeMap()

    const form = useAppForm({
        defaultValues: { carrierCode: "sf", rawCode: "", standardCode: "COLLECTED", note: "" },
        validators: {
            onSubmit: z.object({
                carrierCode: z.string().min(1),
                rawCode: z.string().trim().min(1, errFact("logistics.codeMap.err.rawCode")),
                standardCode: z.string().min(1),
                note: z.string(),
            }),
        },
        onSubmit: async ({ value }) => {
            try {
                await upsert.mutateAsync({
                    carrierCode: value.carrierCode,
                    rawCode: value.rawCode.trim(),
                    standardCode: value.standardCode,
                    note: value.note.trim(),
                })
                onDone()
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, { rawCode: "rawCode" }))
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
                <form.AppField name="carrierCode">
                    {(field) => (
                        <field.SelectField
                            label={t("logistics.form.carrier")}
                            required
                            items={CARRIERS.map((carrier) => ({
                                value: carrier.code,
                                label: t(carrier.labelKey),
                            }))}
                        />
                    )}
                </form.AppField>
                <form.AppField name="rawCode">
                    {(field) => (
                        <field.TextField
                            label={t("logistics.form.rawCode")}
                            required
                            hint={t("logistics.form.rawCodeHint")}
                        />
                    )}
                </form.AppField>
                <form.AppField name="standardCode">
                    {(field) => (
                        <field.SelectField
                            label={t("logistics.form.standardCode")}
                            required
                            items={RECORDABLE_CODES.map((entry) => ({
                                value: entry.code,
                                label: t(entry.labelKey),
                            }))}
                        />
                    )}
                </form.AppField>
                <form.AppField name="note">
                    {(field) => (
                        <field.TextField
                            label={t("logistics.form.mapNote")}
                            hint={t("logistics.form.mapNoteHint")}
                        />
                    )}
                </form.AppField>
            </div>
            <div className="flex items-center gap-2">
                <Button
                    type="submit"
                    size="sm"
                    disabled={upsert.isPending}
                >
                    {upsert.isPending && <Spinner />}
                    {t("logistics.codeMap.save")}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onDone}
                >
                    {t("logistics.codeMap.cancel")}
                </Button>
            </div>
        </InlineFormCard>
    )
}

/** messageFactFactory 的 key 在这里逐个静态出现，i18n 引用扫描才看得到 */
function errFact(key: AdminMessageKey) {
    return key
}

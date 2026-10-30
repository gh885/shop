import type { TraceRow } from "@shop/api/sdk"
import { AdminTraceControllerApi } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

import { message } from "#/locales/message"

export const logisticsKeys = {
    all: ["logistics"] as const,
    codeMap: (limit: number) => [...logisticsKeys.all, "code-map", limit] as const,
    unmapped: (limit: number) => [...logisticsKeys.all, "unmapped", limit] as const,
    timeline: (carrierCode: string, trackingNo: string) =>
        [...logisticsKeys.all, "timeline", carrierCode, trackingNo] as const,
}

export const CODE_MAP_LIMIT = 500
export const UNMAPPED_LIMIT = 50

export const codeMapOptions = () =>
    queryOptions({
        queryKey: logisticsKeys.codeMap(CODE_MAP_LIMIT),
        queryFn: ({ signal }) =>
            AdminTraceControllerApi.codeMap({ query: { limit: CODE_MAP_LIMIT }, signal }),
    })

export const unmappedOptions = () =>
    queryOptions({
        queryKey: logisticsKeys.unmapped(UNMAPPED_LIMIT),
        queryFn: ({ signal }) =>
            AdminTraceControllerApi.unmapped({ query: { limit: UNMAPPED_LIMIT }, signal }),
    })

/** 按单号核对：排查入口，由表单提交触发（enabled 关着，避免未输入就空查） */
export const timelineOptions = (carrierCode: string, trackingNo: string) =>
    queryOptions({
        queryKey: logisticsKeys.timeline(carrierCode, trackingNo),
        queryFn: ({ signal }) =>
            AdminTraceControllerApi.byTrackingNo({
                query: { carrierCode, trackingNo },
                signal,
            }),
    })

/**
 * 手工补录：能推进包裹到已签收并触发订单完成，与承运商 HMAC 推送口同等危险——
 * 所以 note 必填（查账证据），signedBy 可选（纠纷时「谁签的字」是买家唯一认的证据）。
 */
export function useRecordTrace() {
    return useMutation({
        mutationFn: (input: {
            carrierCode: string
            trackingNo: string
            standardCode: string
            note: string
            signedBy?: string
            occurredAt?: string
        }) =>
            AdminTraceControllerApi.record({
                body: {
                    carrierCode: input.carrierCode,
                    trackingNo: input.trackingNo,
                    standardCode: input.standardCode,
                    note: input.note,
                    signedBy: input.signedBy || undefined,
                    occurredAt: input.occurredAt || undefined,
                },
            }),
        meta: {
            success: message("logistics.record.done"),
            error: message("logistics.record.failed"),
            invalidates: [logisticsKeys.all],
        },
    })
}

export function useUpsertCodeMap() {
    return useMutation({
        mutationFn: (input: {
            carrierCode: string
            rawCode: string
            standardCode: string
            note?: string
        }) =>
            AdminTraceControllerApi.upsertCodeMap({
                body: {
                    carrierCode: input.carrierCode,
                    rawCode: input.rawCode,
                    standardCode: input.standardCode,
                    note: input.note || undefined,
                },
            }),
        meta: {
            success: message("logistics.codeMap.saved"),
            error: message("logistics.codeMap.saveFailed"),
            invalidates: [logisticsKeys.all],
        },
    })
}

/** 删掉映射后这个原始码会记 unknown 并回到缺口清单——删除是「重新认不认识」，不是撤销 */
export function useDeleteCodeMap() {
    return useMutation({
        mutationFn: (input: { carrierCode: string; rawCode: string }) =>
            AdminTraceControllerApi.deleteCodeMap({
                query: { carrierCode: input.carrierCode, rawCode: input.rawCode },
            }),
        meta: {
            success: message("logistics.codeMap.deleted"),
            error: message("logistics.codeMap.deleteFailed"),
            invalidates: [logisticsKeys.all],
        },
    })
}

/** Timeline 里轨迹行的展示次序：最新在前，核对场景先看最后收到什么 */
export function tracesNewestFirst(traces: TraceRow[]): TraceRow[] {
    return traces.toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}

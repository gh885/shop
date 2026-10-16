import { describe, expect, it } from "vite-plus/test"
import { renderHook } from "@testing-library/react"

import { I18nProvider, createAppI18n } from "@shop/app-kit/i18n"
import type { AppLocale } from "@shop/i18n"
import type { AfterSaleReason, TicketStatus, TicketType } from "@shop/api/sdk"
import type { ReactNode } from "react"

import { webMessages } from "#/locales"
import { useT } from "#/locales/use-t"

import { ORDER_CARD_STATUS_TONE, TICKET_STATUS_TONE } from "./constants"
import {
    afterSaleActionLabel,
    afterSaleReasonLabel,
    afterSaleTypeHint,
    afterSaleTypeLabel,
    orderActionLabel,
    orderCardHint,
    orderStatusLabel,
    ticketStatusLabel,
} from "./order-label"
import type { AfterSaleAction } from "./after-sale"
import type { OrderAction, OrderStatus } from "./model"

function isBroken(text: string): boolean {
    return text.startsWith("order.") || text.trim() === ""
}

function renderT(locale: AppLocale) {
    const i18n = createAppI18n(locale, webMessages)
    const wrapper = ({ children }: { children: ReactNode }) => (
        <I18nProvider i18n={i18n}>{children}</I18nProvider>
    )
    return renderHook(() => useT(), { wrapper }).result.current
}

const ORDER_STATUSES: readonly OrderStatus[] = [
    "pending_payment",
    "pending_shipment",
    "pending_receipt",
    "completed",
    "cancelled",
]
const ORDER_ACTIONS: readonly OrderAction[] = [
    "pay",
    "cancel",
    "logistics",
    "confirm",
    "extend_receive",
    "rebuy",
    "add_cart",
    "ship",
]
const TICKET_STATUSES: readonly TicketStatus[] = [
    "APPLYING",
    "RETURNING",
    "REFUNDED",
    "REJECTED",
    "CLOSED",
]
const TICKET_TYPES: readonly TicketType[] = ["REFUND_ONLY", "RETURN_REFUND"]
const REASONS: readonly AfterSaleReason[] = [
    "NO_REASON",
    "QUALITY_ISSUE",
    "NOT_AS_DESCRIBED",
    "DAMAGED",
    "WRONG_ITEM",
    "MISSING_ITEM",
    "OTHER",
]
const AFTER_SALE_ACTIONS: readonly AfterSaleAction[] = ["cancel", "return", "track", "reapply"]

describe("订单文案两种语言都有句子", () => {
    const zh = renderT("zh-Hans-CN")
    const en = renderT("en-US")

    it("每个订单状态都有状态名与卡片提示", () => {
        for (const status of ORDER_STATUSES) {
            expect(isBroken(orderStatusLabel(status, zh)), `status/${status}/zh`).toBe(false)
            expect(isBroken(orderStatusLabel(status, en)), `status/${status}/en`).toBe(false)
            expect(isBroken(orderCardHint(status, zh)), `hint/${status}/zh`).toBe(false)
            expect(isBroken(orderCardHint(status, en)), `hint/${status}/en`).toBe(false)
        }
    })

    it("每个动作都有按钮文案", () => {
        for (const action of ORDER_ACTIONS) {
            expect(isBroken(orderActionLabel(action, zh)), `action/${action}/zh`).toBe(false)
            expect(isBroken(orderActionLabel(action, en)), `action/${action}/en`).toBe(false)
        }
    })

    it("售后两类（名 + 引导语）都有句子", () => {
        for (const type of TICKET_TYPES) {
            expect(isBroken(afterSaleTypeLabel(type, zh)), `type/${type}/zh`).toBe(false)
            expect(isBroken(afterSaleTypeLabel(type, en)), `type/${type}/en`).toBe(false)
            expect(isBroken(afterSaleTypeHint(type, zh)), `typeHint/${type}/zh`).toBe(false)
            expect(isBroken(afterSaleTypeHint(type, en)), `typeHint/${type}/en`).toBe(false)
        }
    })

    it("七个售后原因都有句子", () => {
        for (const reason of REASONS) {
            expect(isBroken(afterSaleReasonLabel(reason, zh)), `reason/${reason}/zh`).toBe(false)
            expect(isBroken(afterSaleReasonLabel(reason, en)), `reason/${reason}/en`).toBe(false)
        }
    })

    it("五个售后单状态与四个买家动作都有句子", () => {
        for (const status of TICKET_STATUSES) {
            expect(isBroken(ticketStatusLabel(status, zh)), `ticket/${status}/zh`).toBe(false)
            expect(isBroken(ticketStatusLabel(status, en)), `ticket/${status}/en`).toBe(false)
        }
        for (const action of AFTER_SALE_ACTIONS) {
            expect(isBroken(afterSaleActionLabel(action, zh)), `asAction/${action}/zh`).toBe(false)
            expect(isBroken(afterSaleActionLabel(action, en)), `asAction/${action}/en`).toBe(false)
        }
    })

    it("两种语言给的是不同句子（不然等于没翻）", () => {
        expect(orderStatusLabel("completed", zh)).not.toBe(orderStatusLabel("completed", en))
        expect(orderCardHint("cancelled", zh)).not.toBe(orderCardHint("cancelled", en))
    })
})

describe("色板与文案两张表一一对齐", () => {
    it("订单状态色板覆盖全部状态（漏一个就是「状态对了但徽章没色」）", () => {
        expect(Object.keys(ORDER_CARD_STATUS_TONE).toSorted()).toEqual(
            [...ORDER_STATUSES].toSorted(),
        )
    })

    it("售后单状态色板覆盖全部状态", () => {
        expect(Object.keys(TICKET_STATUS_TONE).toSorted()).toEqual([...TICKET_STATUSES].toSorted())
    })
})

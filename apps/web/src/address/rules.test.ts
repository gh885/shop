import { describe, expect, it } from "vite-plus/test"

import type { AddressResponse } from "@shop/api/sdk"

import { pickedAddressId } from "./rules"
import { toAddress } from "./mapper"

function makeAddress(overrides: Partial<AddressResponse> = {}): AddressResponse {
    return {
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001",
        userId: "6f1a5b1e-2f3c-4a5d-8e9f-000000000002",
        receiverName: "张三",
        phone: "13800000000",
        regionCode: "310101",
        province: "上海市",
        city: "上海市",
        district: "黄浦区",
        detail: "南京东路 1 号",
        label: "HOME",
        isDefault: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
        ...overrides,
    }
}

describe("pickedAddressId", () => {
    const row = (id: string, isDefault = false) => toAddress(makeAddress({ id, isDefault }))
    const list = [row("a"), row("b", true), row("c")]

    it("用户勾了就用用户勾的，包括勾回非默认那一条", () => {
        expect(pickedAddressId(list, "a")).toBe("a")
    })

    it("没勾则取带默认标记的那条，而不是列表第一条", () => {
        expect(pickedAddressId(list, "")).toBe("b")
    })

    it("没有默认标记时退回第一条", () => {
        expect(pickedAddressId([row("x"), row("y")], "")).toBe("x")
    })

    it("空列表给空串而不是抛：地址卡片那支会自己去渲染「还没有收货地址」", () => {
        expect(pickedAddressId([], undefined)).toBe("")
    })
})

import { describe, expect, it } from "vitest"

import type { AddressResponse } from "@shop/api/sdk"

import { type Address, pickedAddressId, toAddress } from "./address"

/**
 * 地址的 wire → 领域投影。
 *
 * 这张表只有一处真变换（`receiverName → receiver`），但它同时是「契约字段偷偷漏掉」的
 * 高发面：新增一个字段而这里没跟上，编译不报错，地址卡片与结算页就少一行。
 * 所以整表比一次，逐个字段钉住去向。
 */

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

describe("toAddress", () => {
    it("只有收件人改名，其余字段一个都不丢", () => {
        const address: Address = toAddress(makeAddress())

        expect(address).toEqual({
            id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001",
            receiver: "张三",
            phone: "13800000000",
            regionCode: "310101",
            province: "上海市",
            city: "上海市",
            district: "黄浦区",
            detail: "南京东路 1 号",
            label: "HOME",
            isDefault: true,
        })
    })

    it("归属与审计字段不进业务形状：userId / createdAt 不该出现在地址卡片上", () => {
        const address = toAddress(makeAddress()) as Address & Record<string, unknown>

        expect(address).not.toHaveProperty("userId")
        expect(address).not.toHaveProperty("createdAt")
        expect(address).not.toHaveProperty("updatedAt")
        expect(address).not.toHaveProperty("receiverName")
    })

    it("标签缺省保持缺省：空标签是「没贴标签」，不该被折成空串渲染出一个引号", () => {
        expect(toAddress(makeAddress({ label: "" })).label).toBe("")
    })
})

/**
 * 「选中哪一条地址」这条判据此前在结算页写了两遍，第二遍还带 `addresses[0]!`。
 * 收成一处之后，这四条就是它的全部行为——四条都在钉「两处必须给同一个答案」。
 */
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

import { describe, expect, it } from "vite-plus/test"

import { isMobileDeviceName } from "./device"

describe("isMobileDeviceName", () => {
    it("常见 UA 片段算手机_中英文与大小写都不该漏", () => {
        expect(isMobileDeviceName("iPhone 15")).toBe(true)
        expect(isMobileDeviceName("iphone")).toBe(true)
        expect(isMobileDeviceName("Android 14 / Chrome")).toBe(true)
        expect(isMobileDeviceName("小米手机")).toBe(true)
    })

    it("桌面与缺失一律 false_猜不出来就画台式机图标，不画一个错的方向", () => {
        expect(isMobileDeviceName("Windows 11 / Edge")).toBe(false)
        expect(isMobileDeviceName("macOS Safari")).toBe(false)
        expect(isMobileDeviceName(null)).toBe(false)
        expect(isMobileDeviceName("")).toBe(false)
    })
})

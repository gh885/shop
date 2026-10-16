import { describe, expect, it } from "vite-plus/test"

import { avatarInitial } from "./avatar"

describe("avatarInitial", () => {
    it("中文取首字_拉丁字母转大写：同一个昵称在三处头像里得是同一个字形", () => {
        expect(avatarInitial("迅qq")).toBe("迅")
        expect(avatarInitial("alice")).toBe("A")
    })

    it("先 trim_前导空格不会顶到一个空白头像", () => {
        expect(avatarInitial("  bob")).toBe("B")
    })

    it("emoji 与非 BMP 字符按码位取_不会切出半个代理对", () => {
        expect(avatarInitial("🙂微笑")).toBe("🙂")
        expect(avatarInitial("𠀀水")).toBe("𠀀")
    })

    it("空名字交出空串_占位文案由调用方决定，这里不替它们选一个字符", () => {
        expect(avatarInitial("")).toBe("")
        expect(avatarInitial("   ")).toBe("")
    })
})

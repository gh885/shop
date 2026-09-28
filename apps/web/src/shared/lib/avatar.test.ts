import { describe, expect, it } from "vite-plus/test"

import { avatarInitial } from "./avatar"

/**
 * 头像兜底字符只有一件值得钉的事：取「第一个字符」不能取成半个字符。
 *
 * 名字为空的场景由各调用方自己决定占位文案（顶栏「…」/用户卡「未登录」），
 * 所以这里空输入交出空串而不是替它们发明一个字形，也是一条决定。
 */
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

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Image } from "./image"

const SRC = "http://cdn.example.com/product/a.webp"

function requireImg(): HTMLImageElement {
    const el = document.querySelector("img")
    if (!el) throw new Error("期望渲染 img，实际没有")
    return el
}

describe("Image", () => {
    it("有 src：渲染 img，默认懒加载 + 异步解码 + imageMogr2 多档 srcset", () => {
        render(
            <Image
                src={SRC}
                alt="商品图"
            />,
        )
        const el = requireImg()
        expect(el.getAttribute("loading")).toBe("lazy")
        expect(el.getAttribute("decoding")).toBe("async")
        const srcset = el.getAttribute("srcset") ?? ""
        expect(srcset).toContain(`${SRC}?imageMogr2/thumbnail/120x 120w`)
        expect(srcset).toContain(`${SRC}?imageMogr2/thumbnail/1440x 1440w`)
        expect(srcset).toContain("480w")
    })

    it("URL 已带 query 时用 & 追加处理参数", () => {
        render(
            <Image
                src={`${SRC}?v=2`}
                alt="x"
                widths={[240]}
            />,
        )
        expect(requireImg().getAttribute("srcset")).toContain(
            `${SRC}?v=2&imageMogr2/thumbnail/240x 240w`,
        )
    })

    it('空 src：渲染占位而非 img，无 src="" 警告面', () => {
        render(
            <Image
                src=""
                alt="商品图"
            />,
        )
        expect(document.querySelector("img")).toBeNull()
        expect(screen.getByRole("img", { name: "商品图" })).toHaveTextContent("暂无图片")
    })

    it("加载失败切占位，换 src 后恢复渲染", () => {
        const { rerender } = render(
            <Image
                src={SRC}
                alt="商品图"
            />,
        )
        fireEvent.error(requireImg())
        expect(screen.getByRole("img", { name: "商品图" })).toHaveTextContent("暂无图片")
        rerender(
            <Image
                src={`${SRC}?v=2`}
                alt="商品图"
            />,
        )
        expect(requireImg().getAttribute("src")).toBe(`${SRC}?v=2`)
    })

    it("priority：eager + fetchpriority=high", () => {
        render(
            <Image
                src={SRC}
                alt="首屏"
                priority
            />,
        )
        const el = requireImg()
        expect(el.getAttribute("loading")).toBe("eager")
        expect(el.getAttribute("fetchpriority")).toBe("high")
    })

    it("dataURL 不拼处理参数", () => {
        render(
            <Image
                src="data:image/webp;base64,AAAA"
                alt="预览"
            />,
        )
        expect(requireImg().getAttribute("srcset")).toBeNull()
    })

    it("widths=[] 关闭拼接", () => {
        render(
            <Image
                src={SRC}
                alt="原图"
                widths={[]}
            />,
        )
        expect(requireImg().getAttribute("srcset")).toBeNull()
    })

    it("ratio 经 --ratio 变量给 aspect-(--ratio) 占位，img 与占位都生效", () => {
        render(
            <Image
                src={SRC}
                alt="横幅"
                ratio={16 / 9}
            />,
        )
        expect(requireImg().className).toContain("aspect-(--ratio)")
        expect(requireImg().style.getPropertyValue("--ratio")).toBe(String(16 / 9))
        fireEvent.error(requireImg())
        expect(screen.getByRole("img", { name: "横幅" }).className).toContain("aspect-(--ratio)")
    })

    it("radius 给组件自有圆角档（占位与 img 都生效）", () => {
        render(
            <Image
                src={SRC}
                alt="x"
                radius="lg"
            />,
        )
        expect(requireImg().className).toContain("rounded-lg")
    })

    it("hoverScale 才带放大动效类（动效归组件，业务不 restyle）", () => {
        render(
            <Image
                src={SRC}
                alt="卡片图"
                hoverScale
            />,
        )
        expect(requireImg().className).toContain("group-hover:scale-104")
    })

    it("消费方 className 覆盖默认（tailwind-merge：object-contain 顶掉 object-cover）", () => {
        render(
            <Image
                src={SRC}
                alt="x"
                className="size-24 object-contain"
            />,
        )
        expect(requireImg().getAttribute("class")).not.toContain("object-cover")
    })
})

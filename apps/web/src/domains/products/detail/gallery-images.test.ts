import { describe, expect, it } from "vite-plus/test"

import { galleryImages } from "./gallery-images"

describe("galleryImages", () => {
    it("SKU 专属图排到最前_选中规格后主图跟着换", () => {
        expect(
            galleryImages({
                images: ["a.jpg", "b.jpg"],
                productImage: "p.jpg",
                skuImage: "red.jpg",
            }),
        ).toEqual(["red.jpg", "a.jpg", "b.jpg"])
    })

    it("专属图本来就在图集里_只挪到最前，不会留下两份", () => {
        expect(galleryImages({ images: ["a.jpg", "b.jpg"], skuImage: "b.jpg" })).toEqual([
            "b.jpg",
            "a.jpg",
        ])
    })

    it("整个图集为空才退回商品主图_有图集时不把主图插进去（主图与详情图规格不同）", () => {
        expect(galleryImages({ images: [], productImage: "p.jpg" })).toEqual(["p.jpg"])
        expect(galleryImages({ images: ["a.jpg"], productImage: "p.jpg" })).toEqual(["a.jpg"])
    })

    it("图集与主图都没有_交出空数组，不造一个坏 URL", () => {
        expect(galleryImages({ images: [], productImage: null })).toEqual([])
    })

    it("空串与缺失的 URL 一律不进结果_它们会让画廊渲染出一张空白帧和一个空 key", () => {
        expect(galleryImages({ images: ["a.jpg", "", null, undefined], productImage: "" })).toEqual(
            ["a.jpg"],
        )
        expect(galleryImages({ images: ["a.jpg"], skuImage: "" })).toEqual(["a.jpg"])
    })

    it("图集内部重复_去重，保持首次出现的顺序", () => {
        expect(galleryImages({ images: ["a.jpg", "a.jpg", "b.jpg"] })).toEqual(["a.jpg", "b.jpg"])
    })
})

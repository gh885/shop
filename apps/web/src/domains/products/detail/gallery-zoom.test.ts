import { describe, expect, it } from "vite-plus/test"

import { bgPos, clampCenter, lensGeometry, ZOOM } from "./gallery-zoom"

const SQUARE = { naturalAspect: 1, frameWidth: 100, frameHeight: 100 }

function percent(geom: { backgroundPosition: string }): [number, number] {
    const [x = "", y = ""] = geom.backgroundPosition.split(" ")
    return [Number.parseFloat(x), Number.parseFloat(y)]
}

describe("主图放大镜几何", () => {
    it("正方图放进正方框且指针在中心_预览落点就是图心", () => {
        const geom = lensGeometry({ ...SQUARE, pointerX: 0.5, pointerY: 0.5 })
        expect(geom.backgroundPosition).toBe("50% 50%")
    })

    it("指针拖到左上角_蒙层被夹住不越出图，预览正好落在原图左上角", () => {
        const geom = lensGeometry({ ...SQUARE, pointerX: 0, pointerY: 0 })
        expect([geom.fx, geom.fy]).toEqual([0.2, 0.2])
        expect(geom.backgroundPosition).toBe("0% 0%")
    })

    it("横图放进正方框_可见的原图比例只剩一半_蒙层占框因此更大", () => {
        const geom = lensGeometry({
            naturalAspect: 2,
            frameWidth: 100,
            frameHeight: 100,
            pointerX: 0.5,
            pointerY: 0.5,
        })
        expect([geom.lensX, geom.lensY]).toEqual([0.8, 0.8])
    })

    it("被裁的那一轴指针走到边也看不到原图边缘_未裁的那一轴能走到 100%", () => {
        const geom = lensGeometry({
            naturalAspect: 2,
            frameWidth: 100,
            frameHeight: 100,
            pointerX: 1,
            pointerY: 1,
        })
        const [x, y] = percent(geom)
        expect(x, "横向可见范围只占原图一半，所以框边对应原图中段").toBeCloseTo(
            100 * ((ZOOM * 0.55 - 0.5) / (ZOOM - 1)),
            6,
        )
        expect(y, "纵向没被裁，框边就是原图边").toBeCloseTo(100, 6)
    })
})

describe("bgPos：原图比例不是 background-position", () => {
    it("图心映射到 50%、放大后两端映射到 0% 与 100%", () => {
        expect(bgPos(0.5, ZOOM)).toBe("50%")
        expect(bgPos(0.2, ZOOM)).toBe("0%")
        expect(bgPos(0.8, ZOOM)).toBe("100%")
    })
})

describe("clampCenter", () => {
    it("越界收到边界内_留住的正是蒙层半径", () => {
        expect(clampCenter(1, 0.2)).toBe(0.8)
        expect(clampCenter(0, 0.2)).toBe(0.2)
        expect(clampCenter(0.5, 0.2)).toBe(0.5)
    })
})

import { describe, expect, it } from "vitest"

import {
    compareMoney,
    fenToYuan,
    formatMoney,
    isPositiveMoney,
    maxMoney,
    minMoney,
    money,
    moneyToYuan,
    plusMoney,
    priceRangeText,
    splitFen,
    splitMoney,
    strikethroughPrice,
    sumMoney,
    timesMoney,
    yuanToFen,
    yuanToMoney,
    zeroMoney,
} from "./money"

/** 金额工具测试：分↔元换算是唯一真相源，币种是 Money 的一部分而不是注释里的口头约定 */
describe("money 构造", () => {
    it("按分给数，币种默认平台定价币种", () => {
        expect(money(29900)).toEqual({ amount: 29900, currency: "CNY" })
    })

    it("零金额的币种跟着手上的钱，不凭空造 CNY", () => {
        expect(zeroMoney("USD")).toEqual({ amount: 0, currency: "USD" })
    })
})

describe("金额运算", () => {
    it("相加/乘倍都在同币种内进行", () => {
        expect(plusMoney(money(100), money(250))).toEqual(money(350))
        expect(timesMoney(money(1000), 3)).toEqual(money(3000))
    })

    it("跨币种运算抛错：把 CNY 和 USD 加成一个数是算错钱，不是精度问题", () => {
        expect(() => plusMoney(money(100, "CNY"), money(100, "USD"))).toThrow(/币种不一致/)
        expect(() => plusMoney(money(Number.MAX_SAFE_INTEGER), money(1))).toThrow(/安全整数范围/)
    })

    it("非法倍数抛错：负金额与小数倍数都不该在链路里漂流", () => {
        expect(() => timesMoney(money(100), 1.5)).toThrow(/非负安全整数/)
        expect(() => timesMoney(money(100), -1)).toThrow(/非负安全整数/)
        expect(() => timesMoney(money(Number.MAX_SAFE_INTEGER), 2)).toThrow(/安全整数范围/)
    })

    it("求和：空集合取传入的零值，非空按同币种累加", () => {
        expect(sumMoney([])).toEqual(zeroMoney())
        expect(sumMoney([], zeroMoney("USD"))).toEqual(zeroMoney("USD"))
        expect(sumMoney([money(100), money(200), money(300)])).toEqual(money(600))
    })

    it("求和的起点币种跟第一笔钱：一叠 USD 不该撞上 CNY 的零", () => {
        expect(sumMoney([money(100, "USD"), money(200, "USD")])).toEqual(money(300, "USD"))
    })
})

describe("金额比较与判定", () => {
    it("比较大小：只给先后，不拆出裸分去比", () => {
        expect(compareMoney(money(200), money(100))).toBe(1)
        expect(compareMoney(money(100), money(200))).toBe(-1)
        expect(compareMoney(money(100), money(100))).toBe(0)
    })

    it("跨币种比较抛错：和相加同一口径，不静默排个错的序", () => {
        expect(() => compareMoney(money(100, "CNY"), money(100, "USD"))).toThrow(/币种不一致/)
    })

    it("「真有钱」把 0 判在外面：优惠为 0、门槛为 0 都是「没有这一项」", () => {
        expect(isPositiveMoney(money(1))).toBe(true)
        expect(isPositiveMoney(money(0))).toBe(false)
    })

    it("最低/最高：空集合给 undefined，调用方不必先判长度", () => {
        expect(minMoney([])).toBeUndefined()
        expect(maxMoney([])).toBeUndefined()
        const prices = [money(300), money(100), money(200)]
        expect(minMoney(prices)).toEqual(money(100))
        expect(maxMoney(prices)).toEqual(money(300))
    })

    it("划线价只在原价严格高于成交价时才画：相等是「没让钱」，画出来就是假折扣", () => {
        expect(strikethroughPrice(money(20000), money(19900))).toEqual(money(20000))
        expect(strikethroughPrice(money(19900), money(19900))).toBeUndefined()
        expect(strikethroughPrice(money(10000), money(19900))).toBeUndefined()
    })

    it("划线价容忍缺席：契约里 originalPrice 可空，没价的商品也不该抛", () => {
        expect(strikethroughPrice(null, money(19900))).toBeUndefined()
        expect(strikethroughPrice(undefined, money(19900))).toBeUndefined()
        expect(strikethroughPrice(money(20000), undefined)).toBeUndefined()
    })
})

describe("fenToYuan", () => {
    it("分 → 两位小数元字符串", () => {
        expect(fenToYuan(29900)).toBe("299.00")
        expect(fenToYuan(0)).toBe("0.00")
        expect(fenToYuan(5)).toBe("0.05")
        expect(fenToYuan(1005)).toBe("10.05")
    })

    it("undefined 显示占位符（可自定义）", () => {
        expect(fenToYuan(undefined)).toBe("—")
        expect(fenToYuan(undefined, "面议")).toBe("面议")
    })
})

describe("展示出口", () => {
    it("金额带币种符号、千分位分组", () => {
        expect(formatMoney(money(29900))).toBe("¥299.00")
        expect(formatMoney(money(100000))).toBe("¥1,000.00")
        expect(formatMoney(money(1234567))).toBe("¥12,345.67")
    })

    it("未知币种退化成本身，不猜符号", () => {
        expect(formatMoney(money(100, "BTC"))).toBe("BTC 1.00")
    })

    it("缺席显示占位符，而不是 ¥0.00：零和「没有数」是两件事", () => {
        expect(formatMoney(undefined)).toBe("—")
        expect(formatMoney(null, "未退成")).toBe("未退成")
    })

    it("分段排版：符号 / 元整数（分组）/ 角分", () => {
        expect(splitFen(1234)).toEqual({ yuan: "12", cents: "34" })
        expect(splitFen(5)).toEqual({ yuan: "0", cents: "05" })
        expect(splitFen(1200)).toEqual({ yuan: "12", cents: "00" })
        expect(splitMoney(money(123456))).toEqual({ symbol: "¥", yuan: "1,234", cents: "56" })
    })
})

describe("表单输入 → 契约", () => {
    it("元输入 → Money", () => {
        expect(yuanToMoney("12.34")).toEqual(money(1234))
        expect(yuanToMoney("0")).toEqual(money(0))
    })

    it("非法输入返回 undefined（空串/非数字/负数），由调用方拦截", () => {
        expect(yuanToMoney("")).toBeUndefined()
        expect(yuanToMoney("  ")).toBeUndefined()
        expect(yuanToMoney("abc")).toBeUndefined()
        expect(yuanToMoney("-5")).toBeUndefined()
        expect(yuanToMoney("Infinity")).toBeUndefined()
        expect(yuanToMoney("1e309")).toBeUndefined()
    })

    it("元输入 → 分（四舍五入到分）", () => {
        expect(yuanToFen("12.34")).toBe(1234)
        expect(yuanToFen("0.1")).toBe(10)
        expect(yuanToFen("10")).toBe(1000)
    })

    it("Number() 认得的非法形状一律拒收，不静默换算成别的金额", () => {
        expect(yuanToFen("0x10")).toBeUndefined()
        expect(yuanToFen("1e3")).toBeUndefined()
        expect(yuanToFen("+5")).toBeUndefined()
        expect(yuanToFen("12.345")).toBeUndefined()
    })

    it("Money → 输入框回填（两位小数，不含符号）", () => {
        expect(moneyToYuan(money(100500))).toBe("1005.00")
        expect(moneyToYuan(null)).toBe("")
    })
})

describe("priceRangeText", () => {
    it("未定价占位", () => {
        expect(priceRangeText(undefined)).toBe("未定价")
    })

    it("单规格同价只显示一个价", () => {
        expect(priceRangeText(money(100))).toBe("¥1.00")
        expect(priceRangeText(money(100), money(100))).toBe("¥1.00")
    })

    it("区间展示两端", () => {
        expect(priceRangeText(money(100), money(250))).toBe("¥1.00 ~ ¥2.50")
    })
})

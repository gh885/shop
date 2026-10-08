import { describe, expect, it } from "vite-plus/test"

import {
    compactMoneyText,
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

describe("展示出口（Intl.NumberFormat，locale 必填）", () => {
    it("金额带币种符号、千分位分组", () => {
        expect(formatMoney(money(29900), "zh-Hans-CN")).toBe("¥299.00")
        expect(formatMoney(money(100000), "zh-Hans-CN")).toBe("¥1,000.00")
        expect(formatMoney(money(1234567), "zh-Hans-CN")).toBe("¥12,345.67")
    })

    it("narrowSymbol：两种语言逐条相同，不因 locale 改动 CNY 的写法", () => {
        // 默认的 currencyDisplay:"symbol" 在 en-US 下会渲染成 CN¥299.00（Intl 为消歧加的 ISO 前缀），
        // 那是对英文用户可见的行为变更，所以这里钉住窄符号：换成默认的话这条当场红
        expect(formatMoney(money(1234567), "en-US")).toBe("¥12,345.67")
    })

    it("小数位跟 Money 模型（恒两位「分」），不跟币种：JPY 也带两位", () => {
        // Intl 的 currency 默认小数位对 JPY 是 0，那样 1500 分会被渲染成 ¥15——少两个零的钱看着还是钱
        expect(formatMoney(money(1500, "JPY"), "zh-Hans-CN")).toBe("¥15.00")
    })

    it("3 字母的未知币种由 Intl 自己退成「代码 + 数字」（中间是不换行空格）", () => {
        // Intl 对任意 3 字母形状都给「未知币种」退路，不抛；旧手写退路用的是普通空格，
        // 差这一个字符。认了：不换行比可断行好
        expect(formatMoney(money(100, "BTC"), "zh-Hans-CN")).toBe("BTC 1.00")
    })

    it("非 3 字母的非法码（Intl 抛 RangeError）退成「代码 + 数字」，且仍带千分位", () => {
        expect(formatMoney(money(123456, "CNYX"), "zh-Hans-CN")).toBe("CNYX 1,234.56")
        expect(formatMoney(money(100, "US"), "zh-Hans-CN")).toBe("US 1.00")
    })

    it("缺席显示占位符，而不是 ¥0.00：零和「没有数」是两件事", () => {
        expect(formatMoney(undefined, "zh-Hans-CN")).toBe("—")
        expect(formatMoney(null, "zh-Hans-CN", "未退成")).toBe("未退成")
    })

    it("分段排版：符号 / 元整数（分组由 Intl 给）/ 角分（保留前导零）", () => {
        expect(splitMoney(money(123456), "zh-Hans-CN")).toEqual({
            symbol: "¥",
            yuan: "1,234",
            cents: "56",
        })
        expect(splitMoney(money(5), "zh-Hans-CN")).toEqual({ symbol: "¥", yuan: "0", cents: "05" })
        expect(splitMoney(money(1200), "en-US")).toEqual({ symbol: "¥", yuan: "12", cents: "00" })
        expect(splitMoney(money(12345678), "en-US")).toEqual({
            symbol: "¥",
            yuan: "123,456",
            cents: "78",
        })
    })

    it("非法币种的分段排版也退成代码 + 数字，且整数段照样带千分位", () => {
        expect(splitMoney(money(123456, "CNYX"), "zh-Hans-CN")).toEqual({
            symbol: "CNYX ",
            yuan: "1,234",
            cents: "56",
        })
    })
})

describe("compactMoneyText（券面整元语义）", () => {
    it("尾零按值收：整元 0 位、角为 0 十分位 1 位、其余 2 位", () => {
        expect(compactMoneyText(money(100000), "zh-Hans-CN")).toBe("¥1,000")
        expect(compactMoneyText(money(990), "zh-Hans-CN")).toBe("¥9.9")
        // 1050 分 = 10.50 元，角分位是 50 → 收成 1 位（与老 couponYuanText 的 "10.5" 一致）
        expect(compactMoneyText(money(1050), "zh-Hans-CN")).toBe("¥10.5")
        expect(compactMoneyText(money(1055), "zh-Hans-CN")).toBe("¥10.55")
    })

    it("小于一元的角分不丢：¥0.05 不能显示成 ¥0", () => {
        expect(compactMoneyText(money(5), "zh-Hans-CN")).toBe("¥0.05")
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
    it("缺席交回 undefined：占位文案归调用方（common 不承载用户可见文案，§4.1）", () => {
        expect(priceRangeText(undefined, undefined, "zh-Hans-CN")).toBeUndefined()
        expect(priceRangeText(null, money(100), "zh-Hans-CN")).toBeUndefined()
    })

    it("单规格同价只显示一个价", () => {
        expect(priceRangeText(money(100), undefined, "zh-Hans-CN")).toBe("¥1.00")
        expect(priceRangeText(money(100), money(100), "zh-Hans-CN")).toBe("¥1.00")
    })

    it("区间展示两端", () => {
        expect(priceRangeText(money(100), money(250), "zh-Hans-CN")).toBe("¥1.00 ~ ¥2.50")
    })
})

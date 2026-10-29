import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type CSSProperties,
} from "react"
import { useWindowVirtualizer } from "@tanstack/react-virtual"

import { ProductCard, toProductCardData, type Product } from "#/domains/products"

/**
 * 商品流的行虚拟化：以「一排商品」为单位开窗，只为视口附近的几排建 DOM。
 * 直铺 8 页 × 24 条时页面里是 192 张卡片、上千个节点，滚动时的布局与合成都很重；
 * 开窗后节点数恒定在「视口排数 + 缓冲区」这一档，不随数据量涨。
 */

/**
 * 必须和 `grid-feed` 的 Tailwind 断点逐档对齐（sm 640 / md 768 / lg 1024）：
 * 一排塞的商品数和 CSS 轨道数不一致时，多出来的会折行，把行高和滚动条一起算歪。
 */
const COLUMN_BREAKPOINTS = [
    { min: 1024, columns: 6 },
    { min: 768, columns: 4 },
    { min: 640, columns: 3 },
] as const

const MOBILE_COLUMNS = 2

/** 还没量到真实行高时一排按 300 估：卡片 ≈ 图片 + 文字区，量到后由 measureElement 覆盖 */
const ROW_ESTIMATE = 300

/** 视口上下各多渲染一排：滚动时下一排已经在 DOM 里，不会滚出空白 */
const OVERSCAN_ROWS = 2

/** SSR 拿不到视口高度，按这个高度估出要直出的排数（首屏 HTML 里必须有商品图） */
const SSR_VIEWPORT = 1600

function columnsForWidth(width: number): number {
    for (const { min, columns } of COLUMN_BREAKPOINTS) {
        if (width >= min) return columns
    }
    return MOBILE_COLUMNS
}

function subscribeColumns(onChange: () => void): () => void {
    window.addEventListener("resize", onChange)
    return () => window.removeEventListener("resize", onChange)
}

function readColumns(): number {
    return columnsForWidth(window.innerWidth)
}

/** 服务端不知道视口宽度，先按移动端两列直出；客户端 hydration 后用真实值替换 */
function serverColumns(): number {
    return MOBILE_COLUMNS
}

function useColumns(): number {
    return useSyncExternalStore(subscribeColumns, readColumns, serverColumns)
}

const useIsomorphicLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect

/** 几何值只走 CSS 自定义属性：`shadcn/no-inline-styles` 不许内联写 height / transform */
type CssVars = CSSProperties & Record<`--${string}`, string>

export function VirtualFeedGrid({ items }: { items: Product[] }) {
    "use no memo"
    const columns = useColumns()
    const listRef = useRef<HTMLDivElement>(null)
    const [scrollMargin, setScrollMargin] = useState(0)

    const rowCount = Math.ceil(items.length / columns)

    // eslint-disable-next-line react-hooks/incompatible-library -- 库返回的函数不可 memo，组件已 "use no memo" 整体退出编译器
    const virtualizer = useWindowVirtualizer({
        count: rowCount,
        estimateSize: () => ROW_ESTIMATE,
        overscan: OVERSCAN_ROWS,
        scrollMargin,
        initialRect: { width: 0, height: SSR_VIEWPORT },
    })

    /** 列表相对文档顶端的偏移：整页滚动（不是内层滚动容器）时虚拟项要靠它换算位置 */
    useIsomorphicLayoutEffect(() => {
        const el = listRef.current
        if (!el) return
        const measure = () => setScrollMargin(el.getBoundingClientRect().top + window.scrollY)
        measure()
        // 上方的 hero / banner 高度会随图片加载变化，偏移跟着重算
        const observer = new ResizeObserver(measure)
        observer.observe(document.body)
        return () => observer.disconnect()
    }, [])

    /**
     * 量到 0 就不记：jsdom 没有布局、图片没加载完时 offsetHeight 都是 0，
     * 把行高记成 0 会让后续每一行的 start 全塌掉，range 直接错位到中间几行。
     */
    const measureRow = useCallback(
        (node: HTMLDivElement | null) => {
            if (node === null || node.offsetHeight > 0) virtualizer.measureElement(node)
        },
        [virtualizer],
    )

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- CSS 自定义属性不在 CSSProperties 的键里，断言是唯一出口
    const totalStyle = { "--feed-total": `${virtualizer.getTotalSize()}px` } as CssVars

    return (
        <div
            ref={listRef}
            className="relative h-(--feed-total)"
            style={totalStyle}
        >
            {virtualizer.getVirtualItems().map((row) => {
                const start = row.index * columns
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 同上
                const rowStyle = { "--row-offset": `${row.start - scrollMargin}px` } as CssVars
                return (
                    <div
                        key={row.key}
                        data-index={row.index}
                        ref={measureRow}
                        // pb-3 承担行距：measureElement 量到的高度是「卡片 + 行距」，
                        // estimateSize 与实际行高才是同一个口径
                        className="absolute inset-x-0 top-0 translate-y-(--row-offset) pb-3"
                        style={rowStyle}
                    >
                        <div className="grid-feed">
                            {items.slice(start, start + columns).map((product) => {
                                const card = toProductCardData(product)
                                return (
                                    <ProductCard
                                        key={card.id}
                                        product={card}
                                    />
                                )
                            })}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

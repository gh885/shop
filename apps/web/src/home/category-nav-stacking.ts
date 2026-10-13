/**
 * 首页分类导航「竖展容器」的层叠自检。
 *
 * ## 它守的是什么
 *
 * 竖展容器是 hero 里的 `absolute` + `z-raised`，它**必须**压在下方 Feed 的推荐条
 * （`z-sticky`）之上，同时**必须**落在顶栏（`z-chrome`）之下——滚动时它要从顶栏底下过，
 * 否则会盖住顶栏的 logo。也就是「推荐条 30 < 面板 35 < 顶栏 40」这个三段严格顺序。
 * 其中"压过推荐条"这一半要求面板逃出 hero 的层叠上下文——
 * 于是它的正确性依赖一条 CSS 表达不了的隐式前提：**hero 的祖先链上没有任何层叠上下文**
 * （"落在顶栏之下"那一半不受祖先影响，顶栏的 40 高于面板所在的任何层）。
 *
 * 前提一旦被破坏（有人给 `section` 加 `isolate`、给卡片加 `transform`、给 `main` 加 `z-*`…），
 * 失效是**静默**的：面板照常展开，只是被推荐条盖住，没有报错、没有类型错、也没有门禁能拦
 * （`pnpm z-index:guard` 只拦裸数值 class，拦不住"加个 isolate"）。
 *
 * 所以这里在 dev 下扫一遍祖先，把静默失败变成一条当场可见的 console 警告。
 * 生产构建里整段被 `import.meta.env.DEV` 摇掉（与 `shared/lib/report-error.ts` 同一手法）。
 *
 * ## 判定口径
 *
 * 只认**明确命中**：`getPropertyValue` 读回空串时一律放过。jsdom 里这些属性大多读成空串，
 * 判严一点就会让每个渲染该组件的测试都假报。宁可漏报（dev 里还有肉眼）也不假报（噪声会被忽略）。
 */

/** 属性 → **不**创建层叠上下文的取值。除该值之外的任何非空取值都算命中。
 *  `isolation` 的反面是 `auto`（`isolate` 恰恰是创建层叠上下文的那个值，别写反）。 */
export const STACKING_CONTEXT_PROPS = [
    ["isolation", "auto"],
    ["transform", "none"],
    ["translate", "none"],
    ["rotate", "none"],
    ["scale", "none"],
    ["filter", "none"],
    ["backdrop-filter", "none"],
    ["will-change", "auto"],
    ["perspective", "none"],
    ["contain", "none"],
] as const

/** 只用到 `getPropertyValue`：收窄成自己的形状，测试就能拿普通对象当 style 传进来，
 *  不必把假对象硬断言成 `CSSStyleDeclaration`（`getComputedStyle` 的返回值天然满足本接口）。 */
export interface ReadableStyle {
    getPropertyValue(property: string): string
}

/** 命中则返回属性名（多个用 ` / ` 连接），没命中返回空串 */
export function stackingContextReason(style: ReadableStyle): string {
    const hits = STACKING_CONTEXT_PROPS.filter(([prop, noneValue]) => {
        const value = style.getPropertyValue(prop)
        return value !== "" && value !== noneValue
    }).map(([prop]) => prop)

    if (hits.length > 0) return hits.join(" / ")

    const opacity = style.getPropertyValue("opacity")
    return opacity !== "" && Number(opacity) < 1 ? "opacity < 1" : ""
}

/** `parentElement` 是 `HTMLElement | null`，这里统一收成 `undefined` ——
 *  少一种空值形态，遍历的终止条件就只剩一个（`node` 为假）。 */
const parentOf = (element: HTMLElement): HTMLElement | undefined =>
    element.parentElement ?? undefined

/** 从 `start` 往上扫到 `body`（不含起点、不含 body），返回所有创建了层叠上下文的祖先描述。
 *
 *  `readStyle` 是给测试留的缝：jsdom 的 `getComputedStyle` 对这批属性一律读回空串，
 *  不注入就没法真测遍历（会退化成一条永远通过的假绿）。 */
export function collectStackingContextAncestors(
    start: HTMLElement | null,
    readStyle: (element: HTMLElement) => ReadableStyle = (element) => getComputedStyle(element),
): string[] {
    const offenders: string[] = []
    for (let node = start ? parentOf(start) : undefined; node; node = parentOf(node)) {
        if (node === node.ownerDocument.body) break
        const reason = stackingContextReason(readStyle(node))
        if (reason) offenders.push(`${node.tagName.toLowerCase()}(${reason})`)
    }
    return offenders
}

/** dev 下扫一遍祖先并在命中时告警；生产构建里整个函数体被摇掉 */
export function warnIfAncestorCreatesStackingContext(start: HTMLElement | null) {
    if (!import.meta.env.DEV || !start || typeof getComputedStyle !== "function") return

    const offenders = collectStackingContextAncestors(start)
    if (offenders.length === 0) return

    console.warn(
        "[HomeCategoryNav] 竖展面板的祖先创建了层叠上下文，面板会被下方内容（推荐条 z-sticky）盖住：" +
            offenders.join(" ← ") +
            "。推理链见 home/category-nav-stacking.ts 顶部；修法是把这些属性从 hero 祖先链上撤掉。",
    )
}

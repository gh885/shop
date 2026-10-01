/**
 * regions —— 国标行政区划树（regions.json）之上的纯算法层。不碰 React / 网络 / UI。
 *
 * 数据是「省 → 市 → 区」三级树（直筒子市的第三级是 9 位街道码），随包懒加载一次。
 * 三个消费点共用这一份：web 收货地址、seller 商家地址、seller 运费模板地区规则。
 * 组件自持展示契约（@shop/ui-web 的 RegionPicker 只认 code/label/isLeaf），
 * 本模块只负责「树 → 级联选项 / 反查路径」，两端靠结构类型对齐，互不依赖。
 *
 * - RegionTreeNode ：原始树节点（code/name/children）
 * - RegionOption   ：级联选择器选项（code/label/isLeaf，label 是展示名）
 * - loadRegionTree ：整棵树（需要遍历全量时用，如运费模板地区规则）
 * - loadChildren   ：按层取孩子（级联选择器的数据源）
 * - findPath       ：6 位 regionCode → 省/市/区路径（编辑回填）
 */

/** 原始树节点（对应 data/regions.json） */
export interface RegionTreeNode {
    code: string
    name: string
    children?: RegionTreeNode[]
}

/** 级联选择器的一个选项：code 为层级内唯一标识，isLeaf 为 true 时选中即结束 */
export interface RegionOption {
    code: string
    label: string
    isLeaf?: boolean
}

let treePromise: Promise<RegionTreeNode[]> | undefined

/** 懒加载整棵树（首次取地区时才动态 import，之后复用同一 promise） */
export function loadRegionTree(): Promise<RegionTreeNode[]> {
    treePromise ??= import("./data/regions.json").then((m) => m.default as RegionTreeNode[])
    return treePromise
}

function isDirectCity(node: RegionTreeNode): boolean {
    // 直筒子市（东莞/中山/儋州/嘉峪关等）没有 6 位区级 children，children 是 9 位街道码
    const children = node.children
    return !!children?.length && children.every((c) => c.code.length !== 6)
}

/**
 * 整棵树给级联组件（reui Cascader）用：与 `loadChildren` 逐层视图**同一套**归一规则，
 * 一次把嵌套形状给全，避免逐层请求。
 *
 * 节点形状是 reui `CascaderNode` 的结构子集（value/label/children），所以本模块不 import
 * 任何 UI 包也能直接传进去——两边靠结构类型对齐，与 `RegionOption` 一样的做法。
 *
 * 码长约定（见 data/regions.json）：省 2 位、市 4 位、区 6 位，直筒子市的第三级是 9 位街道码。
 * 直筒子市在树里补一个合成的 6 位叶子（cityCode+"00"），保证 regionCode 恒为 6 位。
 */
export interface RegionCascaderNode {
    value: string
    label: string
    children?: RegionCascaderNode[]
}

function toCascaderNodes(nodes: readonly RegionTreeNode[]): RegionCascaderNode[] {
    return nodes.map((node) => {
        const children = node.children
        if (!children?.length) return { value: node.code, label: node.name }
        // 直筒子市（4 位市码、children 全是 9 位）：children 换成单个 6 位合成叶子
        if (node.code.length === 4 && isDirectCity(node)) {
            return {
                value: node.code,
                label: node.name,
                children: [{ value: `${node.code}00`, label: node.name }],
            }
        }
        return { value: node.code, label: node.name, children: toCascaderNodes(children) }
    })
}

/** 整棵区划树 → 级联组件的嵌套节点（一次给全，含直筒子市合成叶子） */
export async function loadRegionCascaderTree(): Promise<RegionCascaderNode[]> {
    return toCascaderNodes(await loadRegionTree())
}

/** RegionPicker 数据源：按层取孩子。根层返回省，区县层为叶子 */
export async function loadChildren(parent: RegionOption | undefined): Promise<RegionOption[]> {
    const tree = await loadRegionTree()
    if (!parent) {
        return tree.map((p) => ({ code: p.code, label: p.name, isLeaf: false }))
    }
    const node = tree.find((p) => p.code === parent.code) ?? findNode(tree, parent.code)
    if (!node?.children?.length) return []
    if (node.code.length === 4 && isDirectCity(node)) {
        // 直筒子市（市级节点，children 是街道码）：合成一个区级叶子（cityCode+"00"），保证 regionCode 恒为 6 位
        return [{ code: `${node.code}00`, label: node.name, isLeaf: true }]
    }
    // 是否叶子取决于自己有没有 children：市（4 位码）下面还有区，不是叶子
    return node.children.map((c) => ({
        code: c.code,
        label: c.name,
        isLeaf: !c.children?.length,
    }))
}

/** 由 6 位 regionCode 反查路径（编辑回填用）；直筒子市走合成分支 */
export async function findPath(code: string): Promise<RegionOption[]> {
    const tree = await loadRegionTree()
    const c = code || ""
    const province = tree.find((p) => c.startsWith(p.code))
    if (!province) return []

    const path: RegionOption[] = [{ code: province.code, label: province.name, isLeaf: false }]
    const city = province.children?.find((x) => x.code.length === 4 && c.startsWith(x.code))
    if (!city) return path

    path.push({ code: city.code, label: city.name, isLeaf: false })
    const district = city.children?.find((d) => d.code === c)
    if (district) {
        path.push({ code: district.code, label: district.name, isLeaf: true })
    } else if (c === `${city.code}00`) {
        // 直筒子市合成码
        path.push({ code: c, label: city.name, isLeaf: true })
    }
    return path
}

function findNode(nodes: RegionTreeNode[], code: string): RegionTreeNode | undefined {
    for (const n of nodes) {
        if (n.code === code) return n
        if (n.children) {
            const found = findNode(n.children, code)
            if (found) return found
        }
    }
    return undefined
}

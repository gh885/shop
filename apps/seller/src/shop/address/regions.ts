import type { RegionNode } from "#/shared/ui/RegionPicker"

/** 国标行政区划树节点（对应 shared/data/regions.json） */
interface RegionData {
    code: string
    name: string
    children?: RegionData[]
}

let treePromise: Promise<RegionData[]> | undefined

/** 懒加载整棵树（首次取地区时才动态 import，之后复用） */
function loadTree(): Promise<RegionData[]> {
    treePromise ??= import("#/shared/data/regions.json").then((m) => m.default as RegionData[])
    return treePromise
}

function isDirectCity(node: RegionData): boolean {
    // 直筒子市（东莞/中山/儋州/嘉峪关等）没有 6 位区级 children，children 是 9 位街道码
    const children = node.children
    return !!children?.length && children.every((c) => c.code.length !== 6)
}

/** RegionPicker 数据源：按层取孩子。根层返回省，区县层为叶子 */
export async function loadChildren(parent: RegionNode | undefined): Promise<RegionNode[]> {
    const tree = await loadTree()
    if (!parent) {
        return tree.map((p) => ({ code: p.code, label: p.name, isLeaf: false }))
    }
    const node =
        tree.find((p) => p.code === parent.code) ?? // 根层
        findNode(tree, parent.code)
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
export async function findPath(code: string): Promise<RegionNode[]> {
    const tree = await loadTree()
    const c = code || ""
    const province = tree.find((p) => c.startsWith(p.code))
    if (!province) return []

    const path: RegionNode[] = [{ code: province.code, label: province.name, isLeaf: false }]
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

function findNode(nodes: RegionData[], code: string): RegionData | undefined {
    for (const n of nodes) {
        if (n.code === code) return n
        if (n.children) {
            const found = findNode(n.children, code)
            if (found) return found
        }
    }
    return undefined
}

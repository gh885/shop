// regions —— 国标行政区划树（regions.json）之上的纯算法层，不碰 React/网络/UI。数据是「省→市→区」三级树，懒加载一次，三个消费点共用（web 收货地址、seller 商家地址/运费模板）。只负责「树→级联选项/反查路径」，UI 组件自持展示契约、两端靠结构类型对齐。出口：loadRegionTree / loadRegionCascaderTree / findPath。

export interface RegionTreeNode {
    code: string
    name: string
    children?: RegionTreeNode[]
}

export interface RegionOption {
    code: string
    label: string
    isLeaf?: boolean
}

let treePromise: Promise<RegionTreeNode[]> | undefined

export function loadRegionTree(): Promise<RegionTreeNode[]> {
    treePromise ??= import("./data/regions.json").then((m) => m.default as RegionTreeNode[])
    return treePromise
}

function isDirectCity(node: RegionTreeNode): boolean {
    // 直筒子市（东莞/中山/儋州/嘉峪关等）没有 6 位区级 children，children 是 9 位街道码
    const children = node.children
    return !!children?.length && children.every((c) => c.code.length !== 6)
}

// 码长约定：省 2、市 4、区 6 位，直筒子市第三级是 9 位街道码；级联树给直筒子市补一个合成 6 位叶子（cityCode+"00"），保证 regionCode 恒 6 位。
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

export async function loadRegionCascaderTree(): Promise<RegionCascaderNode[]> {
    return toCascaderNodes(await loadRegionTree())
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

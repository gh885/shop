import { createContext, use, useMemo, useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import {
    PackageIcon,
    StoreIcon,
    CalendarIcon,
    MegaphoneIcon,
    ChartColumnIcon,
    HeadsetIcon,
    HouseIcon,
    ChevronUp,
} from "lucide-react"
import { cn, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@shop/ui-web"

// ─────────────────────────────────────────────────────────────
// 卖家工作台侧边栏（千牛式双列），拆为三个可组合件：
//   SellerSidebarProvider —— 持有「当前选中一级项」状态，包在布局外层；
//   SidebarRail           —— 一级窄轨：蓝灰 canvas 底，图标左 + 名称右横排，
//                            激活/选中项 = 白色 pill 浮起（反相），无分割线；
//   SidebarPanel          —— 二级面板：放在白色浮面容器内，直接列分组，
//                            分组标题加粗、子项缩进弱化，激活 = 靛蓝弱底。
// 选中一级项默认 = 当前路由所在分组，点击其它一级项可切换二级内容。
// ─────────────────────────────────────────────────────────────

export interface SubLeaf {
    key: string
    label: string
    to?: string
}

export interface SubSection {
    title: string
    /** 可折叠分组：标题带 chevron，点击展开/收起，默认展开 */
    collapsible?: boolean
    items: SubLeaf[]
}

export interface SidebarItem {
    key: string
    label: string
    icon?: ReactNode
    /** 叶子一级项：可跳转路由 */
    to?: string
    /** 分组一级项：子菜单（可含分组标题 / 可折叠分组） */
    sections?: SubSection[]
    /** 在此项之后渲染一条淡分隔线（轨内分组用） */
    dividerAfter?: boolean
}

const isGroup = (item: SidebarItem) => Boolean(item.sections?.length)

// ── 演示数据（占位，后续替换真实菜单树） ──
const PLACEHOLDER_ITEMS: SidebarItem[] = [
    { key: "home", label: "首页", icon: <HouseIcon />, to: "/" },
    {
        key: "trade",
        label: "交易",
        icon: <CalendarIcon />,
        sections: [
            {
                title: "交易管理",
                items: [
                    { key: "orders", label: "订单列表" },
                    { key: "ship", label: "发货" },
                    { key: "logistics", label: "物流跟踪" },
                    { key: "refund", label: "退款售后" },
                ],
            },
            {
                title: "评价",
                collapsible: true,
                items: [
                    { key: "comment", label: "评价管理" },
                    { key: "buyershow", label: "买家秀" },
                ],
            },
        ],
    },
    {
        key: "product",
        label: "商品",
        icon: <PackageIcon />,
        sections: [
            {
                title: "商品管理",
                items: [
                    { key: "products", label: "商品列表", to: "/products" },
                    { key: "products-new", label: "发布商品", to: "/products/new" },
                    { key: "categories", label: "商品分类" },
                    { key: "stock", label: "库存管理" },
                ],
            },
            {
                title: "供应链",
                collapsible: true,
                items: [
                    { key: "supplier", label: "供应商管理" },
                    { key: "purchase", label: "采购单" },
                    { key: "price", label: "供货价管理" },
                ],
            },
        ],
    },
    {
        key: "shop",
        label: "店铺",
        icon: <StoreIcon />,
        sections: [
            {
                title: "店铺设置",
                items: [
                    { key: "shops", label: "店铺管理", to: "/shops" },
                    { key: "members", label: "店员管理", to: "/members" },
                    { key: "decoration", label: "店铺装修" },
                    { key: "notice", label: "店铺公告" },
                ],
            },
            {
                title: "资质认证",
                collapsible: true,
                items: [
                    { key: "license", label: "营业执照" },
                    { key: "brand", label: "品牌授权" },
                ],
            },
        ],
    },
    {
        key: "marketing",
        label: "营销",
        icon: <MegaphoneIcon />,
        sections: [
            {
                title: "营销工具",
                items: [
                    { key: "campaign", label: "营销活动" },
                    { key: "coupon", label: "优惠券" },
                    { key: "flash", label: "限时秒杀" },
                ],
            },
        ],
    },
    { key: "service", label: "客服", icon: <HeadsetIcon />, dividerAfter: true },
    {
        key: "data",
        label: "数据",
        icon: <ChartColumnIcon />,
        sections: [
            {
                title: "经营分析",
                items: [
                    { key: "overview", label: "数据概览" },
                    { key: "report", label: "经营报告" },
                    { key: "visit", label: "流量分析" },
                ],
            },
        ],
    },
]

// ── Provider：一级项选中态 ──

interface SidebarState {
    items: SidebarItem[]
    activeKey: string
    /** 二级面板当前展示的一级项（无分组可展时为 undefined） */
    shown: SidebarItem | undefined
    select: (key: string) => void
}

const SidebarContext = createContext<SidebarState | undefined>(undefined)

function useSidebarState() {
    const ctx = use(SidebarContext)
    if (!ctx) throw new Error("SidebarRail/SidebarPanel 必须放在 SellerSidebarProvider 内")
    return ctx
}

function SellerSidebarProvider({
    items = PLACEHOLDER_ITEMS,
    activeKey,
    children,
}: {
    items?: SidebarItem[]
    activeKey: string
    children: ReactNode
}) {
    const activeGroupKey =
        items
            .filter(isGroup)
            .find((g) => g.sections?.some((s) => s.items.some((l) => l.key === activeKey)))?.key ??
        undefined
    const [selectedKey, setSelectedKey] = useState<string | undefined>()
    const shownKey = selectedKey ?? activeGroupKey

    const value = useMemo<SidebarState>(() => {
        const shownItem = shownKey
            ? (items.find((i) => i.key === shownKey) ?? undefined)
            : undefined
        return {
            items,
            activeKey,
            shown: shownItem && isGroup(shownItem) ? shownItem : undefined,
            select: setSelectedKey,
        }
    }, [items, activeKey, shownKey])

    return <SidebarContext value={value}>{children}</SidebarContext>
}

// ── 一级窄轨：蓝灰 canvas 底，图标左 + 名称右，选中 = 白色 pill ──

function SidebarRail({ className }: { className?: string }) {
    const { items, activeKey, shown, select } = useSidebarState()

    // 当前路由所在一级分组 key（激活态标记）
    const activeGroupKey =
        items
            .filter(isGroup)
            .find((g) => g.sections?.some((s) => s.items.some((l) => l.key === activeKey)))?.key ??
        undefined

    return (
        <aside className={cn("flex w-24 shrink-0 flex-col", className)}>
            <nav
                aria-label="一级导航"
                className="flex-1 overflow-y-auto px-2 py-3"
            >
                <ul className="flex flex-col gap-1">
                    {items.map((item) => {
                        const isActiveGroup = item.key === activeGroupKey
                        const isShown = item.key === shown?.key
                        return (
                            <li key={item.key}>
                                <button
                                    type="button"
                                    title={item.label}
                                    onClick={() => select(item.key)}
                                    className={cn(
                                        "flex w-full items-center gap-2 rounded-full px-2.5 py-2 text-muted-foreground outline-hidden transition-all duration-150",
                                        "hover:bg-accent hover:text-foreground focus-visible:ring-2",
                                        isShown &&
                                            "bg-background font-medium text-primary shadow-sm hover:bg-background hover:text-primary",
                                    )}
                                    aria-current={isActiveGroup ? "page" : undefined}
                                >
                                    <span className="[&>svg]:size-4 [&>svg]:shrink-0">
                                        {item.icon}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-xs leading-none">
                                        {item.label}
                                    </span>
                                </button>
                                {item.dividerAfter && (
                                    <hr className="mx-3 my-2 border-foreground/8" />
                                )}
                            </li>
                        )
                    })}
                </ul>
            </nav>
        </aside>
    )
}

// ── 二级面板：置于白色浮面容器内，无 header，直接列分组 ──

function SidebarPanel({ className }: { className?: string }) {
    const { shown, activeKey } = useSidebarState()
    if (!shown) return

    return (
        <aside className={cn("flex w-44 shrink-0 flex-col text-foreground", className)}>
            <div className="flex-1 overflow-y-auto px-2.5 py-3">
                {shown.sections?.map((section) => (
                    <SectionBlock
                        key={section.title}
                        section={section}
                        activeKey={activeKey}
                    />
                ))}
            </div>
        </aside>
    )
}

/** 分组：无 items 仅标题；有 items 渲染标题(+chevron)与子项 */
function SectionBlock({ section, activeKey }: { section: SubSection; activeKey: string }) {
    if (section.items.length === 0) {
        return <div className="px-2 py-1.5 text-sm font-semibold">{section.title}</div>
    }

    if (!section.collapsible) {
        return (
            <div className="mt-2 first:mt-0">
                <div className="px-2 py-1.5 text-sm font-semibold">{section.title}</div>
                <div className="flex flex-col gap-0.5 pl-1.5">
                    {section.items.map((leaf) => (
                        <LeafRow
                            key={leaf.key}
                            leaf={leaf}
                            active={leaf.key === activeKey}
                        />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <Collapsible
            defaultOpen
            className="mt-2 first:mt-0"
        >
            <CollapsibleTrigger
                render={
                    <button
                        type="button"
                        className="group flex w-full cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm font-semibold"
                    >
                        <span className="flex-1">{section.title}</span>
                        <ChevronUp className="size-3.5 text-muted-foreground transition-transform duration-200 group-data-open:rotate-180" />
                    </button>
                }
            />
            <CollapsibleContent>
                <div className="flex flex-col gap-0.5 pl-1.5">
                    {section.items.map((leaf) => (
                        <LeafRow
                            key={leaf.key}
                            leaf={leaf}
                            active={leaf.key === activeKey}
                        />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

/** 二级子项行：激活（当前路由命中）为靛蓝弱底，其余弱化为次要文字 */
function LeafRow({ leaf, active }: { leaf: SubLeaf; active: boolean }) {
    const cls = cn(
        "flex h-8 items-center rounded-md px-2.5 text-[13px] text-foreground/75 outline-hidden transition-all duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2",
        active &&
            "bg-primary-subtle font-medium text-primary-subtle-foreground hover:bg-primary-subtle hover:text-primary-subtle-foreground",
    )
    if (leaf.to) {
        return (
            <Link
                to={leaf.to}
                className={cls}
                aria-current={active ? "page" : undefined}
            >
                <span className="min-w-0 flex-1 truncate">{leaf.label}</span>
            </Link>
        )
    }
    return (
        <div
            className={cls}
            aria-current={active ? "page" : undefined}
        >
            <span className="min-w-0 flex-1 truncate">{leaf.label}</span>
        </div>
    )
}

export { SellerSidebarProvider, SidebarRail, SidebarPanel, PLACEHOLDER_ITEMS }

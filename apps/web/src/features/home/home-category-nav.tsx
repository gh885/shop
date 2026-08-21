import { useState } from "react"
import {
    Armchair,
    Baby,
    ChefHat,
    Dumbbell,
    Gamepad2,
    HandPlatter,
    Headphones,
    Laptop,
    Refrigerator,
    Shirt,
    ShoppingBag,
    Sparkles,
    Watch,
    type LucideIcon,
} from "lucide-react"

import { Button } from "@shop/ui-web"

/** 首页导航入口：主菜单分区词条（合并名），子层为 hover 展开的导航组。
 *  注意：这不是类目树，是运营配置的「首页分类导航」聚合入口，
 *  与类目树仅通过最终跳转 ID 软关联，未来由后端同构返回。 */
export interface NavEntry {
    id: string
    title: string
    icon: LucideIcon
    subs?: NavGroup[]
}

export interface NavGroup {
    /** 分组名，如「粮油调味」 */
    name: string
    /** 词条，如食用油、大米、面… */
    items: string[]
}

/** 写死的 mock 数据：结构按后台「首页导航配置」schema 设计，接后端仅替换数据源 */
const NAV_ENTRIES: NavEntry[] = [
    {
        id: "appliance",
        title: "冰洗/空调/电视/厨卫大电",
        icon: Refrigerator,
        subs: [
            { name: "洗衣机", items: ["滚筒洗衣机", "波轮洗衣机", "洗烘一体", "迷你洗衣机"] },
            { name: "冰洗冷柜", items: ["冰箱", "冷柜", "冰吧", "酒柜"] },
            { name: "空调", items: ["挂机空调", "柜机空调", "中央空调", "移动空调"] },
            { name: "电视", items: ["液晶电视", "OLED电视", "投影", "电视配件"] },
            { name: "厨卫", items: ["热水器", "油烟机", "燃气灶", "洗碗机", "集成灶"] },
        ],
    },
    {
        id: "digital",
        title: "电脑/办公/文具用品",
        icon: Laptop,
        subs: [
            { name: "电脑", items: ["笔记本", "游戏本", "台式机", "平板", "显示器"] },
            { name: "办公设备", items: ["打印机", "投影仪", "考勤机", "碎纸机"] },
            { name: "文具", items: ["钢笔", "中性笔", "笔记本", "文件夹", "计算器"] },
        ],
    },
    {
        id: "phone",
        title: "手机/运营商/数码",
        icon: Headphones,
        subs: [
            { name: "手机", items: ["智能手机", "折叠屏", "老人机", "游戏手机"] },
            { name: "运营商", items: ["5G套餐", "充值中心", "流量卡", "宽带"] },
            { name: "数码", items: ["耳机", "音箱", "智能手表", "充电宝", "数据线"] },
        ],
    },
    {
        id: "appliance-kitchen",
        title: "生活电器/厨房小电/个护健康",
        icon: ChefHat,
        subs: [
            { name: "生活电器", items: ["吸尘器", "加湿器", "净化器", "电风扇"] },
            { name: "厨房小电", items: ["电饭煲", "破壁机", "空气炸锅", "电水壶"] },
            { name: "个护健康", items: ["剃须刀", "美容仪", "按摩器", "电动牙刷"] },
        ],
    },
    {
        id: "food",
        title: "食品/酒类/生鲜/特产",
        icon: ShoppingBag,
        subs: [
            { name: "粮油调味", items: ["食用油", "大米", "面", "杂粮", "调味品", "南北干货"] },
            { name: "新鲜水果", items: ["苹果", "橙子", "奇异果", "榴莲", "火龙果", "荔枝"] },
            { name: "精选肉类", items: ["猪肉", "牛肉", "羊肉", "鸡肉", "鸭肉", "冷鲜肉"] },
            { name: "饮料冲调", items: ["饮用水", "牛奶酸奶", "咖啡", "奶茶", "冲饮谷物"] },
            { name: "中外名酒", items: ["白酒", "葡萄酒", "洋酒", "啤酒", "黄酒"] },
            { name: "休闲食品", items: ["肉干肉脯", "营养零食", "休闲零食", "坚果炒货"] },
        ],
    },
    {
        id: "beauty",
        title: "美妆/个护清洁/宠物",
        icon: Sparkles,
        subs: [
            { name: "美妆", items: ["面部护肤", "彩妆", "香水", "防晒", "面膜"] },
            { name: "个护清洁", items: ["洗发护发", "沐浴", "口腔护理", "纸品湿巾"] },
            { name: "宠物", items: ["狗粮", "猫粮", "宠物零食", "宠物用品", "宠物医疗"] },
        ],
    },
    {
        id: "outdoor",
        title: "运动/户外/骑行",
        icon: Dumbbell,
        subs: [
            { name: "运动", items: ["跑步鞋", "篮球鞋", "运动服", "健身器材"] },
            { name: "户外", items: ["帐篷", "睡袋", "登山杖", "户外服饰"] },
            { name: "骑行", items: ["自行车", "电助力车", "骑行装备", "骑行服"] },
        ],
    },
    {
        id: "watch",
        title: "男鞋/女鞋/箱包/钟表",
        icon: Watch,
        subs: [
            { name: "鞋靴", items: ["男鞋", "女鞋", "运动鞋", "帆布鞋", "皮鞋"] },
            { name: "箱包", items: ["双肩包", "单肩包", "行李箱", "钱包"] },
            { name: "钟表", items: ["男表", "女表", "智能手表", "儿童表"] },
        ],
    },
    {
        id: "bag-toy",
        title: "男装/女装/童装/内衣",
        icon: Shirt,
        subs: [
            { name: "男装", items: ["T恤", "衬衫", "牛仔裤", "夹克", "西装"] },
            { name: "女装", items: ["连衣裙", "半身裙", "针织衫", "卫衣", "外套"] },
            { name: "童装", items: ["童装", "亲子装", "校服", "儿童袜子"] },
        ],
    },
    {
        id: "furniture",
        title: "家装/建材/家具",
        icon: Armchair,
        subs: [
            { name: "家装", items: ["油漆涂料", "瓷砖", "地板", "墙纸"] },
            { name: "建材", items: ["五金", "电工", "锁具", "卫浴"] },
            { name: "家具", items: ["沙发", "床", "餐桌", "衣柜", "办公家具"] },
        ],
    },
    {
        id: "toy",
        title: "母婴/玩具乐器",
        icon: Baby,
        subs: [
            { name: "母婴", items: ["奶粉", "纸尿裤", "童车", "辅食"] },
            { name: "玩具", items: ["积木", "毛绒玩具", "模型", "遥控玩具"] },
            { name: "乐器", items: ["吉他", "钢琴", "电子琴", "架子鼓"] },
        ],
    },
    {
        id: "gift",
        title: "艺术/礼品鲜花/农林园艺",
        icon: HandPlatter,
        subs: [
            { name: "礼品", items: ["礼品卡", "创意礼品", "节日礼盒"] },
            { name: "鲜花", items: ["鲜花速递", "绿植盆栽", "花艺"] },
            { name: "园艺", items: ["园艺工具", "种子", "肥料", "花盆"] },
        ],
    },
    {
        id: "game",
        title: "游戏/娱乐/数码潮玩",
        icon: Gamepad2,
        subs: [
            { name: "游戏", items: ["主机游戏", "网游", "点卡", "外设"] },
            { name: "娱乐", items: ["桌游", "卡牌", "手办", "模型"] },
        ],
    },
]

/** 第二层左侧卡片：京东式首页分类导航（图标 + 合并名列表，hover 弹出子词条 Mega Menu）
 *  @param defaultHeight 正常态限高(px)，超过则 overflow-hidden 只显示前几行；hover 时列表展开为完整高度 */
export function HomeCategoryNav({ defaultHeight = 320 }: { defaultHeight?: number }) {
    const [activeId, setActiveId] = useState<string | null>(null)

    const active = NAV_ENTRIES.find((e) => e.id === activeId) ?? null
    const isHovering = activeId !== null

    return (
        <div
            className="relative"
            style={{ height: defaultHeight }}
            onMouseLeave={() => setActiveId(null)}
        >
            {/* 单列表：正常态 in-flow 限高裁剪（外层 height 锚定 grid 行高）；hover 态 absolute 向下覆盖，不推流 */}
            <div
                className={`rounded-xl border border-border/60 bg-background ${
                    isHovering
                        ? "absolute top-0 left-0 z-40 w-full shadow-lg"
                        : "h-full overflow-hidden"
                }`}
            >
                <ul>
                    {NAV_ENTRIES.map((entry) => (
                        <li key={entry.id}>
                            <Button
                                variant="ghost"
                                onMouseEnter={() => setActiveId(entry.id)}
                                className={`w-full justify-start gap-3 rounded-none px-4 py-2 text-sm ${
                                    activeId === entry.id
                                        ? "bg-sunken text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <entry.icon className="size-4 shrink-0" />
                                <span className="truncate">{entry.title}</span>
                            </Button>
                        </li>
                    ))}
                </ul>
            </div>

            {/* hover 展开的 Mega Menu 面板：绝对定位盖在右侧内容上方，高度由内容撑开 */}
            {active?.subs && (
                <div className="absolute top-0 left-full z-50 hidden w-[680px] rounded-xl border border-border/60 bg-background shadow-xl md:block">
                    {/* 词条组：横向流式平铺，一行的组名后跟整排词条 */}
                    <div className="p-5">
                        <div className="flex flex-col gap-4">
                            {active.subs.map((group) => (
                                <div
                                    key={group.name}
                                    className="flex items-baseline gap-3"
                                >
                                    <button
                                        type="button"
                                        className="group flex shrink-0 items-center gap-1 text-sm font-semibold whitespace-nowrap"
                                    >
                                        {group.name}
                                        <span className="text-xs text-muted-foreground transition-colors group-hover:text-primary">
                                            &gt;
                                        </span>
                                    </button>
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                                        {group.items.map((item) => (
                                            <span
                                                key={item}
                                                className="cursor-pointer whitespace-nowrap transition-colors hover:text-primary"
                                            >
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

import { useState, type ReactNode } from "react"
import { ChevronDown, Search } from "lucide-react"

import { cn } from "src/lib/utils"
import { Button } from "src/components/ui/button"
import { ButtonGroup } from "src/components/ui/button-group"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu"
import { Input } from "src/components/ui/input"

/**
 * 搜索框（首页大搜索框 / 内页顶栏紧凑搜索框共用）：
 * 2px 橙描边 + 面包板分隔线 + 无边框内嵌输入 + 实色橙搜索按钮。
 *
 * 以前两个页面各拼一遍 ButtonGroup + Input + Button（各带 4~6 处 className 覆盖），
 * 同一个东西有两份定义、两个尺寸记两套数——这里收成一处，尺寸走 size 档。
 *
 * 本体在 ui-web 的组件目录内：组合设计系统组件并给它们定样式，正是这个目录存在的意义
 * （no-restyle 的官方建议也是「组件目录内关掉该规则，让组件自己管造型」）。
 */
const SIZES = {
    lg: {
        group: "h-12 rounded-lg focus-within:shadow-float",
        trigger: "gap-1 pl-5 pr-3 text-base",
        input: "text-base",
        button: "mr-0.5 h-11 px-4 text-base sm:px-8",
    },
    sm: {
        group: "h-9 overflow-hidden rounded-md",
        trigger: "gap-1 pl-4 pr-3 text-sm",
        input: "text-sm",
        button: "h-full px-5",
    },
} as const

export interface SearchBarProps {
    /** 尺寸档：lg = 首页大搜索框（h-12），sm = 内页顶栏（h-9） */
    size?: "lg" | "sm"
    /** 左侧分类下拉的选项；不传则不渲染分类区（含分隔线） */
    categories?: readonly string[]
    /** 分类初始值，默认取 categories[0] */
    defaultCategory?: string
    /** 输入框初始值 */
    defaultValue?: string
    /** 回车或点「搜索」时触发；不传则只受控输入（搜索后端未建时由调用方决定反馈） */
    onSearch?: (keyword: string, category: string | undefined) => void
    placeholder?: string
    /** 搜索按钮右侧的附加内容（各页自己的入口，如「搜本店」） */
    trailing?: ReactNode
    /** 外部只该用它定宽/定位，别再改外观 */
    className?: string
}

export function SearchBar({
    size = "sm",
    categories,
    defaultCategory,
    defaultValue = "",
    onSearch,
    placeholder = "搜索",
    trailing,
    className,
}: SearchBarProps) {
    const [keyword, setKeyword] = useState(defaultValue)
    const [category, setCategory] = useState(defaultCategory ?? categories?.[0])
    const s = SIZES[size]

    const submit = () => onSearch?.(keyword, category)
    const showCategories = categories !== undefined && categories.length > 0

    return (
        <ButtonGroup
            className={cn("w-full border-2 border-primary bg-background", s.group, className)}
        >
            {showCategories && (
                <>
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            className={cn(
                                "flex shrink-0 items-center font-medium text-primary transition-colors hover:text-primary-hover",
                                s.trigger,
                            )}
                        >
                            {category}
                            <ChevronDown className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            {categories.map((c) => (
                                <DropdownMenuItem
                                    key={c}
                                    onClick={() => setCategory(c)}
                                >
                                    {c}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <span className="h-5 w-px shrink-0 bg-border" />
                </>
            )}

            <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                    // IME 组合期间（中文输入法选词上屏）e.key 也是 "Enter"，直接提交会把
                    // 正在组词的拼音当成搜索词；isComposing 为真时跳过，待组合结束再放行
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) submit()
                }}
                placeholder={placeholder}
                aria-label="搜索商品"
                className={cn(
                    // 无框皮肤只改外形：border-0 之后 Input 自带的 focus-visible:border-ring 无处下笔，
                    // 但它的 ring 必须留着——tailwind-merge 会真删掉，写成 ring-0 就是键盘用户看不见焦点
                    "h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 shadow-none",
                    s.input,
                )}
            />

            <Button
                onClick={submit}
                className={cn("shrink-0", s.button)}
            >
                <Search />
                搜索
            </Button>

            {trailing}
        </ButtonGroup>
    )
}

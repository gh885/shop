import { useState, type ReactNode } from "react"
import { ChevronDown, Search } from "lucide-react"

import { cn } from "src/lib/utils"
import { useUiLabels } from "./ui-labels"
import { Button } from "src/components/ui/button"
import { ButtonGroup } from "src/components/ui/button-group"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu"
import { Input } from "src/components/ui/input"

/** 搜索框：首页大框/顶栏紧凑框共用（尺寸走 size 档），组合 ButtonGroup+Input+Button 收成一处 */
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
    defaultValue?: string
    /** 回车或点「搜索」时触发；不传则只受控输入 */
    onSearch?: (keyword: string, category: string | undefined) => void
    /** 占位文案；不传则取当前语言的通用文案（`UiLabels.searchBar`） */
    placeholder?: string
    /** 搜索按钮文案；不传则取当前语言的通用文案（都没有时按钮只剩图标） */
    buttonLabel?: string
    /** 输入框的可访问名；不传则取当前语言的通用文案 */
    inputAriaLabel?: string
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
    placeholder,
    buttonLabel,
    inputAriaLabel,
    trailing,
    className,
}: SearchBarProps) {
    // 通用文案在渲染期从 context 取：SSR 首屏就是对的，切语言随 provider 的 value 当场变
    const labels = useUiLabels().searchBar
    const [keyword, setKeyword] = useState(defaultValue)
    const [category, setCategory] = useState(defaultCategory ?? categories?.[0])
    const s = SIZES[size]

    const resolvedPlaceholder = placeholder ?? labels.placeholder
    const resolvedButtonLabel = buttonLabel ?? labels.button
    const resolvedAriaLabel = inputAriaLabel ?? labels.ariaLabel
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
                    // IME 组合期（中文选词）e.key 也是 Enter，isComposing 为真时跳过，别把组词拼音当搜索词提交
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) submit()
                }}
                placeholder={resolvedPlaceholder}
                aria-label={resolvedAriaLabel}
                className={cn(
                    // border-0 后 Input 自带 focus-visible:border-ring 无处下笔，但 ring 必须留着——tailwind-merge 会真删，ring-0 让键盘用户看不见焦点
                    "h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 shadow-none",
                    s.input,
                )}
            />

            <Button
                onClick={submit}
                className={cn("shrink-0", s.button)}
            >
                <Search />
                {resolvedButtonLabel}
            </Button>

            {trailing}
        </ButtonGroup>
    )
}

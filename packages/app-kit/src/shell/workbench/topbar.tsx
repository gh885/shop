import { useState, type ReactNode } from "react"
import { ChevronDownIcon, StoreIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"
import {
    Avatar,
    AvatarFallback,
    Button,
    Item,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemSeparator,
    ItemTitle,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Separator,
    TopBar as TopBarRoot,
    TopBarActions,
    TopBarBrand,
    TopBarSearch,
} from "@shop/ui-web"

import { useT } from "../../i18n"
import { sidebarLinkSearch, type SidebarTarget } from "./navigation"

/** 顶栏：透明浮于 canvas 画布，无分割线。minimal（内容区需大空间的页面）下
    隐去搜索，只留「品牌 + 当前页名 + 动作群 + 账号」。
    sticky=false 用于发布流程页：窗口级滚动，顶栏随内容滚走，让位给贴顶页签 */
export function WorkbenchTopBar({
    title,
    brand,
    home,
    account,
    actions,
    minimal = false,
    sticky = true,
}: {
    title: string
    brand: string
    home: SidebarTarget
    account: ReactNode
    actions?: ReactNode
    minimal?: boolean
    sticky?: boolean
}) {
    return (
        <TopBarRoot
            variant={minimal ? "default" : "floating"}
            sticky={sticky}
            className="gap-3"
        >
            <Link
                to={home.to}
                search={sidebarLinkSearch(home.search)}
            >
                <TopBarBrand className="mr-0 gap-2.5">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <StoreIcon className="size-4.5" />
                    </span>
                    <span className="text-sm font-semibold">{brand}</span>
                </TopBarBrand>
            </Link>
            {!minimal && <SearchBox brand={brand} />}
            {minimal && (
                <Separator
                    orientation="vertical"
                    className="mr-1 h-4"
                />
            )}
            <span className="hidden max-w-60 truncate text-sm font-medium lg:block">{title}</span>
            <TopBarActions className="gap-1">
                {actions && (
                    <>
                        {actions}
                        <Separator
                            orientation="vertical"
                            className="mx-1.5 h-6"
                        />
                    </>
                )}
                {account}
            </TopBarActions>
        </TopBarRoot>
    )
}

/** 顶栏搜索框：受控输入态（组件内部 state），仅作 UI，暂未接搜索逻辑 */
function SearchBox({ brand }: { brand: string }) {
    const t = useT()
    const [query, setQuery] = useState("")

    return (
        <TopBarSearch
            placeholder={t("appKit.topbar.searchPlaceholder")}
            aria-label={t("appKit.topbar.searchLabel", { brand })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="hidden w-60 md:block"
        />
    )
}

/** 顶栏动作项（动作按钮）：图标在上、小字在下（千牛式）。
    用 Button(ghost) 获得标准 hover/active/focus 交互状态，`aria-expanded` 等语义交给库管理。
    这里曾有枚 6px 红点表示"有未读消息"：写死的 `dot`，没有任何未读数据源，
    等于永久宣称有未读；且状态只由颜色承载、用的还是 destructive（危险色）。
    未读数接口到位后再回来，形态应是「图标 + text-3xs 计数」并配 sr-only 文案，不是一颗点。 */
export function WorkbenchTopBarAction({ icon, label }: { icon: ReactNode; label: string }) {
    return (
        <Button
            variant="ghost"
            title={label}
            className="flex w-11 flex-col items-center"
        >
            <span className="relative text-foreground/80 [&>svg]:size-4.5">{icon}</span>
            <span className="text-3xs leading-none text-muted-foreground">{label}</span>
        </Button>
    )
}

/** 右上角账号入口（Popover 面板）：触发按钮 = 头像 + 用户名 + chevron；
    弹出面板用 Item 呈现「账号信息卡 + 退出登录」。 */
export function WorkbenchAccount({
    name,
    description,
    logoutAction,
}: {
    name: string
    description: string
    logoutAction: ReactNode
}) {
    return (
        <Popover>
            <PopoverTrigger
                render={
                    <Button
                        variant="ghost"
                        title={name}
                        className="flex items-center"
                    >
                        <Avatar size="default">
                            <AvatarFallback>{name.trim().charAt(0) || "?"}</AvatarFallback>
                        </Avatar>
                        <div className="grid text-left leading-tight">
                            <span className="max-w-36 truncate text-sm font-medium">{name}</span>
                            <span className="max-w-36 truncate text-xs text-muted-foreground">
                                {description}
                            </span>
                        </div>
                        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                    </Button>
                }
            />
            <PopoverContent
                align="end"
                className="w-56"
            >
                <ItemGroup>
                    <Item>
                        <ItemMedia variant="icon">
                            <Avatar>
                                <AvatarFallback>{name.trim().charAt(0) || "?"}</AvatarFallback>
                            </Avatar>
                        </ItemMedia>
                        <ItemContent>
                            <ItemTitle>{name}</ItemTitle>
                            <ItemDescription>{description}</ItemDescription>
                        </ItemContent>
                    </Item>
                    <ItemSeparator />
                    {logoutAction}
                </ItemGroup>
            </PopoverContent>
        </Popover>
    )
}

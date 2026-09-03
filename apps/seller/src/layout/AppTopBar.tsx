import { useState, type ReactNode } from "react"
import {
    BellIcon,
    BookOpenIcon,
    ChevronDownIcon,
    CircleHelpIcon,
    HeadsetIcon,
    LogOutIcon,
    SearchIcon,
    StoreIcon,
} from "lucide-react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import {
    Avatar,
    AvatarFallback,
    Button,
    cn,
    Input,
    Item,
    ItemActions,
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
} from "@shop/ui-web"

import { logout } from "#/shared/lib/api"
import { useClearMe, useMe } from "#/shared/lib/me"

/** 顶栏：透明浮于 canvas 画布，无分割线。minimal（内容区需大空间的页面）下
    隐去搜索，只留「品牌 + 当前页名 + 动作群 + 账号」。
    sticky=false 用于发布流程页：窗口级滚动，顶栏随内容滚走，让位给贴顶页签 */
export function AppTopBar({
    title,
    minimal = false,
    sticky = true,
}: {
    title: string
    minimal?: boolean
    sticky?: boolean
}) {
    return (
        <TopBarRoot
            className={cn(
                "gap-3 px-4",
                minimal ? "border-border" : "border-b-0 bg-transparent",
                !sticky && "static",
            )}
        >
            {" "}
            <Link to="/">
                <TopBarBrand className="mr-0 gap-2.5">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <StoreIcon className="size-4.5" />
                    </span>
                    <span className="text-sm font-semibold tracking-tight">卖家中心</span>
                </TopBarBrand>
            </Link>
            {!minimal && <SearchBox />}
            {minimal && (
                <Separator
                    orientation="vertical"
                    className="mr-1 h-4"
                />
            )}
            <span className="hidden max-w-60 truncate text-sm font-medium lg:block">{title}</span>
            <TopBarActions className="gap-1">
                <TopBarAction
                    icon={<BellIcon />}
                    label="消息"
                    dot
                />
                <TopBarAction
                    icon={<BookOpenIcon />}
                    label="规则"
                />
                <TopBarAction
                    icon={<CircleHelpIcon />}
                    label="帮助"
                />
                <TopBarAction
                    icon={<HeadsetIcon />}
                    label="客服"
                />
                <Separator
                    orientation="vertical"
                    className="mx-1.5 h-6"
                />
                <AccountChip />
            </TopBarActions>
        </TopBarRoot>
    )
}

/** 顶栏搜索框：受控输入态（组件内部 state），仅作 UI，暂未接搜索逻辑 */
function SearchBox() {
    const [query, setQuery] = useState("")

    return (
        <div className="relative hidden w-60 md:block">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
                type="search"
                placeholder="搜索菜单、功能"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 rounded-full border-transparent bg-background pl-9 shadow-none focus-visible:border-transparent focus-visible:ring-2"
            />
        </div>
    )
}

/** 顶栏动作项（动作按钮）：图标在上、小字在下（千牛式），消息带红点。
    用 Button(ghost) 获得标准 hover/active/focus 交互状态，`aria-expanded` 等语义交给库管理。 */
function TopBarAction({
    icon,
    label,
    dot = false,
}: {
    icon: ReactNode
    label: string
    dot?: boolean
}) {
    return (
        <Button
            variant="ghost"
            title={label}
            className="flex w-11 flex-col items-center gap-1 rounded-lg py-1.5"
        >
            <span className="relative text-foreground/80 [&>svg]:size-4.5">
                {icon}
                {dot && (
                    <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-destructive" />
                )}
            </span>
            <span className="text-[10px] leading-none text-muted-foreground">{label}</span>
        </Button>
    )
}

/** 右上角账号入口（Popover 面板）：触发按钮 = 头像 + 用户名 + chevron；
    弹出面板用 Item 呈现「账号信息卡 + 退出登录」。 */
function AccountChip() {
    const navigate = useNavigate()
    const { data: me } = useMe()
    const clearMe = useClearMe()
    const name = me?.nickname ?? me?.phone ?? "未登录"

    const logoutMutation = useMutation({
        mutationFn: () => logout(),
        onSettled: () => {
            clearMe()
            void navigate({ to: "/login" })
        },
    })

    return (
        <Popover>
            <PopoverTrigger
                render={
                    <Button
                        variant="ghost"
                        title={name}
                        className="flex items-center gap-2.5 rounded-lg px-1.5 py-1"
                    >
                        <Avatar size="default">
                            <AvatarFallback>{name.trim().charAt(0) || "?"}</AvatarFallback>
                        </Avatar>
                        <div className="grid text-left leading-tight">
                            <span className="max-w-36 truncate text-sm font-medium">{name}</span>
                            <span className="max-w-36 truncate text-xs text-muted-foreground">
                                卖家账号
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
                            <ItemDescription>卖家账号</ItemDescription>
                        </ItemContent>
                    </Item>
                    <ItemSeparator />
                    <Item
                        variant="muted"
                        aria-disabled={logoutMutation.isPending}
                        onClick={() => logoutMutation.mutate()}
                        className="cursor-pointer"
                    >
                        <ItemContent>
                            <ItemTitle>退出登录</ItemTitle>
                        </ItemContent>
                        <ItemActions>
                            <LogOutIcon className="size-4 text-muted-foreground" />
                        </ItemActions>
                    </Item>
                </ItemGroup>
            </PopoverContent>
        </Popover>
    )
}

import { createFileRoute } from "@tanstack/react-router"
import { CircleAlert, OctagonX } from "lucide-react"

import { Badge, Button, Input, cn } from "@shop/ui-web"

export const Route = createFileRoute("/dev/destructive")({
    component: DestructiveDemo,
    head: () => ({
        meta: [{ title: "destructive 方案对比" }],
    }),
})

/**
 * destructive 三方案对比（dev-only，不定稿不进生产）。
 * 项目 token 用 light-dark() 跟随 color-scheme，因此用内联 colorScheme
 * 强制局部亮/暗，同屏对比两种模式。
 *
 * A 现行新版 shadcn：bg-destructive/10 + text-destructive（dark 下对比度塌陷）
 * B 三件套弱底：bg-destructive-subtle + text-destructive-subtle-foreground
 * C 实色：bg-destructive + text-destructive-foreground
 */

const schemes = [
    { key: "light", label: "亮色模式", colorScheme: "light" },
    { key: "dark", label: "暗色模式", colorScheme: "dark" },
] as const

const options = [
    {
        key: "A",
        name: "A · 现行 shadcn 弱底",
        desc: "bg-destructive/10 + text-destructive",
        button: "bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        badge: "bg-destructive/10 text-destructive dark:bg-destructive/20",
        input: "border-destructive",
        inline: "text-destructive",
    },
    {
        key: "B",
        name: "B · 三件套弱底",
        desc: "bg-destructive-subtle + text-destructive-subtle-foreground",
        button: "bg-destructive-subtle text-destructive-subtle-foreground hover:opacity-80",
        badge: "bg-destructive-subtle text-destructive-subtle-foreground",
        input: "border-destructive-subtle-foreground",
        inline: "text-destructive-subtle-foreground",
    },
    {
        key: "C",
        name: "C · 实色填充",
        desc: "bg-destructive + text-destructive-foreground",
        button: "bg-destructive text-destructive-foreground hover:opacity-90",
        badge: "bg-destructive text-destructive-foreground",
        input: "border-destructive",
        inline: "text-destructive",
    },
] as const

function DestructiveDemo() {
    return (
        <div className="min-h-screen bg-background px-8 py-10 text-foreground">
            <h1 className="text-2xl font-bold">destructive 三方案对比</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                每个方案按「按钮 / 徽标 / 错误输入框 / 行内错误文字」四种用法展示，
                左右同屏对比亮暗模式。 重点看暗色模式：方案 A 的文字和描边是否还能看清。
            </p>

            <div className="mt-10 space-y-12">
                {options.map((opt) => (
                    <section key={opt.key}>
                        <h2 className="text-lg font-semibold">{opt.name}</h2>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{opt.desc}</p>

                        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {schemes.map((s) => (
                                <div
                                    key={s.key}
                                    style={{ colorScheme: s.colorScheme }}
                                    className="rounded-xl border border-border bg-background p-6"
                                >
                                    <p className="mb-5 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                                        {s.label}
                                    </p>

                                    <div className="flex flex-wrap items-center gap-4">
                                        {/* 按钮 */}
                                        <Button className={cn(opt.button)}>删除商品</Button>

                                        {/* 徽标 */}
                                        <Badge className={cn(opt.badge)}>已驳回</Badge>

                                        {/* 行内错误文字 */}
                                        <span
                                            className={cn(
                                                "flex items-center gap-1 text-[13px]",
                                                opt.inline,
                                            )}
                                        >
                                            <OctagonX className="size-3.5" />
                                            手机号格式不正确
                                        </span>
                                    </div>

                                    {/* 错误输入框 */}
                                    <div className="mt-5 max-w-xs">
                                        <Input
                                            defaultValue="1380000"
                                            className={cn(opt.input)}
                                        />
                                        <p
                                            className={cn(
                                                "mt-1.5 flex items-center gap-1 text-[13px]",
                                                opt.inline,
                                            )}
                                        >
                                            <CircleAlert className="size-3.5" />
                                            请输入 11 位手机号
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    )
}

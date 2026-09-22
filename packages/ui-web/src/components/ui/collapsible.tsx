import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { cn } from "src/lib/utils"

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
    return (
        <CollapsiblePrimitive.Root
            data-slot="collapsible"
            {...props}
        />
    )
}

/** 触发器只有一种形态：文字链式折叠入口（muted 文字、hover 提亮、文字与箭头间距）。
    业务侧 className 只该管布局（占宽、对齐、外边距）——no-restyle 禁的是各处盖皮肤，
    这套造型归组件自己。配合调用方的 `group` + `group-data-[open]:` 可做文案互换、箭头旋转。 */
function CollapsibleTrigger({ className, ...props }: CollapsiblePrimitive.Trigger.Props) {
    return (
        <CollapsiblePrimitive.Trigger
            data-slot="collapsible-trigger"
            className={cn(
                "inline-flex items-center gap-1 text-sm leading-6 text-muted-foreground transition-colors hover:text-foreground",
                className,
            )}
            {...props}
        />
    )
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
    return (
        <CollapsiblePrimitive.Panel
            data-slot="collapsible-content"
            {...props}
        />
    )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }

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

/** 造型归组件、业务 className 只管布局（no-restyle）；配合调用方 group + group-data-[open]: 可换文案、转箭头。
 *
 * `nav`：侧栏分组头——整行可点、左右留白、标题字重，箭头翻转靠它自带的 group。
 */
function CollapsibleTrigger({
    variant = "plain",
    className,
    ...props
}: CollapsiblePrimitive.Trigger.Props & { variant?: "plain" | "nav" }) {
    return (
        <CollapsiblePrimitive.Trigger
            data-slot="collapsible-trigger"
            className={cn(
                variant === "nav"
                    ? "group flex w-full cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm font-semibold"
                    : "inline-flex items-center gap-1 text-sm leading-6 text-muted-foreground transition-colors hover:text-foreground",
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

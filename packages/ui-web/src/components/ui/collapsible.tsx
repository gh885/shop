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

/** 造型归组件、业务 className 只管布局（no-restyle）；配合调用方 group + group-data-[open]: 可换文案、转箭头 */
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

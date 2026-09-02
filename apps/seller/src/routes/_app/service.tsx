import { createFileRoute } from "@tanstack/react-router"

import { PlaceholderPage } from "#/shared/ui/PlaceholderPage"

/** 客服：一级叶子（单段路径 /service），当前占位。 */
export const Route = createFileRoute("/_app/service")({
    component: ServicePlaceholder,
})

function ServicePlaceholder() {
    return <PlaceholderPage title="客服" />
}

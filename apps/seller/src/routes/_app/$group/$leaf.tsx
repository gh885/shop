import { createFileRoute } from "@tanstack/react-router"

import { PlaceholderPage } from "#/shared/ui/PlaceholderPage"

export const Route = createFileRoute("/_app/$group/$leaf")({
    component: GroupLeafPlaceholder,
})

function GroupLeafPlaceholder() {
    return <PlaceholderPage />
}

import { createFileRoute } from "@tanstack/react-router"

import { PlaceholderPage } from "#/shared/ui/PlaceholderPage"
import { useT } from "#/locales/use-t"

export const Route = createFileRoute("/_app/service")({
    component: ServicePlaceholder,
})

function ServicePlaceholder() {
    const t = useT("nav")
    return <PlaceholderPage title={t("nav.service")} />
}

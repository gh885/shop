import { createFileRoute } from "@tanstack/react-router"

import { PlaceholderPage } from "#/shared/ui/PlaceholderPage"
import { useT } from "#/locales/use-t"

/** 客服：一级叶子（单段路径 /service），当前占位。 */
export const Route = createFileRoute("/_app/service")({
    component: ServicePlaceholder,
})

function ServicePlaceholder() {
    const t = useT("nav")
    return <PlaceholderPage title={t("nav.service")} />
}

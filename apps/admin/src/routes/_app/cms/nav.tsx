import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { CMS_NAV_KEYS } from "#/domains/cms/constants"
import { CmsListShell } from "#/domains/cms/list-shell"
import { NavFormDialog } from "#/domains/cms/nav/form-dialog"
import { navListOptions } from "#/domains/cms/nav/queries"
import { navSearchSchema } from "#/domains/cms/nav/search"
import { useNavColumns } from "#/domains/cms/nav/table"
import { useT } from "#/locales/use-t"

export const Route = createFileRoute("/_app/cms/nav")({
    validateSearch: navSearchSchema,
    component: NavPage,
})

function NavPage() {
    const t = useT()
    const { navKey } = Route.useSearch()
    const navigate = Route.useNavigate()

    const { data: entries = [], isPending } = useQuery(navListOptions(navKey))
    const columns = useNavColumns()

    return (
        <CmsListShell
            title={t("cms.nav.page.title")}
            description={t("cms.nav.page.description")}
            columns={columns}
            rows={entries}
            isPending={isPending}
            emptyContent={t("cms.nav.page.empty")}
            createText={t("cms.nav.create")}
            filter={{
                label: t("cms.field.navKey"),
                value: navKey,
                options: CMS_NAV_KEYS,
                onChange: (next) => void navigate({ search: { navKey: next } }),
            }}
            renderCreate={({ open, onOpenChange }) => (
                <NavFormDialog
                    open={open}
                    onOpenChange={onOpenChange}
                    defaultNavKey={navKey}
                />
            )}
        />
    )
}

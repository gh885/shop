import { z } from "zod"

import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { CMS_KEY_MAX, CMS_NAV_KEYS } from "#/cms/constants"
import { CmsListShell } from "#/cms/list-shell"
import { NavFormDialog } from "#/cms/nav/form-dialog"
import { navListOptions } from "#/cms/nav/queries"
import { useNavColumns } from "#/cms/nav/table"
import { useT } from "#/locales/use-t"

export const Route = createFileRoute("/_app/cms/nav")({
    validateSearch: z.object({
        navKey: z.string().trim().min(1).max(CMS_KEY_MAX).optional(),
    }),
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
            title={t("admin.cms.nav.page.title")}
            description={t("admin.cms.nav.page.description")}
            columns={columns}
            rows={entries}
            isPending={isPending}
            emptyContent={t("admin.cms.nav.page.empty")}
            createText={t("admin.cms.nav.create")}
            filter={{
                label: t("admin.cms.field.navKey"),
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

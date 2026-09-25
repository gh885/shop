import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { StaffListPage } from "#/account/list-page"
import { StaffStatusSchema } from "#/account/constants"

export const Route = createFileRoute("/_app/accounts/staff")({
    validateSearch: z.object({
        status: StaffStatusSchema.optional(),
        keyword: z.string().optional(),
        page: z.coerce.number().int().min(1).catch(1),
        size: z.coerce.number().int().min(1).catch(20),
    }),
    component: StaffPage,
})

function StaffPage() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    return (
        <StaffListPage
            kind="staff"
            search={search}
            navigate={navigate}
        />
    )
}

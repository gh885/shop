import { createFileRoute } from "@tanstack/react-router"

import { CategoryPage } from "#/domains/category/page"

export const Route = createFileRoute("/_authenticated/categories")({
    component: CategoryPage,
})

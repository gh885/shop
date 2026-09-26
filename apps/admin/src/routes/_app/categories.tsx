import { createFileRoute } from "@tanstack/react-router"

import { CategoryPage } from "#/category/page"

export const Route = createFileRoute("/_app/categories")({
    component: CategoryPage,
})

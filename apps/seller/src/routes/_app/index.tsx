import { Navigate, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/")({
    component: () => (
        <Navigate
            to="/products"
            search={{ page: 1, size: 10 }}
            replace
        />
    ),
})

import type { ErrorComponentProps } from "@tanstack/react-router"

import { RouteErrorFallback } from "@shop/app-kit/shell"

export function RouteError({ error, reset }: ErrorComponentProps) {
    return (
        <RouteErrorFallback
            error={error}
            reset={reset}
        />
    )
}

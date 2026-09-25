import type { ReactNode } from "react"

import { DialogDescription, DialogHeader, DialogTitle } from "@shop/ui-web"

export function OrderDialogForm({
    title,
    description,
    children,
    onSubmit,
}: {
    title: string
    description: ReactNode
    children: ReactNode
    onSubmit: () => void
}) {
    return (
        <>
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <form
                className="mt-4 flex flex-col gap-5"
                onSubmit={(event) => {
                    event.preventDefault()
                    onSubmit()
                }}
            >
                {children}
            </form>
        </>
    )
}

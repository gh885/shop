import { useState, type ComponentType } from "react"
import type { CmsStatus } from "@shop/api/sdk"

import { Button, confirm, Spinner } from "@shop/ui-web"
import { PencilIcon } from "lucide-react"

import { useT } from "#/locales/use-t"

export interface CmsFormDialogProps<T> {
    open: boolean
    onOpenChange: (open: boolean) => void
    editing?: T
}

export interface CmsRowActionsProps<T> {
    row: T
    status: CmsStatus
    label: string
    noun?: string
    hints: { disable: string; enable: string }
    submit: (status: CmsStatus) => Promise<unknown>
    pending: boolean
    Dialog: ComponentType<CmsFormDialogProps<T>>
}

export function CmsRowActions<T>({
    row,
    status,
    label,
    noun,
    hints,
    submit,
    pending,
    Dialog,
}: CmsRowActionsProps<T>) {
    const t = useT()
    const [editOpen, setEditOpen] = useState(false)
    const enabled = status === "ENABLED"
    const verb = enabled ? t("cms.row.disable") : t("cms.row.enable")

    function toggleStatus() {
        const nextStatus: CmsStatus = enabled ? "DISABLED" : "ENABLED"
        const withNoun = noun ? "yes" : "other"
        void confirm({
            title: enabled
                ? t("cms.row.disableTitle", { withNoun, noun: noun ?? "", label })
                : t("cms.row.enableTitle", { withNoun, noun: noun ?? "", label }),
            description: enabled ? hints.disable : hints.enable,
            confirmText: enabled ? t("cms.row.confirmDisableText") : t("cms.row.confirmEnableText"),
            tone: enabled ? "destructive" : "default",
            action: () => submit(nextStatus),
        })
    }

    return (
        <div className="flex justify-end gap-1">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditOpen(true)}
            >
                <PencilIcon data-slot="icon" />
                {t("cms.row.edit")}
            </Button>
            <Dialog
                open={editOpen}
                onOpenChange={setEditOpen}
                editing={row}
            />
            <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={toggleStatus}
            >
                {pending && <Spinner />}
                {verb}
            </Button>
        </div>
    )
}

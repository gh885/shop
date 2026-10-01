import { Button, DialogFooter, Spinner } from "@shop/ui-web"

export function FormActions({
    pending = false,
    destructive = false,
    disableCancel = false,
    cancelLabel = "取消",
    submitLabel,
    onCancel,
}: {
    pending?: boolean
    destructive?: boolean
    disableCancel?: boolean
    cancelLabel?: string
    submitLabel: string
    onCancel: () => void
}) {
    return (
        <DialogFooter>
            <Button
                type="button"
                variant="outline"
                disabled={disableCancel}
                onClick={onCancel}
            >
                {cancelLabel}
            </Button>
            <Button
                type="submit"
                variant={destructive ? "destructive" : undefined}
                disabled={pending}
            >
                {pending && <Spinner />}
                {submitLabel}
            </Button>
        </DialogFooter>
    )
}

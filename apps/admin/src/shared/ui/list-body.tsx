import { DataTableCard, DataTableSkeleton } from "@shop/ui-web"

export function ListBody({ isPending, columns }: { isPending: boolean; columns: number }) {
    return isPending ? <DataTableSkeleton columns={columns} /> : <DataTableCard />
}

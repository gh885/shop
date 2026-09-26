import { DataTableCard, DataTableSkeleton } from "@shop/ui-web"

/**
 * 列表体的「骨架或表卡」二选一。
 *
 * 三张列表页原本各写一遍同一个三元；而它正是 DESIGN.md 里那条「加载态看 isPending、
 * 数据态看数据」的落点——重复三次就意味着一处改了另两处会忘。
 * 表格上下文与外壳由 `DataTable` / `DataTableCard` 负责，这里只做这一步选择。
 */
export function ListBody({ isPending, columns }: { isPending: boolean; columns: number }) {
    return isPending ? <DataTableSkeleton columns={columns} /> : <DataTableCard />
}

import { useState } from "react"
import { z } from "zod"

import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import {
    Button,
    DataTable,
    DataTableSkeleton,
    DataTableToolbar,
    DataTableViewOptions,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    useDataTable,
} from "@shop/ui-web"

import { BannerFormDialog } from "#/cms/banner/form-dialog"
import { bannerListOptions } from "#/cms/banner/queries"
import { bannerColumns } from "#/cms/banner/table"
import { CMS_BANNER_SLOTS } from "#/cms/constants"

export const Route = createFileRoute("/_app/cms/banner")({
    validateSearch: z.object({
        slot: z.string().trim().min(1).max(32).optional(),
    }),
    component: BannerPage,
})

function BannerPage() {
    const { slot } = Route.useSearch()
    const navigate = Route.useNavigate()
    const [createOpen, setCreateOpen] = useState(false)

    const { data: banners = [], isPending } = useQuery(bannerListOptions(slot))

    // 后端全量返回的小表：分页/筛选交给 DataTable 客户端默认行为
    const { table } = useDataTable({
        columns: bannerColumns,
        data: banners,
        getRowId: (row) => row.id,
    })

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold">运营位 Banner</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    首页与频道页运营位配置；支持定时上下线窗口，停用即下线、不做物理删除
                </p>
            </div>

            <DataTableToolbar
                table={table}
                actions={
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCreateOpen(true)}
                        >
                            <PlusIcon data-slot="icon" />
                            新增运营位
                        </Button>
                        <DataTableViewOptions table={table} />
                    </>
                }
            >
                <Select
                    value={slot ?? "all"}
                    onValueChange={(value) =>
                        void navigate({
                            search: { slot: value === "all" ? undefined : (value ?? undefined) },
                        })
                    }
                >
                    <SelectTrigger aria-label="运营位">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部运营位</SelectItem>
                        {CMS_BANNER_SLOTS.map((s) => (
                            <SelectItem
                                key={s}
                                value={s}
                            >
                                {s}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </DataTableToolbar>

            {isPending ? (
                <DataTableSkeleton columns={bannerColumns.length} />
            ) : (
                <DataTable
                    table={table}
                    emptyContent="暂无符合条件的运营位"
                />
            )}

            <BannerFormDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                defaultSlot={slot}
            />
        </div>
    )
}

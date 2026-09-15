import { Button, Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@shop/ui-web"
import { MapPin, MoreHorizontal, Trash2 } from "lucide-react"
import type { MerchantAddressResponse } from "@shop/api/sdk"

export interface AddressTableProps {
    rows: MerchantAddressResponse[]
    busyId?: string
    /** 编辑需整份回填，故给实体 */
    onEdit: (addr: MerchantAddressResponse) => void
    /** 删除确认只需「是哪条 + 怎么念」：地址由父级持有，不回传整实体 */
    onDelete: (target: Pick<MerchantAddressResponse, "id" | "contactName">) => void
    /** 设默认只需 id */
    onSetDefaultShip: (id: string) => void
    onSetDefaultReturn: (id: string) => void
}

function fullAddress(a: MerchantAddressResponse): string {
    return [a.province, a.city, a.district].filter(Boolean).join(" ") + " " + a.detail
}

/** 商家地址库列表：一行一个地址，默认发货/退货标记 + 设为/编辑/删除操作 */
export function AddressTable({
    rows,
    busyId,
    onEdit,
    onDelete,
    onSetDefaultShip,
    onSetDefaultReturn,
}: AddressTableProps) {
    if (rows.length === 0) {
        return (
            <Empty className="py-16">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <MapPin />
                    </EmptyMedia>
                    <EmptyTitle>还没有地址</EmptyTitle>
                    <EmptyDescription>先添加发货或退货地址，才能正常发货。</EmptyDescription>
                </EmptyHeader>
            </Empty>
        )
    }

    return (
        <div className="divide-y rounded-xl border">
            <div className="grid grid-address-list items-center gap-4 px-4 py-2.5 text-sm font-medium text-muted-foreground">
                <span>地址</span>
                <span>联系人</span>
                <span>备注</span>
                <span>状态</span>
                <span className="text-right">操作</span>
            </div>
            {rows.map((a) => (
                <div
                    key={a.id}
                    className="grid grid-address-list items-center gap-4 px-4 py-3"
                >
                    <div className="min-w-0">
                        <p className="truncate">{fullAddress(a)}</p>
                        <div className="mt-1 flex gap-1.5">
                            {a.defaultShip && (
                                <span className="rounded-sm bg-info-subtle px-1.5 py-0.5 text-xs text-info-subtle-foreground">
                                    默认发货
                                </span>
                            )}
                            {a.defaultReturn && (
                                <span className="rounded-sm bg-success-subtle px-1.5 py-0.5 text-xs text-success-subtle-foreground">
                                    默认退货
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="min-w-0">
                        <p className="truncate">{a.contactName}</p>
                        <p className="truncate text-sm text-muted-foreground">{a.phone}</p>
                    </div>
                    <span className="truncate text-sm text-muted-foreground">{a.note || "—"}</span>
                    <span className="text-sm">正常</span>
                    <div className="flex items-center justify-end gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === a.id}
                            onClick={() => onSetDefaultShip(a.id)}
                        >
                            设为发货
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === a.id}
                            onClick={() => onSetDefaultReturn(a.id)}
                        >
                            设为退货
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="编辑"
                            onClick={() => onEdit(a)}
                        >
                            <MoreHorizontal className="size-4" />
                        </Button>
                        <Button
                            variant="destructive"
                            size="icon"
                            aria-label="删除"
                            disabled={busyId === a.id}
                            onClick={() => onDelete({ id: a.id, contactName: a.contactName })}
                        >
                            <Trash2 className="size-4" />
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    )
}

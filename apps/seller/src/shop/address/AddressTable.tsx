import {
    Badge,
    Button,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    TableShell,
} from "@shop/ui-web"
import { MapPin, Pencil, Trash2 } from "lucide-react"
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
        <TableShell>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>地址</TableHead>
                        <TableHead>联系人</TableHead>
                        <TableHead>备注</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((a) => (
                        <TableRow key={a.id}>
                            <TableCell className="max-w-96 whitespace-normal">
                                <p className="break-all">{fullAddress(a)}</p>
                                <div className="mt-1 flex gap-1.5">
                                    {a.defaultShip && <Badge variant="info">默认发货</Badge>}
                                    {a.defaultReturn && <Badge variant="success">默认退货</Badge>}
                                </div>
                            </TableCell>
                            <TableCell>
                                <p>{a.contactName}</p>
                                <p className="text-muted-foreground tabular-nums">{a.phone}</p>
                            </TableCell>
                            <TableCell variant="muted">
                                <span
                                    className="block max-w-48 truncate"
                                    title={a.note || undefined}
                                >
                                    {a.note || "—"}
                                </span>
                            </TableCell>
                            <TableCell>
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
                                        size="icon-sm"
                                        aria-label="编辑"
                                        onClick={() => onEdit(a)}
                                    >
                                        <Pencil />
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="icon-sm"
                                        aria-label="删除"
                                        disabled={busyId === a.id}
                                        onClick={() =>
                                            onDelete({ id: a.id, contactName: a.contactName })
                                        }
                                    >
                                        <Trash2 />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableShell>
    )
}

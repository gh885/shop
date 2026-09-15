import { MapPin } from "lucide-react"

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
} from "@shop/ui-web"

import { ADDRESS_LABELS, type Address } from "./address"

function labelName(label?: string) {
    if (!label) return undefined
    // 未知（自定义）标签按原样文本展示
    return label in ADDRESS_LABELS ? ADDRESS_LABELS[label as keyof typeof ADDRESS_LABELS] : label
}

export interface AddressTableProps {
    addresses: Address[]
    /** 编辑需整份回填，故给实体 */
    onEdit: (a: Address) => void
    /** 删除确认只需「是哪条 + 怎么念」：地址由父级持有，不回传整实体 */
    onDelete: (target: Pick<Address, "id" | "receiver">) => void
    /** 设/取消默认只需 id */
    onSetDefault: (id: string) => void
    onUnsetDefault: (id: string) => void
}

/** 收货地址列表（纯展示：数据与动作回调均由父级注入）
 *  结构对齐淘宝：标签/默认徽章内联在详细地址后，操作列放文字链 */
export function AddressTable({
    addresses,
    onEdit,
    onDelete,
    onSetDefault,
    onUnsetDefault,
}: AddressTableProps) {
    return (
        <div className="rounded-lg border border-border bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>收货人</TableHead>
                        <TableHead>电话/手机</TableHead>
                        <TableHead>所在地区</TableHead>
                        <TableHead>详细地址</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {addresses.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5}>
                                <Empty className="my-6">
                                    <EmptyHeader>
                                        <EmptyMedia variant="icon">
                                            <MapPin />
                                        </EmptyMedia>
                                        <EmptyTitle>暂无收货地址</EmptyTitle>
                                        <EmptyDescription>
                                            添加常用收货地址，下单更快捷
                                        </EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            </TableCell>
                        </TableRow>
                    ) : (
                        addresses.map((a) => {
                            const label = labelName(a.label)
                            return (
                                <TableRow key={a.id}>
                                    <TableCell variant="strong">{a.receiver}</TableCell>
                                    <TableCell className="tabular-nums">{a.phone}</TableCell>
                                    <TableCell className="whitespace-nowrap">
                                        {[a.province, a.city, a.district].filter(Boolean).join(" ")}
                                    </TableCell>
                                    <TableCell className="max-w-80">
                                        <span className="inline-flex flex-wrap items-center gap-1.5">
                                            <span
                                                className="truncate"
                                                title={a.detail}
                                            >
                                                {a.detail}
                                            </span>
                                            {label && <Badge variant="secondary">{label}</Badge>}
                                            {a.isDefault && <Badge>默认</Badge>}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right whitespace-nowrap">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onEdit(a)}
                                            >
                                                编辑
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() =>
                                                    onDelete({ id: a.id, receiver: a.receiver })
                                                }
                                            >
                                                删除
                                            </Button>
                                            {a.isDefault ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onUnsetDefault(a.id)}
                                                >
                                                    取消默认
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onSetDefault(a.id)}
                                                >
                                                    设为默认
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })
                    )}
                </TableBody>
            </Table>
        </div>
    )
}

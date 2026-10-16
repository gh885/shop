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
    TableShell,
} from "@shop/ui-web"

import { foldRegion } from "@shop/common/domain"

import { useT } from "#/locales/use-t"
import { labelName, type Address } from "./address"

export interface AddressTableProps {
    addresses: Address[]
    onEdit: (a: Address) => void
    onDelete: (target: Pick<Address, "id" | "receiver">) => void
    onSetDefault: (id: string) => void
    onUnsetDefault: (id: string) => void
}

export function AddressTable({
    addresses,
    onEdit,
    onDelete,
    onSetDefault,
    onUnsetDefault,
}: AddressTableProps) {
    const t = useT("address")

    return (
        <TableShell>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t("address.table.receiver")}</TableHead>
                        <TableHead>{t("address.table.phone")}</TableHead>
                        <TableHead>{t("address.table.region")}</TableHead>
                        <TableHead>{t("address.field.detail")}</TableHead>
                        <TableHead className="text-right">{t("address.table.actions")}</TableHead>
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
                                        <EmptyTitle>{t("address.table.emptyTitle")}</EmptyTitle>
                                        <EmptyDescription>
                                            {t("address.table.emptyDescription")}
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
                                        {foldRegion(a)}
                                    </TableCell>
                                    <TableCell className="max-w-80 whitespace-normal">
                                        <span className="inline-flex flex-wrap items-center gap-1.5">
                                            <span className="break-all">{a.detail}</span>
                                            {label && (
                                                <Badge variant="secondary">
                                                    {label.kind === "key"
                                                        ? t(label.key)
                                                        : label.text}
                                                </Badge>
                                            )}
                                            {a.isDefault && (
                                                <Badge>{t("address.table.defaultBadge")}</Badge>
                                            )}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right whitespace-nowrap">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onEdit(a)}
                                            >
                                                {t("address.table.edit")}
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() =>
                                                    onDelete({ id: a.id, receiver: a.receiver })
                                                }
                                            >
                                                {t("address.table.delete")}
                                            </Button>
                                            {a.isDefault ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onUnsetDefault(a.id)}
                                                >
                                                    {t("address.table.unsetDefault")}
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onSetDefault(a.id)}
                                                >
                                                    {t("address.table.setDefault")}
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
        </TableShell>
    )
}

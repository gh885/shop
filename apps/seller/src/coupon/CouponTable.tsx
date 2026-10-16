import {
    Badge,
    Button,
    confirm,
    Progress,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shop/ui-web"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { TableCard } from "#/shared/ui/TableCard"
import { couponRuleText } from "./coupon-rule"
import type { CouponRow } from "./model"

export function CouponTable({
    rows,
    page,
    pageSize,
    total,
    busyId,
    onPageChange,
    onStop,
}: {
    rows: CouponRow[]
    page: number
    pageSize: number
    total: number
    busyId?: string
    onPageChange: (page: number) => void
    onStop: (id: string) => void
}) {
    const { locale } = useI18n()
    const t = useT()
    async function confirmStop(row: CouponRow) {
        const ok = await confirm({
            title: t("coupon.list.confirm.stop.title"),
            description: t("coupon.list.confirm.stop.desc", { name: row.name }),
            confirmText: t("coupon.list.confirm.stop.confirm"),
        })
        if (ok) onStop(row.id)
    }

    return (
        <TableCard
            total={total}
            unit={t("coupon.list.pagination.unit")}
            page={page}
            pageSize={pageSize}
            onPageChange={onPageChange}
        >
            <TableHeader>
                <TableRow>
                    <TableHead className="min-w-56">{t("coupon.list.header.name")}</TableHead>
                    <TableHead className="min-w-36">{t("coupon.list.header.rule")}</TableHead>
                    <TableHead className="min-w-48">{t("coupon.list.header.period")}</TableHead>
                    <TableHead className="min-w-44">
                        {t("coupon.list.header.issueStatus")}
                    </TableHead>
                    <TableHead>{t("coupon.list.header.status")}</TableHead>
                    <TableHead className="min-w-32">{t("coupon.list.header.createdAt")}</TableHead>
                    <TableHead className="text-right">{t("coupon.list.header.action")}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((row) => {
                    const stopped = row.status === "STOPPED"
                    return (
                        <TableRow key={row.id}>
                            <TableCell variant="strong">{row.name}</TableCell>
                            <TableCell>{couponRuleText(row.rule, locale, t)}</TableCell>
                            <TableCell className="tabular-nums">{row.periodText}</TableCell>
                            <TableCell>
                                <div className="space-y-1.5">
                                    <p className="text-xs text-muted-foreground tabular-nums">
                                        {t("coupon.list.issued", {
                                            issued: row.issuedQuantity,
                                            total: row.totalQuantity,
                                        })}
                                    </p>
                                    <Progress
                                        value={row.issuedQuantity}
                                        max={row.totalQuantity}
                                        aria-label={t("coupon.list.progress.aria", {
                                            name: row.name,
                                            issued: row.issuedQuantity,
                                            total: row.totalQuantity,
                                        })}
                                    />
                                    {/* 已发放≠已核销：差额是「领了没用掉」的那批，卖家唯一能看的信号 */}
                                    <p className="text-xs text-muted-foreground tabular-nums">
                                        {t("coupon.list.used", { used: row.usedQuantity })}
                                    </p>
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant={row.statusVariant}>{t(row.statusLabelKey)}</Badge>
                            </TableCell>
                            <TableCell
                                variant="muted"
                                className="tabular-nums"
                            >
                                {formatDateTime(row.createdAt, locale)}
                            </TableCell>
                            <TableCell className="text-right">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={stopped || row.id === busyId}
                                    onClick={() => confirmStop(row)}
                                >
                                    {stopped ? t("coupon.status.STOPPED") : t("coupon.action.stop")}
                                </Button>
                            </TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
        </TableCard>
    )
}

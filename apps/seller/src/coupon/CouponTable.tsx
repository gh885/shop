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

/**
 * 券列表主表格：券名 / 一句话规则 / 有效期 / 发放与核销 / 状态 / 创建时间 / 操作。
 *
 * 纯展示 + 事件上抛：数据与分页状态归容器（URL 同步），本组件不拉数据不写 URL。
 * 进度条旁边的数字不是装饰——进度不能只靠颜色传达，色觉障碍与灰度打印下都要能读数。
 */
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
    /** 停券二次确认：确认后才真正执行 onStop（动作与 busyId 记账归容器） */
    async function confirmStop(row: CouponRow) {
        const ok = await confirm({
            title: t("coupon.list.confirm.stop.title"),
            // 说清后果而不是只染红按钮：停发不影响已领出的券，且没有恢复入口
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
                                    {/* 已发放只说明券发出去了，已核销才说明券变成了订单——
                                            两者差额就是「领了没用掉」的那批，是卖家判断值不值得续投的唯一线索 */}
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

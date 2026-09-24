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
import { formatDateTime } from "@shop/app-kit"

import { TableCard } from "#/shared/ui/TableCard"
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
    /** 停券二次确认：确认后才真正执行 onStop（动作与 busyId 记账归容器） */
    async function confirmStop(row: CouponRow) {
        const ok = await confirm({
            title: "停用优惠券",
            // 说清后果而不是只染红按钮：停发不影响已领出的券，且没有恢复入口
            description:
                `确定停用「${row.name}」吗？停用后买家不能再领取，` +
                "已领出的券仍然有效。此处没有恢复入口——需要继续发放请新建一张。",
            confirmText: "停用",
        })
        if (ok) onStop(row.id)
    }

    return (
        <TableCard
            total={total}
            unit="张券"
            page={page}
            pageSize={pageSize}
            onPageChange={onPageChange}
        >
            <TableHeader>
                <TableRow>
                    <TableHead className="min-w-56">券名</TableHead>
                    <TableHead className="min-w-36">规则</TableHead>
                    <TableHead className="min-w-48">有效期</TableHead>
                    <TableHead className="min-w-44">发放 / 核销</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="min-w-32">创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((row) => {
                    const stopped = row.status === "STOPPED"
                    return (
                        <TableRow key={row.id}>
                            <TableCell variant="strong">{row.name}</TableCell>
                            <TableCell>{row.ruleText}</TableCell>
                            <TableCell className="tabular-nums">{row.periodText}</TableCell>
                            <TableCell>
                                <div className="space-y-1.5">
                                    <p className="text-xs text-muted-foreground tabular-nums">
                                        已发放 {row.issuedQuantity} / {row.totalQuantity}
                                    </p>
                                    <Progress
                                        value={row.issuedQuantity}
                                        max={row.totalQuantity}
                                        aria-label={`${row.name} 已发放 ${row.issuedQuantity} / ${row.totalQuantity}`}
                                    />
                                    {/* 已发放只说明券发出去了，已核销才说明券变成了订单——
                                            两者差额就是「领了没用掉」的那批，是卖家判断值不值得续投的唯一线索 */}
                                    <p className="text-xs text-muted-foreground tabular-nums">
                                        已核销 {row.usedQuantity}
                                    </p>
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant={row.statusVariant}>{row.statusLabel}</Badge>
                            </TableCell>
                            <TableCell
                                variant="muted"
                                className="tabular-nums"
                            >
                                {formatDateTime(row.createdAt)}
                            </TableCell>
                            <TableCell className="text-right">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={stopped || row.id === busyId}
                                    onClick={() => confirmStop(row)}
                                >
                                    {stopped ? "已停用" : "停用"}
                                </Button>
                            </TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
        </TableCard>
    )
}

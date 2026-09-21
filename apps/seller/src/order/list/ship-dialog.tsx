import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import type { OrderIdentity } from "./table"
import { toApiError } from "@shop/common"
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@shop/ui-web"

import { carrierListOptions } from "#/order/queries"

/**
 * 卖家发货弹窗：选承运商（字典下拉）+ 填运单号。提交经 onShip 上抛（mutation 在容器持有）。
 *
 * <p>承运商是自由文本升级来的：同一个顺丰曾能写出五种字，落库后既没法统计也没法对接物流商接口，
 * 现在只传字典 code，展示名由后端按字典归一（规则见 docs/business-rules/logistics.md LOG-70）。
 * 字典是弹窗自己拉的——加载/失败态就地渲染，不必让调用方认识"快递公司还没到"这件事。
 */
export function ShipDialog({
    open,
    order,
    onOpenChange,
    onShip,
}: {
    open: boolean
    /** 本弹窗只读 id（请求）与单号（展示），不背整行订单 */
    order?: OrderIdentity
    onOpenChange: (open: boolean) => void
    onShip: (orderId: string, input: { carrierCode: string; trackingNo: string }) => void
}) {
    const carriers = useQuery(carrierListOptions())
    // 未选中用 undefined：BaseUI 以 value == null 判定未选中并渲染 placeholder（undefined == null），
    // 与 onValueChange 清空时的取值同形
    const [carrierCode, setCarrierCode] = useState<string | undefined>(undefined)
    const [trackingNo, setTrackingNo] = useState("")
    const [error, setError] = useState<string>()

    // oxlint-disable react-doctor/no-reset-all-state-on-prop-change, react-doctor/no-adjust-state-on-prop-change -- 打开即重置表单是有意为之（复用组件实例，避免 key 重挂载）
    useEffect(() => {
        if (open) {
            // oxlint-disable-next-line react/set-state-in-effect -- 打开即重置表单是有意为之（复用组件实例，避免 key 重挂载）
            setCarrierCode(undefined)
            setTrackingNo("")
            setError(undefined)
        }
    }, [open])
    // oxlint-enable react-doctor/no-reset-all-state-on-prop-change, react-doctor/no-adjust-state-on-prop-change

    const submit = () => {
        if (!order) return
        const t = trackingNo.trim()
        if (!carrierCode) return setError("请选择快递公司")
        if (!t) return setError("请填写运单号")
        onShip(order.id, { carrierCode, trackingNo: t })
        onOpenChange(false)
    }

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            {/* max-w 基底已由 ui-web 的 DialogContent 提供（含 max-w-[calc(100%-2rem)]），这里只覆盖 sm: 档 */}
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>发货</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="text-sm">
                        <span className="text-muted-foreground">订单号：</span>
                        <span className="font-medium tabular-nums">{order?.orderNo}</span>
                    </div>
                    <div className="space-y-1.5">
                        <label
                            htmlFor="ship-carrier"
                            className="text-sm font-medium"
                        >
                            快递公司
                        </label>
                        {carriers.isPending ? (
                            <div className="h-8 w-full animate-pulse rounded-lg bg-muted" />
                        ) : carriers.isError ? (
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm text-destructive">
                                    {toApiError(carriers.error).detail}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={carriers.isFetching}
                                    onClick={() => void carriers.refetch()}
                                >
                                    重试
                                </Button>
                            </div>
                        ) : carriers.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                暂无可选快递公司，请联系平台维护字典
                            </p>
                        ) : (
                            <Select
                                items={carriers.data.map((c) => ({ value: c.code, label: c.name }))}
                                value={carrierCode}
                                onValueChange={(value) => {
                                    // BaseUI Select 回调给 string | null（对外 null 契约），内部统一 undefined
                                    setCarrierCode(value ?? undefined)
                                    if (error) setError(undefined)
                                }}
                            >
                                <SelectTrigger
                                    id="ship-carrier"
                                    className="w-full"
                                >
                                    <SelectValue placeholder="选择快递公司" />
                                </SelectTrigger>
                                <SelectContent>
                                    {carriers.data.map((c) => (
                                        <SelectItem
                                            key={c.code}
                                            value={c.code}
                                        >
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <label
                            htmlFor="ship-tracking"
                            className="text-sm font-medium"
                        >
                            运单号
                        </label>
                        <Input
                            id="ship-tracking"
                            value={trackingNo}
                            onChange={(e) => {
                                setTrackingNo(e.target.value)
                                if (error) setError(undefined)
                            }}
                            maxLength={64}
                            placeholder="快递运单号"
                        />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <Button
                        variant="secondary"
                        onClick={() => onOpenChange(false)}
                    >
                        取消
                    </Button>
                    <Button onClick={submit}>发货</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

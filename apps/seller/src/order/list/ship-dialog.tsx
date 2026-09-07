import { useEffect, useState } from "react"

import type { SellerOrderListItemResponse } from "@shop/api/sdk"
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
} from "@shop/ui-web"

/** 卖家发货弹窗：填物流公司 + 运单号（ShipOrderRequest）。提交经 onShip 上抛（mutation 在容器持有）。 */
export function ShipDialog({
    open,
    order,
    onOpenChange,
    onShip,
}: {
    open: boolean
    order?: SellerOrderListItemResponse
    onOpenChange: (open: boolean) => void
    onShip: (orderId: string, input: { logisticsCompany: string; trackingNo: string }) => void
}) {
    const [company, setCompany] = useState("")
    const [trackingNo, setTrackingNo] = useState("")
    const [error, setError] = useState<string>()

    useEffect(() => {
        if (open) {
            setCompany("")
            setTrackingNo("")
            setError(undefined)
        }
    }, [open])

    const submit = () => {
        if (!order) return
        const c = company.trim()
        const t = trackingNo.trim()
        if (!c) return setError("请填写物流公司")
        if (!t) return setError("请填写运单号")
        onShip(order.id, { logisticsCompany: c, trackingNo: t })
        onOpenChange(false)
    }

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
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
                            htmlFor="ship-company"
                            className="text-sm font-medium"
                        >
                            物流公司
                        </label>
                        <Input
                            id="ship-company"
                            value={company}
                            onChange={(e) => {
                                setCompany(e.target.value)
                                if (error) setError(undefined)
                            }}
                            maxLength={50}
                            placeholder="如：顺丰速运"
                        />
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

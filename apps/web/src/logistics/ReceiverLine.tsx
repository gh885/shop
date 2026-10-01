import { maskPhone } from "@shop/common/domain" /** 页脚收货行：「收 张三, 138****0000, 浙江省杭州市…」（手机号掩码，姓名与地址全给——这是买家自己的单） */
export interface ReceiverLineProps {
    receiverName: string
    receiverPhone: string
    /** 省 + 市 + 区 + 详细地址，已拼接 */
    address: string
}

export function ReceiverLine({ receiverName, receiverPhone, address }: ReceiverLineProps) {
    return (
        <div className="flex items-start gap-2 border-t border-border/60 pt-4 text-sm">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-3xs text-muted-foreground">
                收
            </span>
            <span className="text-foreground">
                {receiverName}，{maskPhone(receiverPhone)}，{address}
            </span>
        </div>
    )
}

import type { Money } from "@shop/common"

import { Price } from "#/shared/ui/Price"

/**
 * 店铺组底部的金额句：「商品总价 ¥97.00 + 运费 ¥0.00 − 优惠 ¥3.00」。
 *
 * 单独抽成组件只有一个原因：**这句话的算术必须读得通**，而减号是最容易写重的地方——
 * 这里的优惠金额用不带负号的 `Price`，负号由句子自己出一个；右栏那行「优惠」才用
 * `DiscountPrice`（那里没有句子的减号，负号必须由值自己带）。
 * 抽出来也让它能被单测钉住：内联在路由文件里的 JSX，任何测试都够不着，
 * 于是「减负三块」这种一眼看穿的矛盾就是这样漏过去的。
 */
export function GroupAmountSentence({
    itemAmount,
    shippingFee,
    discountAmount,
}: {
    itemAmount: Money
    shippingFee: Money
    discountAmount: Money
}) {
    return (
        <span className="text-muted-foreground">
            商品总价{" "}
            <Price
                value={itemAmount}
                className="text-sm text-foreground"
            />{" "}
            + 运费{" "}
            <Price
                value={shippingFee}
                className="text-sm text-foreground"
            />
            {discountAmount.amount > 0 && (
                <>
                    {" "}
                    − 优惠{" "}
                    <Price
                        value={discountAmount}
                        className="text-sm text-foreground"
                    />
                </>
            )}
        </span>
    )
}

import { type Money, isPositiveMoney } from "@shop/common/domain"
import { useT } from "#/locales/use-t"
import { Price } from "#/shared/ui/Price"

export function GroupAmountSentence({
    itemAmount,
    shippingFee,
    discountAmount,
}: {
    itemAmount: Money
    shippingFee: Money
    discountAmount: Money
}) {
    const t = useT()
    return (
        <span className="text-muted-foreground">
            {t("checkout.summary.goodsTotal")}{" "}
            <Price
                value={itemAmount}
                className="text-sm text-foreground"
            />{" "}
            + {t("checkout.summary.shipping")}{" "}
            <Price
                value={shippingFee}
                className="text-sm text-foreground"
            />
            {isPositiveMoney(discountAmount) && (
                <>
                    {" "}
                    − {t("checkout.summary.discount")}{" "}
                    <Price
                        value={discountAmount}
                        className="text-sm text-foreground"
                    />
                </>
            )}
        </span>
    )
}

package com.shop.platform.aftersale.dto;

import com.shop.platform.common.Quantities;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.util.UUID;

/**
 * 一条退款行：退哪一行订单、几件。金额不支持客户端指定——金额由服务端按行实付与已退摊（§6.2），
 * 让客户端报金额等于让它自己定义退多少钱。
 *
 * <p>数量上限借用一行的件数上限（{@link Quantities#LINE_QUANTITY_MAX}）：它是同一张订单行的 DB 上界，
 * 真正的额度由服务端按「已发 / 已退」再收一次。
 */
public record RefundLineRequest(
        @NotNull(message = "请选择订单行") UUID orderItemId,
        @NotNull(message = "请填写退款数量")
                @Positive(message = "退款数量必须大于 0")
                @Max(value = Quantities.LINE_QUANTITY_MAX, message = "退款数量最多 " + Quantities.LINE_QUANTITY_MAX)
                Integer quantity) {}

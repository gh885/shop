package com.shop.platform.order.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 创建订单入参：结算行（{@link OrderLineRequest}，skuId + 件数）由前端从购物车勾选或立即购买归约而来，
 * order 只按 product / inventory 重算价格与库存，不回查购物车。addressId 必填——预览阶段可先不选地址，
 * 真正下单必须已确定收货信息。
 *
 * <p>checkoutKey：一次结算的幂等键，前端进入结算页时生成一次，双击与网络超时后的重试都带同一个值；
 * 后端撞键即回读原单返回（见 OrderPlacementService），不会冻结第二次库存。
 *
 * <p>userCouponIds：买家选中的券（可空 = 不用券）。一次结算按店拆单，故理论上可传多张（一店一张）；
 * 后端逐张校验可用性，不可用或不属本单的券一律 400，不静默忽略。
 */
public record CreateOrderRequest(
        @NotNull UUID checkoutKey,
        @NotNull UUID addressId,
        @NotEmpty List<@Valid OrderLineRequest> lines,
        @Size(max = 20, message = "一次结算最多选择 20 张优惠券") List<UUID> userCouponIds,
        @Size(max = 200, message = "留言最多 200 字") String buyerMessage) {}

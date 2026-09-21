package com.shop.platform.order.dto;

import jakarta.validation.Valid;
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
 * 后端撞键即回读原单返回，不会冻结第二次库存。
 *
 * <p>行数 1~99：上限与 cart 的坑位上限（MAX_ITEMS_PER_USER=99）刻意同值——全选整车恰好等于上限，超过即不经购物车的脚本刷单。
 * 必填交给 {@code @NotNull}、区间交给 {@code @Size(min=1)}：springdoc 只从 {@code @NotEmpty}/{@code @NotNull} 推
 * {@code required}，而 {@code @NotEmpty + @Size} 并存时 {@code minItems} 会被 {@code @Size} 默认的 {@code min=0} 盖掉。
 *
 * <p>userCouponIds：买家选中的券（可空 = 不用券）。一次结算按店拆单，故理论上可传多张（一店一张）；
 * 后端逐张校验可用性，不可用或不属本单的券一律 400，不静默忽略。
 */
public record CreateOrderRequest(
        @NotNull UUID checkoutKey,
        @NotNull UUID addressId,
        @NotNull @Size(min = 1, max = 99, message = "结算条目需 1 到 99 行") List<@Valid OrderLineRequest> lines,
        @Size(max = 20, message = "一次结算最多选择 20 张优惠券") List<UUID> userCouponIds,
        @Size(max = 200, message = "留言最多 200 字") String buyerMessage) {}

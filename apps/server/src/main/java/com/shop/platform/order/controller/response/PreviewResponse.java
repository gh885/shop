package com.shop.platform.order.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.coupon.api.CouponAvailabilityView;
import com.shop.platform.coupon.api.CouponUnavailableReason;
import com.shop.platform.order.service.CheckoutPreview;
import com.shop.platform.order.service.ValidLine;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 结算预览出参，镜像 service 形状 CheckoutPreview，金额走 Money（amount + currency）。
 *
 * <p>组内 {@code payAmount = itemAmount + shippingFee - discountAmount}（运费按收货地区与同店合计件数现算，
 * 优惠按本店选中的券现算）；{@code deliverable=false} 表示该店不配送到所选地区，前端据此拦住提交（下单侧同样会拒）。
 *
 * <p>{@code coupons} 是该店的券评估结果（含不可用者与原因码）——结算页据此渲染选券区，
 * 并回答「这张券为什么不能用」。{@code appliedCouponId} 是当前生效的那张（没用券为 null）。
 */
public record PreviewResponse(
        @Schema(requiredMode = REQUIRED) List<Group> groups,
        @Schema(requiredMode = REQUIRED) List<UnavailableLine> unavailable,
        @Schema(requiredMode = REQUIRED, nullable = true) Address address,
        @Schema(requiredMode = REQUIRED) Money totalPayAmount) {

    public static PreviewResponse from(CheckoutPreview p) {
        return new PreviewResponse(
                p.groups().stream().map(Group::from).toList(),
                p.unavailable().stream()
                        .map(u -> new UnavailableLine(u.skuId(), u.name(), u.image(), u.quantity(), u.cause()))
                        .toList(),
                p.address() != null ? Address.from(p.address()) : null,
                p.totalPayAmount());
    }

    public record Group(
            @Schema(requiredMode = REQUIRED) UUID shopId,
            @Schema(requiredMode = REQUIRED) String shopName,
            @Schema(requiredMode = REQUIRED) List<Item> lines,
            @Schema(requiredMode = REQUIRED) Money itemAmount,
            @Schema(requiredMode = REQUIRED) Money shippingFee,
            @Schema(requiredMode = REQUIRED) Money discountAmount,
            @Schema(requiredMode = REQUIRED) Money payAmount,
            @Schema(requiredMode = REQUIRED) Boolean deliverable,
            @Schema(requiredMode = REQUIRED) List<Coupon> coupons,
            @Schema(requiredMode = REQUIRED, nullable = true) UUID appliedCouponId) {

        public static Group from(CheckoutPreview.Group g) {
            return new Group(
                    g.shopId(),
                    g.shopName(),
                    g.lines().stream().map(Item::from).toList(),
                    g.itemAmount(),
                    g.shippingFee(),
                    g.discountAmount(),
                    g.payAmount(),
                    g.deliverable(),
                    g.coupons().stream().map(Coupon::from).toList(),
                    g.appliedCoupon() == null ? null : g.appliedCoupon().userCouponId());
        }
    }

    /**
     * 券候选（本店）：可用性与可减金额 + 不可用原因码。
     *
     * <p>reason 是枚举 name()，前端按码出文案（后端也给了一句兜底文案，见 CouponUnavailableReason.message）——
     * 只回 boolean 会让结算页无法解释，用户只能去投诉。
     */
    public record Coupon(
            @Schema(requiredMode = REQUIRED) UUID userCouponId,
            @Schema(requiredMode = REQUIRED) String name,
            @Schema(requiredMode = REQUIRED) Money threshold,
            @Schema(requiredMode = REQUIRED) Money discount,
            @Schema(requiredMode = REQUIRED) OffsetDateTime expireAt,
            @Schema(requiredMode = REQUIRED) Boolean usable,
            /** 不可用原因码；usable=true 时为 null。前端按码出文案（枚举名即 wire 值） */
            @Schema(requiredMode = REQUIRED, nullable = true) CouponUnavailableReason unavailableReason) {

        public static Coupon from(CouponAvailabilityView v) {
            return new Coupon(
                    v.userCouponId(),
                    v.name(),
                    v.threshold(),
                    v.discount(),
                    v.expireAt(),
                    v.usable(),
                    v.unavailableReason());
        }
    }

    public record Item(
            @Schema(requiredMode = REQUIRED) UUID skuId,
            @Schema(requiredMode = REQUIRED) UUID productId,
            @Schema(requiredMode = REQUIRED) String name,
            @Schema(requiredMode = REQUIRED, nullable = true) String image,
            @Schema(requiredMode = REQUIRED) Money price,
            @Schema(requiredMode = REQUIRED, nullable = true) Money originalPrice,
            @Schema(requiredMode = REQUIRED) Integer quantity,
            @Schema(requiredMode = REQUIRED) Integer stock) {

        public static Item from(ValidLine l) {
            return new Item(
                    l.skuId(),
                    l.productId(),
                    l.name(),
                    l.image(),
                    l.price(),
                    l.originalPrice(),
                    l.quantity(),
                    l.stock());
        }
    }

    public record UnavailableLine(
            @Schema(requiredMode = REQUIRED) UUID skuId,
            @Schema(requiredMode = REQUIRED) String name,
            @Schema(requiredMode = REQUIRED, nullable = true) String image,
            @Schema(requiredMode = REQUIRED) Integer quantity,
            @Schema(requiredMode = REQUIRED) String cause) {}

    public record Address(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) String receiverName,
            @Schema(requiredMode = REQUIRED) String receiverPhone,
            @Schema(requiredMode = REQUIRED) String province,
            @Schema(requiredMode = REQUIRED) String city,
            @Schema(requiredMode = REQUIRED) String district,
            @Schema(requiredMode = REQUIRED) String detail) {
        public static Address from(CheckoutPreview.Address a) {
            return new Address(
                    a.id(),
                    a.snapshot().receiverName(),
                    a.snapshot().receiverPhone(),
                    a.snapshot().province(),
                    a.snapshot().city(),
                    a.snapshot().district(),
                    a.snapshot().detail());
        }
    }
}

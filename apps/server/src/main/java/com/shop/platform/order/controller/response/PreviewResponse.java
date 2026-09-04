package com.shop.platform.order.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.service.CheckoutPreview;
import com.shop.platform.order.service.ValidLine;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/** 结算预览出参，镜像 service 形状 CheckoutPreview，金额走 Money（amount + currency） */
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
            @Schema(requiredMode = REQUIRED) Money payAmount) {

        public static Group from(CheckoutPreview.Group g) {
            return new Group(
                    g.shopId(),
                    g.shopName(),
                    g.lines().stream().map(Item::from).toList(),
                    g.itemAmount(),
                    g.shippingFee(),
                    g.payAmount());
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

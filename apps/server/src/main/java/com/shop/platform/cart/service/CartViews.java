package com.shop.platform.cart.service;

import com.shop.platform.common.money.Money;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 购物车的读侧视图。刻意扁平：按店分组是展示决策，归前端 {@code groupBy}，服务端只给字段。
 */
public final class CartViews {

    private CartViews() {}

    /**
     * 整车的一行。{@code available=false} 的行原样保留置灰——失效判定是读时做的（查不到就不在
     * {@code sellable} 里），不落库、不订事件，覆盖所有失效原因且永不出错。
     */
    public record CartLine(
            UUID skuId,
            int quantity,
            boolean selected,
            OffsetDateTime addedAt,
            boolean available,
            /** 不可售原因，前端按它映射置灰文案；available=true 时为 null */
            String unavailableReason,
            /** 失效行（下架/停售/已删）为 null——契约必须如实标注 nullable，否则前端 zod 会把合法的失效行判成契约漂移 */
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) SkuInfo sku) {

        /**
         * 失效原因的唯一取值。listing 下架 / SKU 停售 / SKU 已删对买家是同一句「已失效」，
         * 不区分——所以名字和值都不锚在「下架」上，将来要区分时再加新值。
         */
        public static final String REASON_UNAVAILABLE = "SKU_UNAVAILABLE";
    }

    /** 展示数据，catalog :: api 批查 + seller :: api 店名批查拼装，cart 自己不存这些 */
    public record SkuInfo(
            UUID spuId,
            UUID listingId,
            UUID merchantId,
            UUID shopId,
            String shopName,
            String title,
            String imageUrl,
            String specValuesJson,
            /** 提示性现价，只用于购物车页展示；真实锚点在结算页的报价单 */
            Money price) {}

    public record CartView(List<CartLine> lines) {}

    /** 角标计数：免拉整车免拼装 */
    public record CartCount(long total, long selected) {}

    /** 加购回执：合并封顶后的真值数量（请求值可能被 LEAST 截断），前端回显用 */
    public record AddedItem(UUID skuId, int quantity, long totalKinds) {}
}

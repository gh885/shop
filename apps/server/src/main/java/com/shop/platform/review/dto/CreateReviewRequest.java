package com.shop.platform.review.dto;

import com.shop.platform.common.NoteFieldRules;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 提交订单评价（POST /reviews/orders/{orderId}）：逐订单行打分，一次提交覆盖该订单的全部订单行（REV-02）。
 *
 * <p>行集合与订单行集合在 service 里对齐（缺一行/多一行都 400），DTO 只管形状——
 * 「必须覆盖全部行」是业务规则，不是一格字段能表达的。
 */
@Schema(description = "提交订单评价")
public record CreateReviewRequest(
        @NotEmpty @Size(min = 1, max = com.shop.platform.common.Quantities.ORDER_LINES_MAX) @Valid
                List<ItemInput> items) {

    /**
     * 一条评价行：引用订单行 + 星级 + 文字 + 图。
     *
     * <p>刻意不叫 {@code Item}：契约里 {@code Item} 这个名字已经被订单行项占着（order 的下单行），
     * 同名 schema 会被 springdoc 改名顶掉其中一个，SDK 侧就出现「某个 Item 少了一半字段」这种
     * 查起来极费劲的漂移。嵌套组件按语义命名（本仓约定，见 apps/server/AGENTS.md 命名规范）。
     */
    @Schema(description = "逐商品行评价")
    public record ItemInput(
            @NotNull @Schema(description = "订单行 id（orders.items.id）") UUID orderItemId,
            @NotNull @Min(ReviewFieldRules.RATING_MIN) @Max(ReviewFieldRules.RATING_MAX) Integer rating,
            @Size(max = NoteFieldRules.FREE_TEXT_MAX) String content,
            @Size(max = ReviewFieldRules.IMAGES_PER_ITEM_MAX)
                    List<@Size(max = ReviewFieldRules.IMAGE_KEY_MAX) String> images) {}
}

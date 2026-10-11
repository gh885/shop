package com.shop.platform.review.service;

import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.infra.observability.BizEvent;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.order.api.OrderReviewSourceView;
import com.shop.platform.review.dto.AppendReviewRequest;
import com.shop.platform.review.dto.CreateReviewRequest;
import com.shop.platform.review.dto.ReplyReviewRequest;
import com.shop.platform.review.mapper.Review;
import com.shop.platform.review.mapper.ReviewItem;
import com.shop.platform.review.mapper.ReviewItemMapper;
import com.shop.platform.review.mapper.ReviewMapper;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 评价写入（买家提交 / 追评、卖家回复）。读侧在 {@link ReviewQueryService}。
 *
 * <p>三条动作都是「一次机会」的 append：提交、追评、回复各一次。并发闸门一律在 mapper 里写死
 * （{@code WHERE ... IS NULL} 与 {@code uk_reviews_order_id}），抢不到即 409——
 * 判定交给调用方传参就等于把这道闸的裁决权交出去了。
 */
@Service
@RequiredArgsConstructor
public class ReviewService {

    private final ReviewMapper reviewMapper;
    private final ReviewItemMapper reviewItemMapper;
    private final OrderReadQuery orderReadQuery;

    /**
     * 提交订单评价（REV-01~04、06~07）：
     * <ol>
     *   <li>订单存在且归属本人（非本人一律 404「订单不存在」，不泄露单据存在性）；</li>
     *   <li>可评价：状态 COMPLETED 且完成时刻 +30 天窗口未过（REV-03）；</li>
     *   <li>本单未评价过（唯一索引兜底并发，撞键 409）；</li>
     *   <li>评价行与订单行一一对齐（缺行/多行/重复都 400，REV-02）。</li>
     * </ol>
     */
    @Transactional
    public MyReviewView submit(UUID orderId, UUID userId, CreateReviewRequest req) {
        OffsetDateTime now = OffsetDateTime.now();

        // 1. 订单素材：存在性 + 归属 + 状态 + 行快照（跨模块只读投影，一个点查拿全）
        OrderReviewSourceView order = Validate.presentOwned(
                orderReadQuery.reviewSourceById(orderId), OrderReviewSourceView::userId, userId, "订单不存在");
        Validate.isTrue(order.completed(), "订单完成后才能评价");
        Validate.isTrue(
                ReviewWindows.open(order.completedAt(), now), "评价已关闭，订单完成后 " + ReviewWindows.FOLLOW_UP_DAYS + " 天内可评价");

        // 2. 行对齐：必须覆盖该订单全部订单行，一行不多一行不少（REV-02）
        Map<UUID, OrderReviewSourceView.ReviewSourceLine> orderLines = order.lines().stream()
                .collect(Collectors.toMap(OrderReviewSourceView.ReviewSourceLine::orderItemId, Function.identity()));
        Validate.isTrue(req.items().size() == orderLines.size(), "评价需覆盖该订单全部 " + orderLines.size() + " 个商品行");
        Set<UUID> submitted = new HashSet<>();
        for (CreateReviewRequest.ItemInput item : req.items()) {
            Validate.isTrue(orderLines.containsKey(item.orderItemId()), "评价包含不属于该订单的商品行");
            Validate.isTrue(submitted.add(item.orderItemId()), "同一商品行只能评价一次");
        }

        // 3. 写主体：撞唯一索引 = 并发下另一笔已提交；PG 把事务标 aborted，直接折成 409（25P02）
        Review review = Review.builder()
                .orderId(orderId)
                .userId(userId)
                .shopId(order.shopId())
                .build();
        DuplicateKeys.conflictOnDuplicate(() -> reviewMapper.insert(review), "该订单已评价");

        // 4. 写评价行：商品信息取订单快照（商品改名下架不影响历史评价，REV-05）
        for (CreateReviewRequest.ItemInput item : req.items()) {
            OrderReviewSourceView.ReviewSourceLine line = orderLines.get(item.orderItemId());
            reviewItemMapper.insert(ReviewItem.builder()
                    .reviewId(review.getId())
                    .orderItemId(item.orderItemId())
                    .productId(line.productId())
                    .skuId(line.skuId())
                    .name(line.name())
                    .image(line.image())
                    .rating(item.rating())
                    .content(Text.trimToNull(item.content()))
                    .images(normalizeImages(item.images()))
                    .build());
        }

        // 5. 事件：一次评价一条（REV-16，目录见 docs/conventions/business-event-logging.md）
        BizEvent.of("review.created")
                .put("review_id", review.getId())
                .put("order_id", orderId)
                .put("user_id", userId)
                .put("shop_id", order.shopId())
                .put("item_count", req.items().size())
                .emit();
        return MyReviewViewAssembler.of(
                review, reviewItemMapper.selectByReviewIds(List.of(review.getId())), order.orderNo());
    }

    /** 追评一次（REV-09）：只能对本单自己的评价追评，跨归属一律 404 */
    @Transactional
    public void append(UUID reviewId, UUID userId, AppendReviewRequest req) {
        OffsetDateTime now = OffsetDateTime.now();

        // 1. 归属闸门：不是自己的评价一律 404（缺席与越权同一句话）
        Review review = Validate.requireOwned(reviewMapper.selectById(reviewId), Review::getUserId, userId, "评价不存在");

        // 2. 条件更新：appended_at IS NULL 抢不到即已追评（REV-09）
        Validate.conflict(reviewMapper.append(reviewId, req.text().trim(), now) == 1, "该评价已追评过");

        // 3. 事件
        BizEvent.of("review.appended")
                .put("review_id", reviewId)
                .put("order_id", review.getOrderId())
                .put("user_id", userId)
                .emit();
    }

    /**
     * 卖家回复一次（REV-10）：只能回复本店订单的评价，跨店一律 404。
     * 回复者身份由 controller 从店铺成员上下文取，成员资格由成员过滤器把关，service 不重判。
     */
    @Transactional
    public void reply(UUID reviewId, UUID shopId, UUID operatorId, ReplyReviewRequest req) {
        OffsetDateTime now = OffsetDateTime.now();

        // 1. 归属闸门：别店的评价一律 404（不给 403——那等于替调用方确认「这条存在，只是别家的」）
        Review review = Validate.requireOwned(reviewMapper.selectById(reviewId), Review::getShopId, shopId, "评价不存在");

        // 2. 条件更新：replied_at IS NULL 抢不到即已回复（REV-10）
        Validate.conflict(reviewMapper.reply(reviewId, operatorId, req.text().trim(), now) == 1, "该评价已回复过");

        // 3. 事件
        BizEvent.of("review.replied")
                .put("review_id", reviewId)
                .put("shop_id", shopId)
                .put("operator_id", operatorId)
                .emit();
    }

    /** 图片数组归一：去空白、去空串、去重（顺序保留）；null 落空数组（出参不吐 null 数组，前端 zod 会判死） */
    static List<String> normalizeImages(List<String> images) {
        if (images == null) {
            return List.of();
        }
        List<String> keys = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (String key : images) {
            String trimmed = Text.trimToNull(key);
            if (trimmed != null && seen.add(trimmed)) {
                keys.add(trimmed);
            }
        }
        return keys;
    }
}

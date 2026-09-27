package com.shop.platform.review.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.api.UserReadQuery;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Nickname;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.order.api.OrderReviewSourceView;
import com.shop.platform.review.mapper.Review;
import com.shop.platform.review.mapper.ReviewItem;
import com.shop.platform.review.mapper.ReviewItemMapper;
import com.shop.platform.review.mapper.ReviewMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 评价读侧：商详评价区（聚合 + 列表）与买家的「我的评价」。
 *
 * <p>两处都只读本模块 schema + 两个跨模块点查（买家昵称、订单号），不 JOIN（REV-12/15）。
 */
@Service
@RequiredArgsConstructor
public class ReviewQueryService {

    private final ReviewMapper reviewMapper;
    private final ReviewItemMapper reviewItemMapper;
    private final UserReadQuery userReadQuery;
    private final OrderReadQuery orderReadQuery;

    /**
     * 商详评价区：聚合（按全量评分行算，不受分页影响，REV-14）+ 评分行分页列表。
     *
     * <p>列表按<b>评分行</b>分页而不是按评价分页：买家看到的是「逐个商品说的」，
     * 一单一评只是「同一单的多行共享一个追评/回复位」。按行分页时一页行数仍受 PageParams 封顶。
     */
    @Transactional(readOnly = true)
    public ProductReviewList listProductReviews(UUID productId, PageParams pageParams) {
        // 1. 聚合：一次 SQL 出总数/好评数/评分和（mapper 内闭合，见 ReviewItemMapper.countRatingSplit）
        Map<String, Long> split = reviewItemMapper.countRatingSplit(productId);
        long total = split.get("total");
        ProductReviewSummary summary = new ProductReviewSummary(
                total, split.get("good"), percent(split.get("good"), total), average(split.get("ratingSum"), total));

        // 2. 列表：评分行分页（稳定排序 REV-13），再按 reviewId 批量取主体拿追评与回复
        Page<ReviewItem> rows = reviewItemMapper.selectPageByProduct(pageParams, productId);
        Map<UUID, Review> subjects = subjectsOf(rows.getRecords());

        // 3. 买家昵称：一次批量点查（account :: api），出参一律掩码（REV-15）
        Set<UUID> buyers = subjects.values().stream().map(Review::getUserId).collect(Collectors.toSet());
        Map<UUID, String> nicknames = buyers.isEmpty() ? Map.of() : userReadQuery.nicknamesByIds(buyers);

        // 4. 拼装
        List<ProductReviewItem> items = rows.getRecords().stream()
                .map(item -> {
                    Review subject = subjects.get(item.getReviewId());
                    return new ProductReviewItem(
                            item.getId(),
                            item.getReviewId(),
                            item.getName(),
                            item.getImage(),
                            item.getRating(),
                            item.getContent(),
                            item.getImages() == null ? List.of() : item.getImages(),
                            subject == null ? null : subject.getAppendText(),
                            subject == null ? null : subject.getAppendedAt(),
                            subject == null ? null : subject.getReply(),
                            subject == null ? null : subject.getRepliedAt(),
                            subject == null ? "***" : Nickname.mask(nicknames.get(subject.getUserId())),
                            item.getCreatedAt());
                })
                .toList();
        return new ProductReviewList(summary, new PageResult<>(items, rows.getTotal()));
    }

    /**
     * 买家的这一单评价（未评价过返回 404「尚未评价」——评价入口页的语义是「有没有」而不是空列表）。
     *
     * <p>订单号经 order :: api 补（评价表不存订单号，复制一份就会与订单那边的口径漂）。
     */
    @Transactional(readOnly = true)
    public MyReviewView myOrderReview(UUID orderId, UUID userId) {
        // 1. 订单归属：非本人一律 404，与「评价不在」同一条缺席口径
        OrderReviewSourceView order = Validate.presentOwned(
                orderReadQuery.reviewSourceById(orderId), OrderReviewSourceView::userId, userId, "订单不存在");

        // 2. 评价：未评价过给 404（前端据此显示「去评价」入口）
        Review review = reviewMapper.selectByOrderId(orderId);
        if (review == null) {
            throw BusinessException.notFound("该订单尚未评价");
        }
        return MyReviewViewAssembler.of(
                review, reviewItemMapper.selectByReviewIds(List.of(review.getId())), order.orderNo());
    }

    /**
     * 店铺工作台：本店评价列表（最新在前），可回复一次（REV-10）。
     *
     * <p>出参与商详评价区同形（同一批字段、同一个掩码口径）：卖家看到的与买家看到的是同一份内容，
     * 少一格就会出现「买家看得到、卖家看不到」的字段差异，而那种差异最后都会变成客诉。
     */
    @Transactional(readOnly = true)
    public PageResult<ProductReviewItem> pageShopReviews(UUID shopId, PageParams pageParams) {
        Page<Review> reviews = reviewMapper.selectPageByShop(pageParams, shopId);
        if (reviews.getRecords().isEmpty()) {
            return new PageResult<>(List.of(), 0);
        }
        List<ReviewItem> items = reviewItemMapper.selectByReviewIds(
                reviews.getRecords().stream().map(Review::getId).toList());
        Map<UUID, Review> subjects = new HashMap<>();
        reviews.getRecords().forEach(review -> subjects.put(review.getId(), review));
        Set<UUID> buyers = reviews.getRecords().stream().map(Review::getUserId).collect(Collectors.toSet());
        Map<UUID, String> nicknames = buyers.isEmpty() ? Map.of() : userReadQuery.nicknamesByIds(buyers);

        List<ProductReviewItem> rows = new ArrayList<>();
        for (ReviewItem item : items) {
            Review subject = subjects.get(item.getReviewId());
            if (subject == null) {
                continue;
            }
            rows.add(new ProductReviewItem(
                    item.getId(),
                    item.getReviewId(),
                    item.getName(),
                    item.getImage(),
                    item.getRating(),
                    item.getContent(),
                    item.getImages() == null ? List.of() : item.getImages(),
                    subject.getAppendText(),
                    subject.getAppendedAt(),
                    subject.getReply(),
                    subject.getRepliedAt(),
                    Nickname.mask(nicknames.get(subject.getUserId())),
                    item.getCreatedAt()));
        }
        return new PageResult<>(rows, reviews.getTotal());
    }

    /** 评价主体批量取（列表拼装：一条评价多行） */
    private Map<UUID, Review> subjectsOf(List<ReviewItem> items) {
        List<UUID> ids = items.stream().map(ReviewItem::getReviewId).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Review> byId = new HashMap<>();
        reviewMapper.selectBatchIds(ids).forEach(review -> byId.put(review.getId(), review));
        return byId;
    }

    /** 好评率：百分比保留一位小数；无评价给 0 而不是 null（REV-12） */
    private static BigDecimal percent(long good, long total) {
        if (total == 0) {
            return BigDecimal.ZERO.setScale(1, RoundingMode.HALF_UP);
        }
        return BigDecimal.valueOf(good)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(total), 1, RoundingMode.HALF_UP);
    }

    /** 平均星级：保留一位小数；无评价给 0 */
    private static BigDecimal average(long ratingSum, long total) {
        if (total == 0) {
            return BigDecimal.ZERO.setScale(1, RoundingMode.HALF_UP);
        }
        return BigDecimal.valueOf(ratingSum).divide(BigDecimal.valueOf(total), 1, RoundingMode.HALF_UP);
    }
}

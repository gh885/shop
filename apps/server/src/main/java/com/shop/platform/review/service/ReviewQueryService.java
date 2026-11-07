package com.shop.platform.review.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.infra.web.CursorCodec;
import com.shop.platform.review.dto.ReviewDtos.ReviewPage;
import com.shop.platform.review.dto.ReviewDtos.ReviewView;
import com.shop.platform.review.dto.ReviewDtos.SpuReviewSection;
import com.shop.platform.review.dto.ReviewDtos.SpuReviewSummary;
import com.shop.platform.review.mapper.ReviewMapper;
import com.shop.platform.review.mapper.ReviewMapper.SpuStats;
import com.shop.platform.review.mapper.ReviewRow;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 评价的读路径：买家待评/已评、商详公开区、卖家工作台、平台治理。
 *
 * <p>分页统一是 {@code (时间, id)} 复合游标，多取一条判下一页；四种列表各用自己索引里的时间列
 * （pending 用 created_at，其余用 reviewed_at，平台治理用 created_at）。
 */
@Service
public class ReviewQueryService {

    private final ReviewMapper reviews;

    public ReviewQueryService(ReviewMapper reviews) {
        this.reviews = Objects.requireNonNull(reviews, "reviews");
    }

    /** 买家的待评价列表（事件预生成的 pending 行，带商品快照）。 */
    @Transactional(readOnly = true)
    public ReviewPage pending(UUID buyerId, String cursor, int limit) {
        return page(
                cursor,
                limit,
                fetch -> reviews.pagePendingForBuyer(buyerId, fetch.cursorAt(), fetch.cursorId(), fetch.limit()),
                ReviewRow::createdAt,
                row -> ReviewViews.toView(row, false));
    }

    /** 买家的已评价列表（含被平台隐藏的——自己写的东西自己要看得见）。 */
    @Transactional(readOnly = true)
    public ReviewPage mine(UUID buyerId, String cursor, int limit) {
        return page(
                cursor,
                limit,
                fetch -> reviews.pageMine(buyerId, fetch.cursorAt(), fetch.cursorId(), fetch.limit()),
                ReviewRow::reviewedAt,
                row -> ReviewViews.toView(row, false));
    }

    /** 待评价计数：买家首页卡片。 */
    public long pendingCount(UUID buyerId) {
        return reviews.countPending(buyerId);
    }

    /**
     * 商品详情评价区：统计头 + 列表，一次拿全。只出 published；
     * 公开面昵称一律脱敏，匿名行 displayName 为 null。
     */
    @Transactional(readOnly = true)
    public SpuReviewSection publicSection(UUID spuId, String filter, String cursor, int limit) {
        SpuStats stats = reviews.statsOfSpu(spuId);
        ReviewPage page = page(
                cursor,
                limit,
                fetch -> reviews.pagePublic(spuId, filter, fetch.cursorAt(), fetch.cursorId(), fetch.limit()),
                ReviewRow::reviewedAt,
                row -> ReviewViews.toView(row, true));
        return new SpuReviewSection(toSummary(stats), page.items(), page.nextCursor());
    }

    /** 卖家工作台列表：published + hidden，隐藏行让商家知道为什么少了条评价。 */
    @Transactional(readOnly = true)
    public ReviewPage forShop(
            AccessScope.Seller scope, UUID shopId, Integer star, Boolean replied, String cursor, int limit) {
        if (!scope.shopIds().contains(shopId)) {
            throw BusinessException.notFound("店铺不存在: " + shopId);
        }
        return page(
                cursor,
                limit,
                fetch -> reviews.pageForShop(shopId, star, replied, fetch.cursorAt(), fetch.cursorId(), fetch.limit()),
                ReviewRow::reviewedAt,
                row -> ReviewViews.toView(row, true));
    }

    /** 平台治理列表。 */
    @Transactional(readOnly = true)
    public ReviewPage forAdmin(String status, String cursor, int limit) {
        return page(
                cursor,
                limit,
                fetch -> reviews.pageForAdmin(status, fetch.cursorAt(), fetch.cursorId(), fetch.limit()),
                ReviewRow::createdAt,
                row -> ReviewViews.toView(row, true));
    }

    private record Fetch(Instant cursorAt, UUID cursorId, int limit) {}

    /** 多取一条判下一页；游标取最后一行的时间列。 */
    private static ReviewPage page(
            String cursor,
            int limit,
            Function<Fetch, List<ReviewRow>> fetcher,
            Function<ReviewRow, Instant> cursorTime,
            Function<ReviewRow, ReviewView> toView) {
        CursorCodec.Point point = cursor == null ? null : CursorCodec.decode(cursor);
        Fetch fetch = new Fetch(point == null ? null : point.createdAt(), point == null ? null : point.id(), limit + 1);
        List<ReviewRow> rows = fetcher.apply(fetch);
        String nextCursor = null;
        if (rows.size() > limit) {
            rows = rows.subList(0, limit);
            ReviewRow last = rows.getLast();
            nextCursor = CursorCodec.encode(cursorTime.apply(last), last.id());
        }
        return new ReviewPage(rows.stream().map(toView).toList(), nextCursor);
    }

    private static SpuReviewSummary toSummary(SpuStats stats) {
        return new SpuReviewSummary(
                stats.total(),
                stats.avgScore(),
                stats.goodCount(),
                stats.midCount(),
                stats.badCount(),
                stats.withImageCount());
    }
}

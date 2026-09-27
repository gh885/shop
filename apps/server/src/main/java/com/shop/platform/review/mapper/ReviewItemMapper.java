package com.shop.platform.review.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.PageParams;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

/**
 * 评价行读写。商详评价区与好评率聚合都只碰这张表（聚合是「同商品全部评分行」，与列表分页切片分开，见 REV-14）。
 */
@Mapper
public interface ReviewItemMapper extends BaseMapper<ReviewItem> {

    /**
     * 商品评价区列表：按商品取评价行，最新在前（REV-13 的稳定排序：时间倒序 + id 倒序）。
     * 评价行与主体是一对多，列表按行分页——买家看到的是「逐个商品说的」，不是「一单一评」那个单。
     */
    default Page<ReviewItem> selectPageByProduct(PageParams pageParams, UUID productId) {
        return selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<ReviewItem>()
                        .eq(ReviewItem::getProductId, productId)
                        .orderByDesc(ReviewItem::getCreatedAt)
                        .orderByDesc(ReviewItem::getId));
    }

    /**
     * 好评率聚合：同商品「评分 ≥4 的行数 / 全部行数」与平均星级的分子和，一次 SQL 出三个数
     * （REV-12/14：不受分页影响，且聚合在 SQL 里闭合，不把整表评分行拉回内存再数）。
     * 用字符串列的 {@code QueryWrapper} 是因为这里 select 的不是某一列而是三个聚合表达式。
     */
    default Map<String, Long> countRatingSplit(UUID productId) {
        List<Map<String, Object>> rows = selectMaps(new QueryWrapper<ReviewItem>()
                .select(
                        "count(*) AS total",
                        "count(*) FILTER (WHERE rating >= 4) AS good",
                        "coalesce(sum(rating), 0) AS rating_sum")
                .eq("product_id", productId));
        Map<String, Object> row = rows.isEmpty() ? Map.of() : rows.getFirst();
        return Map.of(
                "total", toLong(row.get("total")),
                "good", toLong(row.get("good")),
                "ratingSum", toLong(row.get("rating_sum")));
    }

    /** 聚合计数读回：PG 的 count/sum 返回 bigint，缺列（空表时的默认值）按 0 算 */
    private static long toLong(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }

    /** 按评价 id 批量取评分行（列表拼装一条评价的多行；保持 created_at + id 的稳定顺序） */
    default List<ReviewItem> selectByReviewIds(Collection<UUID> reviewIds) {
        if (reviewIds == null || reviewIds.isEmpty()) {
            return List.of();
        }
        return selectList(new LambdaQueryWrapper<ReviewItem>()
                .in(ReviewItem::getReviewId, reviewIds)
                .orderByAsc(ReviewItem::getCreatedAt)
                .orderByAsc(ReviewItem::getId));
    }

    /** 该订单的行是否都已被评价（并发下抢在提交前先被另一笔评价吃掉，submit 用它兜最后一道） */
    default long countByOrderItems(Collection<UUID> orderItemIds) {
        if (orderItemIds == null || orderItemIds.isEmpty()) {
            return 0L;
        }
        return selectCount(new LambdaQueryWrapper<ReviewItem>().in(ReviewItem::getOrderItemId, orderItemIds));
    }
}

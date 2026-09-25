package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.PageParams;
import com.shop.platform.shop.model.ShopReviewStatus;
import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShopReviewMapper extends BaseMapper<ShopReview> {

    /**
     * 审核队列的排序键（ACC-08「PENDING 优先、新店在前」）。
     *
     * <p>待审这一档在 status 列上排不出来：列里存的是枚举名字符串，字母序是 {@code APPROVED < PENDING <
     * REJECTED}，照列升序会把「已通过的历史」顶在队首、真正等人处理的沉到尾部。所以这一档必须显式给：待审记 0、
     * 已处置记 1，再按入队时间倒序。用 {@link QueryWrapper}（字符串列）而不是 lambda 列，就是因为这里排的不是列而是一句档位表达式。
     */
    String QUEUE_ORDER_BY = "CASE WHEN status = '" + ShopReviewStatus.PENDING.name() + "' THEN 0 ELSE 1 END";

    /** 审核队列分页：status 传 null = 全部档（待审优先），否则只给那一档；两档内部都是新入队在前 */
    default Page<ShopReview> selectQueuePage(PageParams pageParams, ShopReviewStatus filter) {
        return selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new QueryWrapper<ShopReview>()
                        .eq(filter != null, "status", filter == null ? null : filter.name())
                        .orderByAsc(QUEUE_ORDER_BY)
                        .orderByDesc("created_at"));
    }

    /**
     * 每店最近一次驳回的理由（shopId → reason）。
     *
     * <p>一店多条 review 是常态（每次提交入队一条），所以「驳回理由」= 该店 REJECTED 行里时间最新的那条；
     * 只查传进来的 shopId（调用方按当前状态筛过），避免把历史驳回挂在已通过的店上。
     * reason 可空（审核员没写就不下发，前端不显示空标题）。
     */
    default Map<UUID, String> latestRejectReasons(Collection<UUID> shopIds) {
        if (shopIds.isEmpty()) return Map.of();
        return selectList(new LambdaQueryWrapper<ShopReview>()
                        .in(ShopReview::getShopId, shopIds)
                        .eq(ShopReview::getStatus, ShopReviewStatus.REJECTED)
                        .isNotNull(ShopReview::getReason)
                        .orderByDesc(ShopReview::getDecidedAt))
                .stream()
                .collect(Collectors.toMap(ShopReview::getShopId, ShopReview::getReason, (latest, older) -> latest));
    }
}

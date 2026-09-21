package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.shop.model.ShopReviewStatus;
import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShopReviewMapper extends BaseMapper<ShopReview> {

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

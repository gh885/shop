package com.shop.platform.coupon.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.coupon.mapper.UserCoupon;
import com.shop.platform.coupon.mapper.UserCouponMapper;
import com.shop.platform.coupon.model.UserCouponStatus;
import com.shop.platform.shop.api.ShopReadQuery;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 买家券包：看自己有哪些券、什么状态、哪家店的。
 *
 * <p>店名经 shop :: api 批量点查后内存拼装（跨 schema 不 JOIN）——与订单列表拼店名同一套做法。
 */
@Service
@RequiredArgsConstructor
public class CouponWalletService {

    private final UserCouponMapper userCouponMapper;

    private final ShopReadQuery shopReadQuery;

    /** 我的券包分页：status 对应页签，空 = 全部。展示状态见 {@link MyCoupon} */
    @Transactional(readOnly = true)
    public PageResult<MyCoupon> pageMine(UUID userId, String status, PageParams page) {
        OffsetDateTime now = OffsetDateTime.now();
        Page<UserCoupon> rows =
                userCouponMapper.selectPageMine(new Page<>(page.page(), page.size()), userId, parseStatus(status), now);
        List<UserCoupon> records = rows.getRecords();
        if (records.isEmpty()) {
            return new PageResult<>(List.of(), rows.getTotal());
        }
        Map<UUID, String> shopNames = shopReadQuery.namesByIds(
                records.stream().map(UserCoupon::getShopId).distinct().toList());
        return new PageResult<>(
                records.stream()
                        .map(coupon -> MyCoupon.of(coupon, shopNames.get(coupon.getShopId()), now))
                        .toList(),
                rows.getTotal());
    }

    /** 筛选值解析：空 = 全部；非法值给 400（枚举自己就是合法值表，不另维护一份） */
    private static UserCouponStatus parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return UserCouponStatus.valueOf(status);
        } catch (IllegalArgumentException e) {
            throw BusinessException.badRequest("非法的券状态筛选值");
        }
    }
}

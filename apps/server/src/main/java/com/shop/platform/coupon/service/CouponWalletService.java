package com.shop.platform.coupon.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
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

    /**
     * 我的券包分页：status 对应页签，空 = 全部。展示状态见 {@link MyCoupon}
     *
     * <p>HTTP 侧非法值到不了这里的 {@code Validate.enumFilter}——{@code MyCouponQuery.status} 的 @Pattern
     * 先按 GEN-19 第①条线拦成 422；这条判据守的是直接调 service 的调用方（与订单/售后筛的 400 不同线）。
     */
    @Transactional(readOnly = true)
    public PageResult<MyCoupon> pageMine(UUID userId, String status, PageParams page) {
        OffsetDateTime now = OffsetDateTime.now();
        UserCouponStatus tab = Validate.enumFilter(UserCouponStatus.class, status, "非法的券状态筛选值");
        // 页签怎么筛（CPN-51 的展示口径）写在 mapper 的 selectPageMine 上，这里不重述判据
        Page<UserCoupon> rows = userCouponMapper.selectPageMine(page, userId, tab, now);
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
}

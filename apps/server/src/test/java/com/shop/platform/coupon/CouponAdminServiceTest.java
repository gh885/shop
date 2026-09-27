package com.shop.platform.coupon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.api.StaffReadQuery;
import com.shop.platform.audit.api.RecordAuditCommand;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageParams;
import com.shop.platform.coupon.api.CouponBearer;
import com.shop.platform.coupon.dto.AdminCouponQuery;
import com.shop.platform.coupon.mapper.UserCoupon;
import com.shop.platform.coupon.mapper.UserCouponMapper;
import com.shop.platform.coupon.model.CouponSource;
import com.shop.platform.coupon.model.CouponType;
import com.shop.platform.coupon.model.UserCouponStatus;
import com.shop.platform.coupon.service.CouponAdminService;
import com.shop.platform.shop.api.ShopReadQuery;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CouponAdminServiceTest {

    @Mock
    UserCouponMapper userCouponMapper;

    @Mock
    ShopReadQuery shopReadQuery;

    @Mock
    RecordAuditCommand recordAuditCommand;

    @Mock
    StaffReadQuery staffReadQuery;

    @Test
    void 运营列表_按用户店铺状态筛选并拼店名() {
        UUID userId = UUID.randomUUID();
        UUID shopId = UUID.randomUUID();
        UUID couponId = UUID.randomUUID();
        UserCoupon coupon = new UserCoupon();
        coupon.setId(couponId);
        coupon.setUserId(userId);
        coupon.setShopId(shopId);
        coupon.setTemplateId(UUID.randomUUID());
        coupon.setName("新客券");
        coupon.setThresholdAmount(0L);
        coupon.setDiscountAmount(500L);
        coupon.setCurrency("CNY");
        coupon.setBearer(CouponBearer.SELLER);
        coupon.setStatus(UserCouponStatus.UNUSED);
        coupon.setSource(CouponSource.CLAIM);
        coupon.setType(CouponType.FULL_REDUCTION);
        coupon.setEffectiveAt(OffsetDateTime.parse("2026-01-01T00:00:00Z"));
        coupon.setExpireAt(OffsetDateTime.parse("2026-02-01T00:00:00Z"));
        coupon.setCreatedAt(OffsetDateTime.parse("2026-01-01T00:00:00Z"));
        Page<UserCoupon> page = new Page<>(1, 20);
        page.setRecords(List.of(coupon));
        page.setTotal(1);
        when(userCouponMapper.selectPageForAdmin(new PageParams(1, 20), userId, shopId, UserCouponStatus.UNUSED))
                .thenReturn(page);
        when(shopReadQuery.namesByIds(List.of(shopId))).thenReturn(Map.of(shopId, "演示店"));

        var result = new CouponAdminService(userCouponMapper, shopReadQuery, recordAuditCommand, staffReadQuery)
                .pageCoupons(new PageParams(1, 20), new AdminCouponQuery(userId, shopId, "UNUSED"));

        assertEquals(1, result.total());
        assertEquals(couponId, result.records().getFirst().id());
        assertEquals("演示店", result.records().getFirst().shopName());
        assertEquals(UserCouponStatus.UNUSED, result.records().getFirst().status());
    }

    @Test
    void 非法状态_不查库() {
        var ex = assertThrows(BusinessException.class, () -> new CouponAdminService(
                        userCouponMapper, shopReadQuery, recordAuditCommand, staffReadQuery)
                .pageCoupons(new PageParams(1, 20), new AdminCouponQuery(null, null, "BOGUS")));
        assertEquals(400, ex.getHttpStatus());
        verifyNoInteractions(userCouponMapper, shopReadQuery);
    }
}

package com.shop.platform.coupon.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.model.CouponTemplateStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface CouponTemplateMapper extends BaseMapper<CouponTemplate> {

    /** 取本店模板：卖家侧一切读写动作的同一道门。越店与不存在不区分（同为 404），不泄露券的存在性 */
    default CouponTemplate requireShopOwned(UUID shopId, UUID id) {
        return Validate.requireOwned(selectById(id), CouponTemplate::getShopId, shopId, "优惠券不存在");
    }

    /** 本店券管理列表：按创建时间倒序（与订单/售后工作台同口径） */
    default Page<CouponTemplate> selectPageByShop(PageParams pageParams, UUID shopId) {
        return selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<CouponTemplate>()
                        .eq(CouponTemplate::getShopId, shopId)
                        .orderByDesc(CouponTemplate::getCreatedAt));
    }

    /**
     * 本店可领的券（店铺领券页）：ACTIVE 且未过发放期。
     * 刻意不按 issued_quantity 过滤 —— 领完的券仍要露出来（置灰显示「已领完」），而不是从列表里消失让用户以为没办活动。
     * 也刻意不滤掉「未到发放起点」的券（C9）—— 预告券是营销资产：让用户看到「x 点开抢」才有蹲点领取，
     * 消失反而像没办活动。能不能领由 claimable 回传（起点/名额都闸在它上面），领券端点仍拒未开始。
     */
    default List<CouponTemplate> selectClaimable(UUID shopId, OffsetDateTime now) {
        return selectList(new LambdaQueryWrapper<CouponTemplate>()
                .eq(CouponTemplate::getShopId, shopId)
                .eq(CouponTemplate::getStatus, CouponTemplateStatus.ACTIVE)
                .gt(CouponTemplate::getValidTo, now)
                .orderByDesc(CouponTemplate::getCreatedAt));
    }

    /**
     * 发放名额的条件扣减：ACTIVE + 未发满 + 在有效期内才 +1，返回影响行数（0 = 名额没了/已停用/已过期）。
     *
     * <p>超发由这一条语句闸住（WHERE 在行锁下原子求值），不靠「先查 issued 再写」——那是读-改-写，
     * 并发下必然超发。与 inventory 的条件冻结同一个套路。
     */
    @Update(
            """
            UPDATE coupon.coupon_templates
            SET issued_quantity = issued_quantity + 1, updated_at = #{now}
            WHERE id = #{templateId}
              AND status = 'ACTIVE'
              AND issued_quantity < total_quantity
              AND #{now} >= valid_from AND #{now} < valid_to
            """)
    int issueOne(@Param("templateId") UUID templateId, @Param("now") OffsetDateTime now);
}

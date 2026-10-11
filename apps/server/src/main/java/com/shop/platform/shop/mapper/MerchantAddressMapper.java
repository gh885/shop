package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MerchantAddressMapper extends BaseMapper<MerchantAddress> {

    /**
     * 本店<b>未删</b>地址条数（每店条数上限闸门，ACC-70「软删不占名额」）。
     *
     * <p>不需要显式写 deleted_at 条件：MerchantAddress 的 deletedAt 贴了 {@code @TableLogic}，selectCount 会自动带上
     * 「未删」那半句，与 {@link #selectByShop} 同一套过滤——计数与列表看到的永远是同一批行。
     * 反过来，停用（DISABLED）的地址照旧计数：本条不碰 status，它还在卖家手上，改回可用不需要重新占名额。
     */
    default long countByShop(UUID shopId) {
        return selectCount(new LambdaQueryWrapper<MerchantAddress>().eq(MerchantAddress::getShopId, shopId));
    }

    /** 店铺地址列表：默认发货/默认退货置顶，其余按更新时间倒序 */
    default List<MerchantAddress> selectByShop(UUID shopId) {
        return selectList(new LambdaQueryWrapper<MerchantAddress>()
                .eq(MerchantAddress::getShopId, shopId)
                .orderByDesc(MerchantAddress::getDefaultShip)
                .orderByDesc(MerchantAddress::getDefaultReturn)
                .orderByDesc(MerchantAddress::getUpdatedAt));
    }

    /** 清零本店所有地址的默认发货标记（新设默认前调用），部分唯一索引兜底并发 */
    default int clearDefaultShip(UUID shopId) {
        return update(
                null,
                new LambdaUpdateWrapper<MerchantAddress>()
                        .eq(MerchantAddress::getShopId, shopId)
                        .eq(MerchantAddress::getDefaultShip, true)
                        .set(MerchantAddress::getDefaultShip, false));
    }

    /** 清零本店所有地址的默认退货标记（新设默认前调用） */
    default int clearDefaultReturn(UUID shopId) {
        return update(
                null,
                new LambdaUpdateWrapper<MerchantAddress>()
                        .eq(MerchantAddress::getShopId, shopId)
                        .eq(MerchantAddress::getDefaultReturn, true)
                        .set(MerchantAddress::getDefaultReturn, false));
    }

    /**
     * 给本店某条地址置默认标记（PATCH 语义：传 null 的标记不动），回影响行数；置真前调用方先清同类默认。
     *
     * <p>两个标记列标了 NEVER，实体路径写不进去：编辑地址的 {@code updateById} 只管地址本体，默认标记只走这里
     * 与 {@link #clearDefaultShip} / {@link #clearDefaultReturn}。{@code WHERE shop_id} 是归属闸门，0 行 = 不是本店的行。
     * 「每店至多一个」仍由部分唯一索引兜底：并发置真撞索引由调用方折成 409。
     */
    default int setDefaultFlags(UUID shopId, UUID id, Boolean defaultShip, Boolean defaultReturn, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<MerchantAddress>()
                        .eq(MerchantAddress::getId, id)
                        .eq(MerchantAddress::getShopId, shopId)
                        .set(defaultShip != null, MerchantAddress::getDefaultShip, defaultShip)
                        .set(defaultReturn != null, MerchantAddress::getDefaultReturn, defaultReturn)
                        .set(MerchantAddress::getUpdatedAt, now));
    }
}

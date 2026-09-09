package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MerchantAddressMapper extends BaseMapper<MerchantAddress> {

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
}

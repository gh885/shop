package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.shop.model.ShopStatus;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShopMapper extends BaseMapper<Shop> {

    /** 店名是否已被占用（全表口径，不看状态——被拒/被封的店名仍占位；并发由 uk_shops_name 兜底） */
    default boolean existsByName(String name) {
        return selectCount(new LambdaQueryWrapper<Shop>().eq(Shop::getName, name)) > 0;
    }

    /** 店名是否被<b>别家</b>店占用（重新提交时卖家可以改名，本店自己那一行不算冲突） */
    default boolean existsOtherNamed(UUID shopId, String name) {
        return selectCount(
                        new LambdaQueryWrapper<Shop>().eq(Shop::getName, name).ne(Shop::getId, shopId))
                > 0;
    }

    /**
     * 被驳回店铺的重新提交：改名 / 改 logo 并把状态推回待审。{@code WHERE status = REJECTED} 是并发闸门——
     * 与并发的第二次重提或审核处置相撞时后到者影响 0 行，决不会把已 ACTIVE 的店拖回待审。
     */
    default int resubmit(UUID shopId, String name, String logoKey) {
        return update(
                null,
                new LambdaUpdateWrapper<Shop>()
                        .eq(Shop::getId, shopId)
                        .eq(Shop::getStatus, ShopStatus.REJECTED)
                        .set(Shop::getName, name)
                        .set(Shop::getLogoKey, logoKey)
                        .set(Shop::getStatus, ShopStatus.PENDING_REVIEW));
    }

    /**
     * 店主注销 → 本店停止营业：只推 ACTIVE 行（待审核/已驳回/已停的店本就不营业，不重复推进）。
     *
     * <p>{@code WHERE status = ACTIVE} 同时是并发闸门：与并发的审核处置/封禁相撞时后到者 0 行，
     * 由调用方据返回值决定是否播报停营业事件——事件不许为一家没被自己改变的店发。
     */
    default int suspend(UUID shopId) {
        return update(
                null,
                new LambdaUpdateWrapper<Shop>()
                        .eq(Shop::getId, shopId)
                        .eq(Shop::getStatus, ShopStatus.ACTIVE)
                        .set(Shop::getStatus, ShopStatus.DISABLED));
    }
}

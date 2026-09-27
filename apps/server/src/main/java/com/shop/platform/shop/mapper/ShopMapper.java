package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.PageParams;
import com.shop.platform.shop.model.ShopStatus;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShopMapper extends BaseMapper<Shop> {

    /**
     * 「我的店铺列表」那条口径：按 ID 批量取，<b>新店在前</b>（创建时间倒序）。
     *
     * <p>空集合在语句内短路：MyBatis-Plus 会把空 {@code in} 拼成 {@code IN ()}，那是 PG 的语法错误而不是
     * 「一家都没有」，而零成员的调用方本来就该拿到空列表。
     */
    default List<Shop> selectByIdsNewestFirst(Collection<UUID> shopIds) {
        if (shopIds.isEmpty()) {
            return List.of();
        }
        return selectList(
                new LambdaQueryWrapper<Shop>().in(Shop::getId, shopIds).orderByDesc(Shop::getCreatedAt));
    }

    /**
     * 按 ID 批量取店铺，<b>不承诺顺序</b>（调用方拿回去按 id 建索引拼名字，如「我的待确认邀请」拼店名）。
     *
     * <p>不叫 {@code selectByIds}：{@code BaseMapper} 已有一条擦除相同的 {@code selectByIds(Collection)}，
     * 同名只会撞编译期 name clash，而那条内置不短空空集合（同 {@link #selectByIdsNewestFirst} 的理由）。
     */
    default List<Shop> selectByIdsUnordered(Collection<UUID> shopIds) {
        if (shopIds.isEmpty()) {
            return List.of();
        }
        return selectList(new LambdaQueryWrapper<Shop>().in(Shop::getId, shopIds));
    }

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
     * 这一档店铺算不算「可用」（卖家过滤链的口径）：{@code PENDING_REVIEW} 与 {@code ACTIVE} 两档给 true，
     * 其余档位（{@code REJECTED} / {@code DISABLED}）与查无此店给同一个 false——不区分，是为了不让答案
     * 替调用方确认「这家店存在，只是不可用」。
     *
     * <p>待审核也在档内是有意的：卖家配店（成员 / 地址 / 运费模板）不该等审核结果，而能不能营业上架是
     * {@link Shop#isActive()} 那道闸的事，不在这里判。挡不挡、给什么状态码由调用方裁决。
     */
    default boolean existsUsable(UUID shopId) {
        return selectCount(new LambdaQueryWrapper<Shop>()
                        .eq(Shop::getId, shopId)
                        .in(Shop::getStatus, List.of(ShopStatus.PENDING_REVIEW, ShopStatus.ACTIVE)))
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

    /**
     * 平台解封：DISABLED → ACTIVE。{@code WHERE status = DISABLED} 是并发闸门，
     * 已 ACTIVE/待审/被拒的店影响 0 行，调用方据此报 409（不静默「成功」）。
     *
     * <p>只解 DISABLED 一档：审核驳回（REJECTED）不是封禁，解封它等于替审核员翻案。
     */
    default int resume(UUID shopId) {
        return update(
                null,
                new LambdaUpdateWrapper<Shop>()
                        .eq(Shop::getId, shopId)
                        .eq(Shop::getStatus, ShopStatus.DISABLED)
                        .set(Shop::getStatus, ShopStatus.ACTIVE));
    }

    /**
     * 审核结论落到店铺：待审 → ACTIVE（通过）/ REJECTED（驳回）。
     *
     * <p>{@code WHERE status = PENDING_REVIEW} 是并发闸门：审核记录那一侧的闸门已经保证一条待审只有一个
     * 处置能赢，这里再收一道是挡「店在这一刻被店主注销/被平台封禁」——0 行即店铺不是待审那一档，
     * 由调用方整体回滚（宁可让审核员刷新重试，也绝不出现「审核记录已通过、店铺永远卡在别的档位」的静默分叉，
     * 也绝不把一家已停止营业的店悄悄拖回 ACTIVE）。
     *
     * <p>目标态由 service 给，起点守卫不下沉成参数：待审是唯一合法起点，写成参数等于把这条裁决交给调用方。
     */
    default int applyReviewVerdict(UUID shopId, ShopStatus target) {
        return update(
                null,
                new LambdaUpdateWrapper<Shop>()
                        .eq(Shop::getId, shopId)
                        .eq(Shop::getStatus, ShopStatus.PENDING_REVIEW)
                        .set(Shop::getStatus, target));
    }

    /**
     * 管理端店铺列表分页：status 传 null = 全部，否则只给那一档；关键字命中店名或店主 ID。
     * 排序固定「最新在前」（治理动作看的是最近变动的那批），排序口径收在这里。
     */
    default Page<Shop> selectPageAdmin(PageParams pageParams, ShopStatus filter, String keyword) {
        return selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<Shop>()
                        .eq(filter != null, Shop::getStatus, filter == null ? null : filter.name())
                        .and(
                                keyword != null && !keyword.isBlank(),
                                w -> w.like(Shop::getName, keyword).or().eq(Shop::getOwnerId, parseOwnerId(keyword)))
                        .orderByDesc(Shop::getCreatedAt));
    }

    /** 关键字可能是店主 UUID（管理员常按 ID 找店），非 UUID 一律当 null（不报错，交给 like 那一支） */
    private static UUID parseOwnerId(String keyword) {
        try {
            return UUID.fromString(keyword);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}

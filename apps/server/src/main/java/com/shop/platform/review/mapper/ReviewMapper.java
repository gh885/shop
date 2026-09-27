package com.shop.platform.review.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.PageParams;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

/**
 * 评价主体读写。append-only 的「append」只指追评与回复两个可空列，正文与评分永不改写（REV-01）。
 *
 * <p>每次写入的 {@code WHERE} 守卫都写死在方法里：条件更新回影响行数，由 service 判 409——
 * 「已追评/已回复」的判定如果交给调用方传参，就等于把这道闸的裁决权交出去了（两次并发提交各写一条）。
 */
@Mapper
public interface ReviewMapper extends BaseMapper<Review> {

    /** 追评：{@code WHERE appended_at IS NULL} 是并发闸门，抢不到返回 0（已追评） */
    default int append(UUID reviewId, String text, OffsetDateTime at) {
        return update(
                null,
                new LambdaUpdateWrapper<Review>()
                        .eq(Review::getId, reviewId)
                        .isNull(Review::getAppendedAt)
                        .set(Review::getAppendText, text)
                        .set(Review::getAppendedAt, at));
    }

    /** 卖家回复：{@code WHERE replied_at IS NULL} 是并发闸门（只允许回复一次，REV-10） */
    default int reply(UUID reviewId, UUID replyBy, String text, OffsetDateTime at) {
        return update(
                null,
                new LambdaUpdateWrapper<Review>()
                        .eq(Review::getId, reviewId)
                        .isNull(Review::getRepliedAt)
                        .set(Review::getReply, text)
                        .set(Review::getReplyBy, replyBy)
                        .set(Review::getRepliedAt, at));
    }

    /** 店铺工作台：本店评价按评价时间倒序分页 */
    default Page<Review> selectPageByShop(PageParams pageParams, UUID shopId) {
        return selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<Review>().eq(Review::getShopId, shopId).orderByDesc(Review::getCreatedAt));
    }

    /** 按订单取评价（一单一评，取不到 = 还没评过） */
    default Review selectByOrderId(UUID orderId) {
        return selectOne(new LambdaQueryWrapper<Review>().eq(Review::getOrderId, orderId));
    }
}

package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.AuditedEntity;
import com.shop.platform.shop.model.ShopReviewStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 店铺入驻审核 —— 平台员工对 shop.shops 的审批记录，与店铺同属 shop 模块：开店时同事务入队一条 PENDING，
 * 审批（通过/拒绝）同事务把 shop.shops.status 推进到 ACTIVE / REJECTED，一个状态机不再横跨两个 schema。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("shop.shop_reviews")
public class ShopReview extends AuditedEntity {

    /** 被审核店铺 ID（shop.shops.id，跨 schema 只读引用；展示店名时按 ID 查 shop 模块） */
    private UUID shopId;

    /** 审批员工 ID（account.staff.id），PENDING 时为 NULL，审批时写入 */
    private UUID staffId;

    /** 审核状态：PENDING 待审 / APPROVED 通过 / REJECTED 拒绝。PENDING 行即「待审核队列」。概念归 {@link ShopReviewStatus} */
    private ShopReviewStatus status;

    /** 审批理由/备注（拒绝时一般必填），可空 */
    private String reason;

    /** 审批时间，PENDING 时为 NULL，审批时写入 */
    private OffsetDateTime decidedAt;
}

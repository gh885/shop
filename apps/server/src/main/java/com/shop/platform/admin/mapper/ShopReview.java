package com.shop.platform.admin.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 店铺入驻审核 —— 平台员工对 shop.shops 的审批记录（admin 侧的事实）。
 *
 * <p>审核状态存这里，店铺状态存 shop.shops.status，两模块各记各的事实，靠事件驱动对齐（shop 发 ShopCreatedEvent 入队，admin 审批后发
 * ShopReviewDecidedEvent，shop 监听改状态），员工不直接写 shop 模块的表。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("admin.shop_reviews")
public class ShopReview {

    /** 审核状态，见 status 字段 javadoc：PENDING 待审 / APPROVED 通过 / REJECTED 拒绝 */
    public static final String STATUS_PENDING = "PENDING";

    public static final String STATUS_APPROVED = "APPROVED";

    public static final String STATUS_REJECTED = "REJECTED";

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 被审核店铺 ID（shop.shops.id，跨 schema 只读引用；展示店名时按 ID 查 shop 模块） */
    private UUID shopId;

    /** 审批员工 ID（admin.staff.id），PENDING 时为 NULL，审批时写入 */
    private UUID staffId;

    /** 审核状态：PENDING 待审 / APPROVED 通过 / REJECTED 拒绝。PENDING 行即「待审核队列」 */
    private String status;

    /** 审批理由/备注（拒绝时一般必填），可空 */
    private String reason;

    /** 审批时间，PENDING 时为 NULL，审批时写入 */
    private OffsetDateTime decidedAt;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}

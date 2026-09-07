package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.AfterSaleType;
import com.shop.platform.order.model.OrderStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 订单主表 —— 一次结算按店铺拆出的单笔订单，存"谁买了哪家的货、什么状态、该付多少"。
 *
 * <p>收货地址与金额都是下单瞬间的快照。状态规则（转移表、可执行动作）属领域知识，收在 {@link OrderStatus}
 * / {@link AfterSaleStatus}（本模块 model 包），实体只持枚举字段并薄委托，不重复定义转移表。
 * DB 列存枚举 {@code name()}（varchar 列 + MyBatis 默认 EnumTypeHandler），各状态时刻用独立时间戳列留痕；
 * 多动作的历史回放靠 {@link OrderStatusLog} 审计流水，不靠这些列。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("orders.orders")
public class Order {

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 业务单号（对外展示/客服对账），全局唯一；UUID 是库内身份，orderNo 是人对外报的 */
    private String orderNo;

    /** 买家 ID，auth.users.id，跨 schema 裸引用不加 FK */
    private UUID userId;

    /** 卖家店铺 ID，shop.shops.id，裸引用不加 FK；一次结算按它拆成 N 单 */
    private UUID shopId;

    /** 履约主状态机：待付款 → 待发货 → 已发货 → 已完成；待付款/待发货可取消（规则见 OrderStatus） */
    private OrderStatus status;

    /** 售后状态机（独立线，不挤占 status）：NONE → APPLYING →（REFUNDED / REJECTED / CLOSED），默认 NONE */
    private AfterSaleStatus afterSaleStatus;

    /** 售后类型（无售后时为 NULL） */
    private AfterSaleType afterSaleType;

    /** 售后退款金额口径（分）；资金态在 payment.payments，订单只记「该退多少」 */
    private Long refundAmount;

    /** 商品总额（Σ 行小计），分。DB CHECK 钉死 pay_amount = item_amount + shipping_fee */
    private Long itemAmount;

    /** 运费，分（V1 未接计费恒 0） */
    private Long shippingFee;

    /** 应付总额，分 */
    private Long payAmount;

    /** 币种（如 CNY），与各金额字段组成代码里的 Money 类型 */
    private String currency;

    // ---- 收货快照：镜像 user_profile.addresses，下单定格，永不更新 ----

    private String receiverName;

    private String receiverPhone;

    private String receiverProvince;

    private String receiverCity;

    private String receiverDistrict;

    private String receiverDetail;

    // ---- 发货快照：镜像 merchant_address.addresses（商家发货地址）+ 面单寄件人，发货时刻定格，永不更新 ----

    private String shipperContactName;

    private String shipperPhone;

    private String shipperProvince;

    private String shipperCity;

    private String shipperDistrict;

    private String shipperDetail;

    /** 面单寄件人名称（履约主体，镜像商家地址的 company_name，公司名称） */
    private String shipperCompanyName;

    /** 买家留言，可空 */
    private String buyerMessage;

    // ---- 物流（发货时回填；一单一包裹，多包裹时再拆 shipments 表） ----

    private String logisticsCompany;

    private String trackingNo;

    // ---- 状态时间戳：单路径流转，列比流水表够用 ----

    private OffsetDateTime paidAt;

    private OffsetDateTime shippedAt;

    private OffsetDateTime completedAt;

    private OffsetDateTime cancelledAt;

    /** 取消原因：买家填写或系统自动取消的固定文案 */
    private String cancelReason;

    /** 售后退款完成时刻 */
    private OffsetDateTime afterSaleRefundedAt;

    // ---- 到期时刻：各由对应动作回填，定时任务按部分索引扫到期（窗口长度见 OrderTimeouts） ----

    /** 待付款截止（下单时回填），到期自动关单 */
    private OffsetDateTime payExpireAt;

    /** 待发货截止（付款时回填），到期自动取消并退款 */
    private OffsetDateTime shipExpireAt;

    /** 确认收货截止（发货时回填），到期自动确认收货 */
    private OffsetDateTime receiveExpireAt;

    /** 售后申请截止（收货时回填），过期不再受理售后申请 */
    private OffsetDateTime applyExpireAt;

    /** 退货物流公司（买家回寄退货时填写，仅退货退款路径） */
    private String returnLogisticsCompany;

    /** 退货运单号（买家回寄退货时填写，仅退货退款路径） */
    private String returnTrackingNo;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;

    // ---- 派生视图：金额列 + 币种列配对成 Money，只读转换不落库（非表字段） ----

    public Money itemAmountAsMoney() {
        return Money.ofFen(itemAmount, currency);
    }

    public Money shippingFeeAsMoney() {
        return Money.ofFen(shippingFee, currency);
    }

    public Money payAmountAsMoney() {
        return Money.ofFen(payAmount, currency);
    }

    /** 售后退款额；未同意退款前为 null（列可空） */
    public Money refundAmountAsMoney() {
        return refundAmount == null ? null : Money.ofFen(refundAmount, currency);
    }

    /** 买家视角当前可执行的动作：规则在 {@link OrderStatus}，实体只薄委托 */
    public List<String> buyerActions() {
        return List.copyOf(status.buyerActions());
    }

    /** 卖家视角当前可执行的动作：同上，薄委托 */
    public List<String> sellerActions() {
        return List.copyOf(status.sellerActions());
    }
}

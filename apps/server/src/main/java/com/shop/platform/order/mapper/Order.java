package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import com.shop.platform.infra.db.AuditedEntity;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.OrderStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 订单主表 —— 一次结算按店铺拆出的单笔订单，存"谁买了哪家的货、什么状态、该付多少"。
 *
 * <p>收货地址与金额都是下单瞬间的快照。状态规则（转移表、可执行动作）属领域知识，收在 {@link OrderStatus}
 * / {@link AfterSaleStatus}（本模块 model 包），实体只持枚举字段并薄委托，不重复定义转移表。
 * DB 列存枚举 {@code name()}（varchar 列 + MyBatis 默认 EnumTypeHandler），各状态时刻用独立时间戳列留痕；
 * 多动作的历史回放靠 {@link OrderStatusLog} 审计流水，不靠这些列。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("orders.orders")
public class Order extends AuditedEntity {

    /** 业务单号（对外展示/客服对账），全局唯一；UUID 是库内身份，orderNo 是人对外报的 */
    private String orderNo;

    /** 买家 ID，account.users.id，跨 schema 裸引用不加 FK */
    private UUID userId;

    /** 卖家店铺 ID，shop.shops.id，裸引用不加 FK；一次结算按它拆成 N 单 */
    private UUID shopId;

    /** 结算幂等键（前端生成）：同一 (user_id, checkout_key, shop_id) 唯一，重复提交撞键回读原单；历史单与 dev 种子为 null */
    private UUID checkoutKey;

    /** 履约主状态机：待付款 → 待发货 → 已发货 → 已完成；待付款/待发货可取消（规则见 OrderStatus） */
    private OrderStatus status;

    /** 售后投影（aftersale 每次转移经 order :: api 写回）：最近一张售后单的状态，NONE = 从未售后；单据真相在 aftersale.tickets */
    private AfterSaleStatus afterSaleStatus;

    /** 售后退款金额口径（分，aftersale 退款完成时写回）；资金态在 payment.payments，订单只记「该退多少」 */
    private Long refundAmount;

    /** 商品总额（Σ 行小计），分。DB CHECK 钉死 pay_amount = item_amount + shipping_fee */
    private Long itemAmount;

    /** 运费（分）：下单时按收货地区与同店合计件数经 shop :: api 报价定格，未配运费模板的店铺恒 0 */
    private Long shippingFee;

    /** 计费所用运费模板（shop.shipping_templates.id）；未配模板为 null，语义 = 没走计费（恒包邮） */
    private UUID shippingTemplateId;

    /** 应付总额，分 */
    private Long payAmount;

    /** 币种（如 CNY），与各金额字段组成代码里的 Money 类型 */
    private String currency;

    // ---- 收货快照：镜像 account.addresses，下单定格，永不更新 ----

    private String receiverName;

    private String receiverPhone;

    /** 收货区划码（国标 6 位）：运费按地区计价的键与凭据，名字只够展示（见 V54） */
    private String receiverRegionCode;

    private String receiverProvince;

    private String receiverCity;

    private String receiverDistrict;

    private String receiverDetail;

    /** 买家留言，可空 */
    private String buyerMessage;

    // ---- 物流（发货时回填；一单一包裹，多包裹时再拆 shipments 表） ----

    private String logisticsCompany;

    private String trackingNo;

    // ---- 状态时间戳：单路径流转，列比流水表够用 ----

    private OffsetDateTime paidAt;

    private OffsetDateTime shippedAt;

    /** 签收时刻（物流模块推进到已签收时经 order :: api 写回）；确认收货窗口从它起算，未签收则按发货兜底 */
    private OffsetDateTime deliveredAt;

    private OffsetDateTime completedAt;

    private OffsetDateTime cancelledAt;

    /** 取消原因：买家填写或系统自动取消的固定文案 */
    private String cancelReason;

    // ---- 到期时刻：各由对应动作回填，定时任务按部分索引扫到期（窗口长度见 OrderTimeouts） ----

    /** 待付款截止（下单时回填），到期自动关单 */
    private OffsetDateTime payExpireAt;

    /** 待发货截止（付款时回填），到期自动取消并退款 */
    private OffsetDateTime shipExpireAt;

    /** 确认收货截止（发货时回填），到期自动确认收货 */
    private OffsetDateTime receiveExpireAt;

    /** 售后申请截止（收货时回填），过期不再受理售后申请（aftersale 经 order :: api 读此窗口） */
    private OffsetDateTime applyExpireAt;

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
        return Money.ofFenOrNull(refundAmount, currency);
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

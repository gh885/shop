package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 订单主表 —— 一次结算按店铺拆出的单笔订单，存"谁买了哪家的货、什么状态、该付多少"。
 *
 * <p>收货地址与金额都是下单瞬间的快照；状态机单路径流转（待付款 → 待发货 → 已发货 → 已完成，
 * 待付款/待发货可取消），各状态时刻用独立时间戳列留痕，不做流水表。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("orders.orders")
public class Order {

    public static final String STATUS_PENDING_PAYMENT = "PENDING_PAYMENT";

    public static final String STATUS_PAID = "PAID";

    public static final String STATUS_SHIPPED = "SHIPPED";

    public static final String STATUS_COMPLETED = "COMPLETED";

    public static final String STATUS_CANCELLED = "CANCELLED";

    /**
     * 状态机：合法转移的唯一真相。service / api 层的条件更新（WHERE status IN sourcesOf(目标态)）
     * 从这里反推源状态，前端动作按钮从 {@link #buyerActions()} / {@link #sellerActions()} 推导，三处消费同一张表不会漂移。
     */
    private static final Map<String, Set<String>> TRANSITIONS = Map.of(
            STATUS_PENDING_PAYMENT, Set.of(STATUS_PAID, STATUS_CANCELLED),
            STATUS_PAID, Set.of(STATUS_SHIPPED, STATUS_CANCELLED),
            STATUS_SHIPPED, Set.of(STATUS_COMPLETED),
            STATUS_COMPLETED, Set.of(),
            STATUS_CANCELLED, Set.of());

    /** 全部合法状态（列表筛选参数校验用），由转移表派生避免双份枚举 */
    public static final Set<String> ALL_STATUSES = TRANSITIONS.keySet();

    /**
     * 能转移到 target 的全部源状态：条件更新（WHERE status IN (...)）的合法前置集。
     * 源状态不再散写各 service，加新转移只改 TRANSITIONS 一处。
     */
    public static Set<String> sourcesOf(String target) {
        return TRANSITIONS.entrySet().stream()
                .filter(e -> e.getValue().contains(target))
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());
    }

    /** 转移目标 → 前端动作名：状态机是后端语汇，动作是交互语汇，一张映射表维系两套词表 */
    private static final Map<String, String> ACTION_BY_TARGET = Map.of(
            STATUS_PAID, "PAY",
            STATUS_CANCELLED, "CANCEL",
            STATUS_SHIPPED, "SHIP",
            STATUS_COMPLETED, "RECEIVE");

    private static final Set<String> BUYER_ACTIONS = Set.of("PAY", "CANCEL", "RECEIVE");

    private static final Set<String> SELLER_ACTIONS = Set.of("SHIP");

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 业务单号（对外展示/客服对账），全局唯一；UUID 是库内身份，orderNo 是人对外报的 */
    private String orderNo;

    /** 买家 ID，auth.users.id，跨 schema 裸引用不加 FK */
    private UUID userId;

    /** 卖家店铺 ID，shop.shops.id，裸引用不加 FK；一次结算按它拆成 N 单 */
    private UUID shopId;

    /** 状态机：PENDING_PAYMENT 待付款 / PAID 待发货 / SHIPPED 已发货 / COMPLETED 已完成 / CANCELLED 已关闭 */
    private String status;

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

    /** 取消原因：买家填写或超时关单的固定文案「超时未支付，自动关闭」 */
    private String cancelReason;

    /** 待付款截止时刻，超时由定时任务关单（idx_orders_pay_expire 部分索引即扫描全集） */
    private OffsetDateTime payExpireAt;

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

    /** 买家视角当前可执行的动作（详情页按钮组渲染用），按状态从转移表推导；终态返回空列表 */
    public List<String> buyerActions() {
        return actionsFor(BUYER_ACTIONS);
    }

    /** 卖家视角当前可执行的动作（发货作业按钮用） */
    public List<String> sellerActions() {
        return actionsFor(SELLER_ACTIONS);
    }

    private List<String> actionsFor(Set<String> allowed) {
        return TRANSITIONS.getOrDefault(status, Set.of()).stream()
                .map(ACTION_BY_TARGET::get)
                .filter(allowed::contains)
                .toList();
    }
}

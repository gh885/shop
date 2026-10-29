package com.shop.platform.fulfillment.api;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * 履约对外的同步入口。
 *
 * <p>三条边界：
 *
 * <ul>
 *   <li><b>发货是商家动作</b>，必须带运单号——没运单号的"发货"是虚假发货
 *   <li><b>写回订单走 {@code TradeCommand.recordShipment}</b>，不直接改 trade 的表
 *   <li><b>确认收货不是这里的事</b>：它由 trade 做，这里只提供"包裹签收了"这个事实
 * </ul>
 */
public interface FulfillmentCommand {

    /**
     * 商家发货：建包裹 + 明细 → 写回订单计数器 → 置发货任务完成，全在一个事务里。
     *
     * @throws com.shop.platform.common.BusinessException 数量超过剩余可发、运单号重复、
     *     订单未付款或已关闭，任何一个都让整次发货回滚
     */
    ShippedPackage ship(ShipRequest request);

    /**
     * 包裹签收。
     *
     * <p>这一版由买家点"确认收货"触发，不走物流轨迹——轨迹回写要 `logistics` 先落地。
     * 所以**买家能提前说自己收到了**，这是有意的取舍：没有物流对接时，不给这个口子就永远确认不了收货。
     *
     * @return false = 这个包裹已经是终态，什么都没改
     */
    boolean deliver(UUID packageId, UUID buyerId);

    /**
     * 一个商家单下的全部包裹，商家后台用。归属列在 SQL 里（{@code merchant_id}），
     * merchantId 只能从令牌取——「过了权限点」不等于「这单是你的」；{@code shopIds}
     * 再收窄一层：子账号只看授权店的包裹。
     */
    List<PackageView> findBySellerOrder(UUID sellerOrderId, UUID merchantId, java.util.Set<UUID> shopIds);

    /**
     * 买家侧查包裹：**带归属校验**。
     *
     * <p>归属链路是「包裹 → 子单 → 订单组 → 买家」，只有 fulfillment 走得通——
     * 它知道包裹属于哪个子单。
     *
     * @throws com.shop.platform.common.BusinessException 子单不存在或不属于这个买家，一律 404
     */
    List<PackageView> findBySellerOrderForBuyer(UUID sellerOrderId, UUID buyerId);

    /** 单号查包裹，用于"我的包裹到哪了"。 */
    Optional<PackageView> findByPackageNo(String packageNo);

    /**
     * 按 (承运商, 运单号) 定位包裹，给 logistics 的轨迹回传用——承运商只知道运单号，
     * 不知道平台内部的包裹 id。
     *
     * @throws com.shop.platform.common.BusinessException 查不到一律 404，不区分"没这个运单"和
     *     "运单存在但承运商对不上"——区分两者等于送一个运单探测器
     */
    Optional<PackageView> findByTrackingNo(String carrierCode, String trackingNo);

    /**
     * 轨迹回写，只给 logistics 调。八个标准码（{@link StandardTraceCode}），原始码翻译在那边。
     *
     * <p>三条不变式：
     *
     * <ul>
     *   <li><b>状态单调，只升不降</b>——delivered 之后收到的任何码都不改状态，只记录
     *   <li><b>exception / unknown 只记录</b>，认不出的码绝不推进状态
     *   <li><b>delivered 视同签收</b>，与买家手点同一条写路径（回写订单行、触发订单完成），
     *       {@code delivered_source} 记 {@code trace}
     * </ul>
     *
     * <p>幂等是调用方的契约：同一 {@code (packageId, 原始码, occurredAt)} 推两遍，
     * logistics 的 {@code trace_event} 唯一键会让第二次连这里都进不来。
     *
     * @param signedBy 签收人姓名，只有承运商能提供；非 {@code delivered} 码或渠道没给时传 null
     * @return 是否推进了包裹状态（false = 只记录，状态没动）
     */
    boolean recordTrace(UUID packageId, StandardTraceCode code, java.time.Instant occurredAt, String signedBy);

    /**
     * 一次发货的入参。
     *
     * @param merchantId 归属商家，从令牌取
     * @param shopIds 操作人的店铺范围（授权店），从令牌快照取。子单的店不在范围内，
     *     折 404——商家归属对了不代表这个店在他范围内
     * @param carrierCode 承运商代码。白名单见 {@link Carriers}，填错当场 400；
     *     <b>落库前归一化成小写</b>，渠道推什么大小写都能对上这个运单
     * @param trackingNo 运单号。**必填**——没运单号的发货查不到轨迹，等于没发
     * @param items 这个包裹装了哪些行、各多少件。拆包由商家决定，平台只要求可追溯
     */
    record ShipRequest(
            UUID sellerOrderId,
            UUID merchantId,
            java.util.Set<UUID> shopIds,
            String carrierCode,
            String trackingNo,
            List<ShipItem> items) {

        public ShipRequest {
            shopIds = Set.copyOf(shopIds);
            items = List.copyOf(items);
            if (items.isEmpty()) {
                throw new IllegalArgumentException("一个包裹至少要装一行");
            }
        }
    }

    /** @param lineNo 订单行号，与 {@code order_line.line_no} 一致 */
    record ShipItem(int lineNo, int quantity) {}

    /** @param packageNo 买家看到的包裹号 */
    record ShippedPackage(UUID packageId, String packageNo, UUID sellerOrderId, String status) {}

    /**
     * @param deliveredAt 签收时间；null 表示还没签收
     * @param deliveredSource 签收来源：buyer（买家手点）/ system（到期自动确认）/ trace（承运商轨迹）；
     *     null 表示还没签收
     * @param signedBy 签收人姓名，只有承运商轨迹给得出；其它两条路为 null
     * @param lastTraceAt 最后一条轨迹的时刻，停滞判断靠它；没轨迹时 null
     * @param items 包裹里的行，用于买家侧展示
     */
    record PackageView(
            UUID packageId,
            String packageNo,
            UUID sellerOrderId,
            String carrierCode,
            String trackingNo,
            String status,
            java.time.Instant shippedAt,
            java.time.Instant deliveredAt,
            String deliveredSource,
            String signedBy,
            java.time.Instant lastTraceAt,
            /** 发货 + 宽限期 = 系统将替买家确认的时刻；已签收/未发货为 null。买家端「N 天后自动确认」倒计时的数据源 */
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) java.time.Instant autoReceiveAt,
            List<ItemView> items) {}

    record ItemView(int lineNo, UUID orderLineId, int quantity) {}
}

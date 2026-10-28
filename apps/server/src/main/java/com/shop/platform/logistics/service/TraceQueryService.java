package com.shop.platform.logistics.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.fulfillment.api.Carriers;
import com.shop.platform.fulfillment.api.FulfillmentCommand;
import com.shop.platform.fulfillment.api.StandardTraceCode;
import com.shop.platform.logistics.mapper.TraceEventMapper;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 轨迹的只读出口。三个入口（买家 / 卖家 / 管理端）共用一套投影，区别只在**归属校验怎么做**。
 *
 * <p><b>归属不在本模块做，也不该在本模块做。</b>轨迹按 {@code package_id} 存，
 * 但"这个包裹属于谁"只有 fulfillment 知道（包裹 → 子单 → 订单组 → 买家）。
 * 所以本类只负责「用已验过归属的包裹 id 取轨迹」，校验由调用方先走
 * {@link FulfillmentCommand} 完成——那条链路已经存在且已被 DataScopeTest 守着。
 *
 * <p>买家侧按 {@code package_no} 查是特例：那是随机能力令牌，知道单号即有权查，
 * fulfillment 的 {@code findByPackageNo} 本身就是凭证语义，不叠归属列。
 */
@Component
public class TraceQueryService {

    private final TraceEventMapper traces;
    private final FulfillmentCommand fulfillment;

    public TraceQueryService(TraceEventMapper traces, FulfillmentCommand fulfillment) {
        this.traces = Objects.requireNonNull(traces, "traces");
        this.fulfillment = Objects.requireNonNull(fulfillment, "fulfillment");
    }

    /**
     * 买家看自己某个子单下所有包裹的轨迹。
     *
     * <p>归属由 {@code findBySellerOrderForBuyer} 判：不属于这个买家就是 404，
     * 不能返回空列表——空列表等于告诉对方"这个子单存在但没有包裹"。
     */
    public List<PackageTimeline> forBuyerOrder(UUID sellerOrderId, UUID buyerId) {
        return fulfillment.findBySellerOrderForBuyer(sellerOrderId, buyerId).stream()
                .map(pkg -> timelineOf(pkg.packageId(), pkg.packageNo(), pkg.trackingNo(), pkg.carrierCode()))
                .toList();
    }

    /**
     * 卖家看自己某子单下所有包裹的轨迹。归属列在 fulfillment 的 SQL 里（merchant_id + shopIds）。
     */
    public List<PackageTimeline> forSellerOrder(UUID sellerOrderId, UUID merchantId, java.util.Set<UUID> shopIds) {
        return fulfillment.findBySellerOrder(sellerOrderId, merchantId, shopIds).stream()
                .map(pkg -> timelineOf(pkg.packageId(), pkg.packageNo(), pkg.trackingNo(), pkg.carrierCode()))
                .toList();
    }

    /**
     * 按包裹号查一条轨迹线。{@code package_no} 是能力令牌——知道单号即有权查，
     * 这是买家"我的包裹到哪了"唯一的凭证形态。查不到 404。
     */
    public PackageTimeline byPackageNo(String packageNo) {
        var pkg = fulfillment
                .findByPackageNo(packageNo)
                .orElseThrow(() -> BusinessException.notFound("包裹不存在: " + packageNo));
        return timelineOf(pkg.packageId(), pkg.packageNo(), pkg.trackingNo(), pkg.carrierCode());
    }

    /**
     * 管理端按运单号核对：客服拿到买家报的运单号，要能立刻看见"我们到底收到了什么轨迹"。
     *
     * <p>必须先经 fulfillment 的 {@code findByTrackingNo} 把它换成包裹 id——轨迹表只按 id 存，
     * 冗余的 {@code tracking_no} 列是给排查用的，不该成为第二个查询入口。
     */
    public PackageTimeline byTrackingNo(String carrierCode, String trackingNo) {
        var pkg = fulfillment
                .findByTrackingNo(carrierCode, trackingNo)
                .orElseThrow(() -> BusinessException.notFound("运单不存在: " + carrierCode + " " + trackingNo));
        return timelineOf(pkg.packageId(), pkg.packageNo(), pkg.trackingNo(), pkg.carrierCode());
    }

    /**
     * 码表缺口的清单：最近这些原始码一直翻成 {@code unknown}。
     *
     * <p>这是码表维护的唯一入口。没有真实推送方时它是空的（没有推送就没有 unknown），
     * 接了渠道之后它就成了"该补哪几条映射"的待办列表。
     */
    public List<TraceEventMapper.UnmappedCodeRow> unmappedCodes(int limit) {
        return traces.findUnmappedCodes(limit);
    }

    /** 码表现有内容，核对用。 */
    public List<TraceEventMapper.MapRow> mappings(int limit) {
        return traces.findMappings(limit);
    }

    /**
     * 录一条映射（已存在则覆盖）。
     *
     * <p>承运商码归一化，原始码<b>不</b>归一化——翻译是拿原始码做点查，大小写可能正是码的一部分。
     *
     * <p>不做 {@code unknown} 的校验：那是入口层的规矩（把码映射成 unknown 等于没映射），
     * 这一层只负责写。
     */
    public void upsertMapping(String carrierCode, String rawCode, StandardTraceCode standardCode, String note) {
        traces.upsertMap(Carriers.normalize(carrierCode), rawCode, standardCode, note);
    }

    /** 删一条映射，返回 false = 本来就没有。 */
    public boolean deleteMapping(String carrierCode, String rawCode) {
        return traces.deleteMap(Carriers.normalize(carrierCode), rawCode);
    }

    private PackageTimeline timelineOf(UUID packageId, String packageNo, String trackingNo, String carrierCode) {
        // 无归属查询：调用方三步都已在 fulfillment 完成了归属/凭证校验
        return new PackageTimeline(
                packageId, packageNo, carrierCode, trackingNo, traces.findByPackageInternal(packageId));
    }

    /** @param traces 按发生时刻倒序，最新在前 */
    public record PackageTimeline(
            UUID packageId,
            String packageNo,
            String carrierCode,
            String trackingNo,
            List<TraceEventMapper.TraceRow> traces) {}
}

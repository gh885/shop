package com.shop.platform.fulfillment.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.id.BizNo;
import com.shop.platform.common.id.Ids;
import com.shop.platform.fulfillment.api.FulfillmentCommand;
import com.shop.platform.fulfillment.mapper.PackageStore;
import com.shop.platform.fulfillment.mapper.ShipTaskStore;
import com.shop.platform.fulfillment.model.Carriers;
import com.shop.platform.fulfillment.model.PackageStatus;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.api.TradeQuery;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 发货与签收。
 *
 * <p>顺序不能换：<b>校验可发量 → 建包裹 → 写明细 → 回写订单计数器 → 置发货任务</b>。
 *
 * <ul>
 *   <li>校验必须在建包裹之前：先建再校验，超发时包裹已经落库，得靠回滚兜底
 *   <li>写回订单走 {@code TradeCommand.recordShipment}，不直接改 trade 的表——那是跨模块写别人的数据
 *   <li>回写失败就整次回滚：包裹落了但订单没记发货，买家页会永远显示"待发货"
 * </ul>
 */
@Component
public class FulfillmentService implements FulfillmentCommand {

    private final PackageStore packages;
    private final ShipTaskStore shipTasks;
    private final TradeQuery trades;
    private final TradeCommand tradeCommands;

    public FulfillmentService(
            PackageStore packages, ShipTaskStore shipTasks, TradeQuery trades, TradeCommand tradeCommands) {
        this.packages = Objects.requireNonNull(packages, "packages");
        this.shipTasks = Objects.requireNonNull(shipTasks, "shipTasks");
        this.trades = Objects.requireNonNull(trades, "trades");
        this.tradeCommands = Objects.requireNonNull(tradeCommands, "tradeCommands");
    }

    @Override
    @Transactional
    public ShippedPackage ship(ShipRequest request) {
        if (request.carrierCode() == null || request.carrierCode().isBlank()) {
            throw BusinessException.badRequest("必须填写承运商");
        }
        if (request.trackingNo() == null || request.trackingNo().isBlank()) {
            // 没运单号的"发货"查不到轨迹，等于虚假发货
            throw BusinessException.badRequest("必须填写运单号");
        }
        // 白名单放在最前面：填错码是最便宜的拒绝，不该浪费一次跨模块查询
        Carriers.requireKnown(request.carrierCode());

        TradeQuery.Shippable shippable = trades.findShippable(request.sellerOrderId())
                .orElseThrow(() -> BusinessException.notFound("子单不存在: " + request.sellerOrderId()));

        if (!shippable.merchantId().equals(request.merchantId())) {
            // 404 而不是 403：403 等于确认"这个子单存在但不是你的"
            throw BusinessException.notFound("子单不存在: " + request.sellerOrderId());
        }
        if (!shippable.paid()) {
            throw BusinessException.conflict("订单还没付款，不能发货: " + request.sellerOrderId());
        }
        if (shippable.closed()) {
            throw BusinessException.conflict("订单已关闭，不能发货: " + request.sellerOrderId());
        }

        // 逐行校验上限。超发就是超卖，而剩余量只能由 trade 算
        List<TradeCommand.ShipmentLine> shipmentLines =
                new ArrayList<>(request.items().size());
        List<UUID> orderLineIds = new ArrayList<>(request.items().size());
        for (ShipItem item : request.items()) {
            TradeQuery.ShippableLine line = shippable
                    .line(item.lineNo())
                    .orElseThrow(() -> BusinessException.badRequest("订单没有这一行: lineNo=" + item.lineNo()));
            if (item.quantity() <= 0) {
                throw BusinessException.badRequest("发货数量必须为正: lineNo=" + item.lineNo());
            }
            if (item.quantity() > line.remaining()) {
                throw BusinessException.conflict(
                        "发货数量超过剩余可发: lineNo=" + item.lineNo() + " 剩余=" + line.remaining() + " 本次=" + item.quantity());
            }
            shipmentLines.add(new TradeCommand.ShipmentLine(item.lineNo(), item.quantity()));
            orderLineIds.add(line.orderLineId());
        }

        UUID packageId = Ids.newId();
        String packageNo = BizNo.of("PKG", LocalDate.now(ZoneId.systemDefault()));
        try {
            packages.insert(new PackageStore.NewPackage(
                    packageId,
                    packageNo,
                    request.sellerOrderId(),
                    request.merchantId(),
                    request.carrierCode(),
                    request.trackingNo()));
        } catch (DuplicateKeyException e) {
            // 撞 uq_package_tracking：同一个运单号挂了两个包裹，多半是商家手误录了两遍
            throw BusinessException.conflict(
                    ErrorCodes.TRACKING_NO_REUSED, "这个运单号已经用过: " + request.carrierCode() + " " + request.trackingNo());
        }

        for (int i = 0; i < request.items().size(); i++) {
            packages.insertItem(
                    packageId, orderLineIds.get(i), request.items().get(i).quantity());
        }

        // 写回订单计数器。失败就整次回滚——包裹落了但订单没记，买家页会永远停在"待发货"
        tradeCommands.recordShipment(request.sellerOrderId(), shipmentLines);
        shipTasks.markShipped(request.sellerOrderId());

        return new ShippedPackage(packageId, packageNo, request.sellerOrderId(), PackageStatus.SHIPPED.dbValue());
    }

    /**
     * 包裹签收。
     *
     * <p><b>归属校验在这里。</b> 这个动作会推进订单状态，不校验等于任何人拿别人的包裹 id
     * 都能"帮别人确认收货"。查不到和不属于你返回同一个 404。
     *
     * <p>这一版由买家点"确认收货"触发，不走物流轨迹——轨迹回写要 `logistics` 先落地。
     * 也就是说买家能提前说自己收到了，这是没有物流对接时的唯一出路；
     * 买家永远不点的风险由 {@link AutoReceiveJob} 兜底。
     *
     * @return false = 这个包裹已经是终态，什么都没改
     */
    @Override
    @Transactional
    public boolean deliver(UUID packageId, UUID buyerId) {
        PackageStore.PackageRow pkg = requireOwnedPackage(packageId, buyerId);
        return confirmReceipt(pkg, "buyer");
    }

    /**
     * 系统到期自动签收，只给 {@link AutoReceiveJob} 调。
     *
     * <p>没有它，买家不点"确认收货"，订单就永远停在 shipped，{@code OrderCompleted}
     * 不发，商家的钱冻在 clearing 的 pending 里解冻不了。
     *
     * <p>与买家手点走<b>同一条写路径</b>（CAS + 回写订单行），谁先到谁赢、重复执行幂等，
     * 只差 {@code delivered_source} 记 system——争议时"这单是买家确认的还是系统到期"
     * 靠这一列回答。不校验归属：调用方是扫表任务，包裹从自己的扫描面里来。
     */
    @Transactional
    public boolean autoReceive(UUID packageId) {
        return packages.find(packageId)
                .map(pkg -> confirmReceipt(pkg, "system"))
                .orElse(false);
    }

    /**
     * 签收落地：CAS 置 delivered → 回写订单行签收计数。
     *
     * <p>整包签收，按包裹明细的数量记。CAS 输了（终态或并发先到）就什么都不做——
     * 那一路已经记过账，再记就是重复计数。
     */
    private boolean confirmReceipt(PackageStore.PackageRow pkg, String source) {
        if (pkg.status().isFinal()) {
            return false;
        }
        if (!packages.markDelivered(pkg.id(), source)) {
            // 并发：另一个请求先推进了
            return false;
        }

        // 签收数量写回订单行。这一版整包签收，所以按包裹明细的数量记
        List<TradeCommand.ShipmentLine> receiptLines = packages.findItems(pkg.id()).stream()
                .map(item -> {
                    int lineNo = trades.findShippable(pkg.sellerOrderId())
                            .flatMap(shippable -> shippable.lineOf(item.orderLineId()))
                            .map(TradeQuery.ShippableLine::lineNo)
                            .orElseThrow(() -> new IllegalStateException("包裹里的行在订单里找不到: " + item.orderLineId()));
                    return new TradeCommand.ShipmentLine(lineNo, item.quantity());
                })
                .toList();

        tradeCommands.recordReceipt(pkg.sellerOrderId(), receiptLines);
        return true;
    }

    @Override
    public List<PackageView> findBySellerOrder(UUID sellerOrderId) {
        return packages.findBySellerOrder(sellerOrderId).stream()
                .map(this::toView)
                .toList();
    }

    /**
     * 买家侧查包裹，带归属校验。
     *
     * <p>先走一遍「子单 → 订单组 → 买家」，确认是自己的才返回包裹。
     * 不属于自己的子单直接 404——**不能返回空列表**，空列表等于告诉对方"这个子单存在但没有包裹"。
     */
    @Override
    public List<PackageView> findBySellerOrderForBuyer(UUID sellerOrderId, UUID buyerId) {
        boolean mine = trades.findShippable(sellerOrderId)
                .flatMap(shippable -> trades.findPayable(shippable.orderGroupId()))
                .map(payable -> payable.buyerId().equals(buyerId))
                .orElse(Boolean.FALSE);
        if (!mine) {
            throw BusinessException.notFound("子单不存在: " + sellerOrderId);
        }
        return findBySellerOrder(sellerOrderId);
    }

    @Override
    public Optional<PackageView> findByPackageNo(String packageNo) {
        return packages.findByPackageNo(packageNo).map(this::toView);
    }

    /** 包裹视图。行号通过 {@code TradeQuery} 补——不 JOIN trade 的表。 */
    private PackageView toView(PackageStore.PackageRow pkg) {
        Map<UUID, Integer> lineNoOf = trades.findShippable(pkg.sellerOrderId())
                .map(shippable -> shippable.lines().stream()
                        .collect(java.util.stream.Collectors.toMap(
                                TradeQuery.ShippableLine::orderLineId, TradeQuery.ShippableLine::lineNo)))
                .orElse(Map.of());

        List<ItemView> items = packages.findItems(pkg.id()).stream()
                .map(item ->
                        new ItemView(lineNoOf.getOrDefault(item.orderLineId(), 0), item.orderLineId(), item.quantity()))
                .toList();

        return new PackageView(
                pkg.id(),
                pkg.packageNo(),
                pkg.sellerOrderId(),
                pkg.carrierCode(),
                pkg.trackingNo(),
                pkg.status().dbValue(),
                pkg.shippedAt(),
                pkg.deliveredAt(),
                pkg.deliveredSource(),
                items);
    }

    private PackageStore.PackageRow requireOwnedPackage(UUID packageId, UUID buyerId) {
        PackageStore.PackageRow pkg =
                packages.find(packageId).orElseThrow(() -> BusinessException.notFound("包裹不存在: " + packageId));

        // 包裹 → 子单 → 订单组 → 买家。这条链只有 fulfillment 走得通（它知道包裹属于哪个子单）
        boolean mine = trades.findShippable(pkg.sellerOrderId())
                .flatMap(shippable -> trades.findPayable(shippable.orderGroupId()))
                .map(payable -> payable.buyerId().equals(buyerId))
                .orElse(Boolean.FALSE);

        if (!mine) {
            // 404 而不是 403：403 等于确认"这个包裹存在但不是你的"
            throw BusinessException.notFound("包裹不存在: " + packageId);
        }
        return pkg;
    }
}

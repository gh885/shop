package com.shop.platform.fulfillment.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.id.BizNo;
import com.shop.platform.common.id.Ids;
import com.shop.platform.fulfillment.AutoReceiveProperties;
import com.shop.platform.fulfillment.api.Carriers;
import com.shop.platform.fulfillment.api.FulfillmentCommand;
import com.shop.platform.fulfillment.api.StandardTraceCode;
import com.shop.platform.fulfillment.mapper.PackageMapper;
import com.shop.platform.fulfillment.mapper.ShipTaskMapper;
import com.shop.platform.fulfillment.model.PackageStatus;
import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.inventory.api.InventoryCommand;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.api.TradeQuery;
import java.time.Instant;
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
 * <p>顺序不能换：<b>校验可发量 → 建包裹 → 写明细 → 出库 → 回写订单计数器 → 置发货任务</b>。
 *
 * <ul>
 *   <li>校验必须在建包裹之前：先建再校验，超发时包裹已经落库，得靠回滚兜底
 *   <li>出库走 {@code InventoryCommand.ship}：包裹是这次出库的事实单，幂等锚点是 {@code packageId}，
 *       所以它必须在包裹落库之后——那一行就是"这一包发出去的货"的账
 *   <li>写回订单走 {@code TradeCommand.recordShipment}，不直接改 trade 的表——那是跨模块写别人的数据
 *   <li>任何一步失败都整次回滚：包裹落了但库存没出、或订单没记发货，都会留下对不上的账
 * </ul>
 */
@Component
public class FulfillmentService implements FulfillmentCommand {

    private final PackageMapper packages;
    private final ShipTaskMapper shipTasks;
    private final TradeQuery trades;
    private final TradeCommand tradeCommands;
    private final InventoryCommand inventory;
    private final AutoReceiveProperties autoReceive;

    public FulfillmentService(
            PackageMapper packages,
            ShipTaskMapper shipTasks,
            TradeQuery trades,
            TradeCommand tradeCommands,
            InventoryCommand inventory,
            AutoReceiveProperties autoReceive) {
        this.packages = Objects.requireNonNull(packages, "packages");
        this.shipTasks = Objects.requireNonNull(shipTasks, "shipTasks");
        this.trades = Objects.requireNonNull(trades, "trades");
        this.tradeCommands = Objects.requireNonNull(tradeCommands, "tradeCommands");
        this.inventory = Objects.requireNonNull(inventory, "inventory");
        this.autoReceive = Objects.requireNonNull(autoReceive, "autoReceive");
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
        // 落库的码是归一化后的小写：承运商推送方的大小写不受我们控制，而定位包裹是精确匹配。
        // 不归一化的话，商家录 SF、渠道推 sf，这个运单就永远查不到轨迹。
        String carrierCode = Carriers.normalize(request.carrierCode());

        TradeQuery.Shippable shippable = trades.findShippable(request.sellerOrderId())
                .orElseThrow(() -> BusinessException.notFound("子单不存在: " + request.sellerOrderId()));

        if (!shippable.merchantId().equals(request.scope().merchantId())) {
            // 404 而不是 403：403 等于确认"这个子单存在但不是你的"
            throw BusinessException.notFound("子单不存在: " + request.sellerOrderId());
        }
        if (!request.scope().coversShop(shippable.shopId())) {
            // 商家归属对了，店不在操作人范围内——同样 404，不给"存在但无权"的确认
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
            packages.insert(new PackageMapper.NewPackage(
                    packageId,
                    packageNo,
                    request.sellerOrderId(),
                    request.scope().merchantId(),
                    // 店铺冗余自子单（不可变），卖家侧按店收窄不用回查 trade
                    shippable.shopId(),
                    carrierCode,
                    request.trackingNo()));
        } catch (DuplicateKeyException e) {
            // 撞 uq_package_tracking：同一个运单号挂了两个包裹，多半是商家手误录了两遍
            throw BusinessException.conflict(
                    ErrorCodes.TRACKING_NO_REUSED, "这个运单号已经用过: " + carrierCode + " " + request.trackingNo());
        }

        for (int i = 0; i < request.items().size(); i++) {
            packages.insertItem(
                    packageId, orderLineIds.get(i), request.items().get(i).quantity());
        }

        // 出库：预占减、实物减。包裹已落库，它的 id 就是这次出库的幂等锚点——
        // 同一包裹重放只会付一次账，第二个包裹是一次新的出库
        inventory.ship(shipOut(request.sellerOrderId(), packageId, request.items()));

        // 写回订单计数器。失败就整次回滚——包裹落了但订单没记，买家页会永远停在"待发货"
        tradeCommands.recordShipment(request.sellerOrderId(), shipmentLines);
        shipTasks.markShipped(request.sellerOrderId());

        return new ShippedPackage(packageId, packageNo, request.sellerOrderId(), PackageStatus.SHIPPED.dbValue());
    }

    /**
     * 把一次发货翻译成库存的出库入参。
     *
     * <p>单独立一个方法是因为两个 {@code ShipRequest} 同名：{@link FulfillmentCommand.ShipRequest} 是
     * "商家怎么发这一包"（含承运商、运单号、店铺范围），{@code inventory.api.ShipRequest} 是
     * "这一包动了哪些库存行"（只有行号与件数）。两者混在一个方法里，迟早有人把运单号传进库存。
     */
    private static com.shop.platform.inventory.api.ShipRequest shipOut(
            UUID sellerOrderId, UUID packageId, List<ShipItem> items) {
        return new com.shop.platform.inventory.api.ShipRequest(
                sellerOrderId,
                packageId,
                items.stream()
                        .map(item ->
                                new com.shop.platform.inventory.api.ShipRequest.Line(item.lineNo(), item.quantity()))
                        .toList());
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
        PackageMapper.PackageRow pkg = requireOwnedPackage(packageId, buyerId);
        return confirmReceipt(pkg, "buyer", null);
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
        return packages.findInternal(packageId)
                .map(pkg -> confirmReceipt(pkg, "system", null))
                .orElse(false);
    }

    /**
     * 签收落地：CAS 置 delivered → 回写订单行签收计数。
     *
     * <p>整包签收，按包裹明细的数量记。CAS 输了（终态或并发先到）就什么都不做——
     * 那一路已经记过账，再记就是重复计数。
     *
     * @param signedBy 签收人姓名，只有承运商轨迹能给；买家手点与系统到期传 null，
     *     此时 {@code COALESCE} 保留库里已有的值（轨迹先到、买家再点，签字人不该被抹掉）
     */
    private boolean confirmReceipt(PackageMapper.PackageRow pkg, String source, String signedBy) {
        if (pkg.status().isFinal()) {
            return false;
        }
        if (!packages.markDelivered(pkg.id(), source, signedBy)) {
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

    /** 卖家侧包裹列表。归属在 SQL 里；店铺范围写进同一条 SQL，空集直接空列表。 */
    @Override
    public List<PackageView> findBySellerOrder(UUID sellerOrderId, AccessScope.Seller scope) {
        if (scope.coversNoShop()) {
            return List.of();
        }
        return packages.findBySellerOrder(sellerOrderId, scope).stream()
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
                .map(payableAmount -> payableAmount.buyerId().equals(buyerId))
                .orElse(Boolean.FALSE);
        if (!mine) {
            throw BusinessException.notFound("子单不存在: " + sellerOrderId);
        }
        // 归属已在上面校验过（子单 → 订单组 → 买家），取包裹走无归属的 Internal 变体
        return packages.findBySellerOrderInternal(sellerOrderId).stream()
                .map(this::toView)
                .toList();
    }

    @Override
    public Optional<PackageView> findByPackageNo(String packageNo) {
        return packages.findByPackageNoInternal(packageNo).map(this::toView);
    }

    /** webhook 侧定位包裹。明细要回查 trade 补行号，和别的视图走同一个 toView。 */
    @Override
    public Optional<PackageView> findByTrackingNo(String carrierCode, String trackingNo) {
        // 承运商码在这里归一化：推送方发的是 SF 还是 sf 不可控，库里存的是小写
        return packages.findByTrackingNoInternal(Carriers.normalize(carrierCode), trackingNo)
                .map(this::toView);
    }

    /**
     * 轨迹回写。推进规则照 fulfillment.md §2.3 的八码表：
     * collected→shipped（通常已在这个状态，等于只记时间）、in_transit/out_for_delivery→in_transit、
     * delivered→按 trace 来源签收、rejected/returned→returned、exception/unknown→只记录。
     *
     * <p>单调性靠 SQL 前置条件（影响 0 行 = 不动），不在这里写 if-else 判断状态高低——
     * 判断放代码里，两个入口（这里和手点签收）迟早各判一套。
     */
    @Override
    @Transactional
    public boolean recordTrace(UUID packageId, StandardTraceCode code, Instant occurredAt, String signedBy) {
        Objects.requireNonNull(code, "code");
        Objects.requireNonNull(occurredAt, "occurredAt");
        PackageMapper.PackageRow pkg =
                packages.findInternal(packageId).orElseThrow(() -> BusinessException.notFound("包裹不存在: " + packageId));

        packages.touchTrackAt(packageId, occurredAt);

        switch (code) {
            case COLLECTED -> {
                // 揽收只证明"货交出去了"，不比 shipped 高，状态不动
                return false;
            }
            case IN_TRANSIT, OUT_FOR_DELIVERY -> {
                return packages.markInTransit(packageId);
            }
            case DELIVERED -> {
                // 承运商签收视同包裹签收，与买家手点同一条写路径
                return confirmReceipt(pkg, "trace", signedBy);
            }
            case REJECTED, RETURNED -> {
                return packages.markReturned(packageId);
            }
            default -> {
                // exception / unknown：只记录（touchTrackAt 已做），状态绝不猜着动
                return false;
            }
        }
    }

    /** 包裹视图。行号通过 {@code TradeQuery} 补——不 JOIN trade 的表。 */
    private PackageView toView(PackageMapper.PackageRow pkg) {
        Map<UUID, Integer> lineNoOf = trades.findShippable(pkg.sellerOrderId())
                .map(shippable -> shippable.lines().stream()
                        .collect(java.util.stream.Collectors.toMap(
                                TradeQuery.ShippableLine::orderLineId, TradeQuery.ShippableLine::lineNo)))
                .orElse(Map.of());

        List<ItemView> items = packages.findItems(pkg.id()).stream()
                .map(item ->
                        new ItemView(lineNoOf.getOrDefault(item.orderLineId(), 0), item.orderLineId(), item.quantity()))
                .toList();

        // 自动确认时刻：在途才算（签收/退回后没有"将要自动确认"这回事）；宽限期单一真相源
        Instant autoReceiveAt = pkg.deliveredAt() == null && pkg.shippedAt() != null
                ? autoReceive.autoReceiveAt(pkg.shippedAt())
                : null;

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
                pkg.signedBy(),
                pkg.lastTraceAt(),
                autoReceiveAt,
                items);
    }

    private PackageMapper.PackageRow requireOwnedPackage(UUID packageId, UUID buyerId) {
        PackageMapper.PackageRow pkg =
                packages.findInternal(packageId).orElseThrow(() -> BusinessException.notFound("包裹不存在: " + packageId));

        // 包裹 → 子单 → 订单组 → 买家。这条链只有 fulfillment 走得通（它知道包裹属于哪个子单）
        boolean mine = trades.findShippable(pkg.sellerOrderId())
                .flatMap(shippable -> trades.findPayable(shippable.orderGroupId()))
                .map(payableAmount -> payableAmount.buyerId().equals(buyerId))
                .orElse(Boolean.FALSE);

        if (!mine) {
            // 404 而不是 403：403 等于确认"这个包裹存在但不是你的"
            throw BusinessException.notFound("包裹不存在: " + packageId);
        }
        return pkg;
    }
}

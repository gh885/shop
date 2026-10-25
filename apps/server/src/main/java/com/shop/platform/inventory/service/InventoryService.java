package com.shop.platform.inventory.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.id.Ids;
import com.shop.platform.inventory.api.InventoryCommand;
import com.shop.platform.inventory.api.InventoryQuery;
import com.shop.platform.inventory.api.ReserveRequest;
import com.shop.platform.inventory.mapper.ReservationMapper;
import com.shop.platform.inventory.mapper.StockLedgerMapper;
import com.shop.platform.inventory.mapper.StockMapper;
import com.shop.platform.inventory.model.ReservationStatus;
import com.shop.platform.inventory.model.Stock;
import com.shop.platform.inventory.model.StockChange;
import com.shop.platform.inventory.model.StockMoveType;
import com.shop.platform.inventory.model.Warehouse;
import java.time.Duration;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 库存的唯一写者。所有变动都按同一个顺序走：<b>幂等闸门 → 改账 → 记流水</b>，同一个事务。
 *
 * <p>顺序不能换。先改账再挡幂等，重复请求会先把数量改掉、再被唯一键拦住，账已经多扣了一次。
 *
 * <p>{@code before} 的值一律由操作语义反推，不回查：扣 n 件之前就是多 n 件。回查会引入新的竞态窗口。
 */
@Component
public class InventoryService implements InventoryCommand, InventoryQuery {

    /**
     * 预占宽限：{@code expires_at = 订单 expires_at + 10 分钟}。
     *
     * <p>宽限是必须的——订单那边的取消 CAS 得先跑完，库存抢在前面释放就会造出"订单还开着、货已经放回去"的窗口。
     */
    private static final Duration GRACE = Duration.ofMinutes(10);

    private final StockMapper stocks;
    private final ReservationMapper reservations;
    private final StockLedgerMapper logs;

    public InventoryService(StockMapper stocks, ReservationMapper reservations, StockLedgerMapper logs) {
        this.stocks = Objects.requireNonNull(stocks, "stocks");
        this.reservations = Objects.requireNonNull(reservations, "reservations");
        this.logs = Objects.requireNonNull(logs, "logs");
    }

    @Override
    @Transactional
    public void reserve(ReserveRequest request) {
        for (ReserveRequest.Line line : request.lines()) {
            reserveLine(request, line);
        }
    }

    @Override
    @Transactional
    public void commitAll(List<OrderLineRef> refs) {
        for (ReservationMapper.Reservation existing : orderedReservations(refs)) {
            switch (existing.status()) {
                case COMMITTED, CONSUMED -> {}
                case RELEASED, EXPIRED -> revive(existing);
                case RESERVED -> {
                    if (!reservations.advance(existing.id(), ReservationStatus.RESERVED, ReservationStatus.COMMITTED)) {
                        throw new IllegalStateException("预占状态推进失败，可能是并发回调: " + existing.id());
                    }
                    // 不动任何科目列，流水只留状态痕迹，quantity 恒为 0
                    Stock current = requireStock(existing.skuId());
                    logs.append(
                            StockMoveType.COMMIT,
                            new StockChange(current, current),
                            0,
                            "order",
                            existing.sellerOrderId(),
                            "commit:" + existing.sellerOrderId() + ":" + existing.lineNo(),
                            "system",
                            null);
                }
            }
        }
    }

    @Override
    @Transactional
    public void releaseAll(List<OrderLineRef> refs) {
        for (ReservationMapper.Reservation existing : orderedReservations(refs)) {
            releaseAs(existing, ReservationStatus.RELEASED);
        }
    }

    /**
     * 把行号集合解析成预占行，并按库存行序（warehouse, sku, lineNo）返回。
     *
     * <p>这个顺序是死锁的解：两个订单以不同行序碰同一组 SKU，只要都按这个全序拿行锁，
     * 就不会出现"你持有我要的、我持有你要的"。一次查询取回全部预占，不再逐行点查。
     */
    private List<ReservationMapper.Reservation> orderedReservations(List<OrderLineRef> refs) {
        if (refs.isEmpty()) {
            return List.of();
        }
        List<UUID> sellerOrderIds =
                refs.stream().map(OrderLineRef::sellerOrderId).distinct().toList();
        Map<String, ReservationMapper.Reservation> byRef = new HashMap<>();
        for (ReservationMapper.Reservation reservation : reservations.findBySellerOrders(sellerOrderIds)) {
            byRef.put(refKey(reservation.sellerOrderId(), reservation.lineNo()), reservation);
        }
        return refs.stream()
                .map(ref -> {
                    ReservationMapper.Reservation existing = byRef.get(refKey(ref.sellerOrderId(), ref.lineNo()));
                    if (existing == null) {
                        throw BusinessException.notFound("预占不存在: " + ref.sellerOrderId() + ":" + ref.lineNo());
                    }
                    return existing;
                })
                .sorted(Comparator.comparing(ReservationMapper.Reservation::warehouseId)
                        .thenComparing(ReservationMapper.Reservation::skuId)
                        .thenComparingInt(ReservationMapper.Reservation::lineNo))
                .toList();
    }

    private static String refKey(UUID sellerOrderId, int lineNo) {
        return sellerOrderId + ":" + lineNo;
    }

    @Override
    @Transactional
    public void ship(UUID sellerOrderId, int lineNo) {
        ReservationMapper.Reservation existing = requireReservation(sellerOrderId, lineNo);
        if (existing.status() == ReservationStatus.CONSUMED) {
            return;
        }
        if (existing.status() != ReservationStatus.COMMITTED) {
            throw BusinessException.conflict(
                    "预占状态不是 committed，不能发货: " + existing.status().dbValue());
        }
        if (!reservations.advance(existing.id(), ReservationStatus.COMMITTED, ReservationStatus.CONSUMED)) {
            throw new IllegalStateException("发货状态推进失败，可能是并发消费: " + existing.id());
        }

        int quantity = existing.quantity();
        Stock after = stocks.ship(existing.skuId(), existing.warehouseId(), quantity)
                .orElseThrow(
                        () -> new IllegalStateException("预占或实物不足，账已经不对了: sku=" + existing.skuId() + " n=" + quantity));
        Stock before = new Stock(
                after.skuId(),
                after.warehouseId(),
                after.merchantId(),
                after.onHand() + quantity,
                after.availableToPromise(),
                after.reserved() + quantity,
                after.safety());

        // 出库扣的是实物，可售不动，所以流水数量按实物取负
        logs.append(
                StockMoveType.SHIP,
                new StockChange(before, after),
                -quantity,
                "order",
                existing.sellerOrderId(),
                "ship:" + existing.sellerOrderId() + ":" + lineNo,
                "system",
                null);
    }

    /** 超时兜底：只处理还挂着且已过期的。主路径永远是订单关闭事件，这里是它丢了的保险。 */
    @Transactional
    public int releaseExpired(int limit) {
        int released = 0;
        for (ReservationMapper.Reservation expired : reservations.findExpired(limit)) {
            if (releaseAs(expired, ReservationStatus.EXPIRED)) {
                released++;
            }
        }
        return released;
    }

    @Override
    public int availableToPromise(UUID skuId) {
        return stocks.find(skuId, Warehouse.DEFAULT)
                .map(Stock::availableToPromise)
                .orElse(0);
    }

    /**
     * 商家调整：覆盖实物与安全库存，可售由守恒式反推。这是唯一允许覆盖数字的入口。
     *
     * <p>直接 {@code UPDATE stock} 而不同步可售，会被 {@code ck_stock_balance} 当场拒——那道护栏就是干这个的。
     */
    /**
     * 商家调整：覆盖实物与安全库存，可售由守恒式反推。这是唯一允许覆盖数字的入口。
     *
     * <p>直接 {@code UPDATE stock} 而不同步可售，会被 {@code ck_stock_balance} 当场拒——那道护栏就是干这个的。
     *
     * <p><b>这里不做"调整后不能为负"的拦截。</b>见 {@code docs/domain/inventory.md} §2.2：{@code availableToPromise}
     * 允许为负，负值意味着账上已经超卖（盘亏、商家漏改）。拦住它，商家就没法把真实数字填进来，
     * 只会逼着人填一个假数字；正确的动作是记下来、进告警、补在途订单。
     */
    @Transactional
    public Stock adjust(UUID skuId, UUID merchantId, int onHand, int safety) {
        if (onHand < 0 || safety < 0) {
            throw BusinessException.badRequest("实物库存和安全库存都不能为负");
        }
        Stock before = stocks.lock(skuId, Warehouse.DEFAULT).orElse(null);
        Stock after;
        if (before == null) {
            // 首次建档：可售 = 实物 - 安全库存，守恒式一条都不许破
            after = stocks.insert(new Stock(skuId, Warehouse.DEFAULT, merchantId, onHand, onHand - safety, 0, safety));
        } else {
            if (!before.merchantId().equals(merchantId)) {
                throw BusinessException.forbidden("这个 SKU 不属于当前商家");
            }
            after = stocks.adjust(skuId, Warehouse.DEFAULT, onHand, safety);
        }

        StockChange change = new StockChange(
                before == null ? new Stock(skuId, Warehouse.DEFAULT, merchantId, 0, 0, 0, 0) : before, after);
        // 每次调整都是独立的商家动作，没有天然幂等键；用本次请求 id 当 ref 与幂等键，
        // 只保证"同一次请求重放不记两条"，不合并两次相同的调整
        UUID adjustRequestId = Ids.newId();
        if (change.movesLedger()) {
            logs.append(
                    StockMoveType.ADJUST,
                    change,
                    change.availableDelta(),
                    "manual",
                    adjustRequestId,
                    "adjust:" + adjustRequestId + ":0",
                    "merchant",
                    merchantId);
        }
        return after;
    }

    private void reserveLine(ReserveRequest request, ReserveRequest.Line line) {
        // 1. 幂等闸门：同一子单同一行只能预占一次
        try {
            reservations.insert(ReservationMapper.Reservation.pending(
                    line.skuId(),
                    Warehouse.DEFAULT,
                    line.merchantId(),
                    request.orderGroupId(),
                    request.sellerOrderId(),
                    line.lineNo(),
                    line.quantity(),
                    request.expiresAt().plus(GRACE)));
        } catch (DuplicateKeyException e) {
            throw BusinessException.conflict("这一行已经预占过: " + request.sellerOrderId() + ":" + line.lineNo());
        }

        // 2. 改账：条件更新，影响 0 行就是不够卖
        Stock after = stocks.reserve(line.skuId(), Warehouse.DEFAULT, line.quantity())
                .orElseThrow(
                        () -> BusinessException.conflict(ErrorCodes.INSUFFICIENT_STOCK, "库存不足: sku=" + line.skuId()));
        Stock before = new Stock(
                after.skuId(),
                after.warehouseId(),
                after.merchantId(),
                after.onHand(),
                after.availableToPromise() + line.quantity(),
                after.reserved() - line.quantity(),
                after.safety());

        // 3. 记流水
        logs.append(
                StockMoveType.RESERVE,
                new StockChange(before, after),
                -line.quantity(),
                "order",
                request.sellerOrderId(),
                "reserve:" + request.sellerOrderId() + ":" + line.lineNo(),
                "system",
                null);
    }

    /** 返回 true = 这次真的放了；false = 别人先处理过，跳过。 */
    private boolean releaseAs(ReservationMapper.Reservation existing, ReservationStatus target) {
        if (existing.status() == ReservationStatus.RELEASED || existing.status() == ReservationStatus.EXPIRED) {
            return false;
        }
        if (existing.status() == ReservationStatus.CONSUMED) {
            throw BusinessException.conflict("预占已经出库，不能释放: " + existing.id());
        }
        if (!reservations.advance(existing.id(), existing.status(), target)) {
            return false;
        }

        int quantity = existing.quantity();
        Stock after = stocks.release(existing.skuId(), existing.warehouseId(), quantity)
                .orElseThrow(
                        () -> new IllegalStateException("预占不足，重复释放或账已不对: sku=" + existing.skuId() + " n=" + quantity));
        Stock before = new Stock(
                after.skuId(),
                after.warehouseId(),
                after.merchantId(),
                after.onHand(),
                after.availableToPromise() - quantity,
                after.reserved() + quantity,
                after.safety());

        logs.append(
                StockMoveType.RELEASE,
                new StockChange(before, after),
                quantity,
                "order",
                existing.sellerOrderId(),
                target.dbValue() + ":" + existing.sellerOrderId() + ":" + existing.lineNo(),
                "system",
                null);
        return true;
    }

    /**
     * 预占没了又收到支付成功：重新预占，失败就抛，由 trade 触发整单退款。
     *
     * <p>已付款的订单必须有预占。预占被提前释放说明货可能已经卖给别人了，硬发货就是超卖。
     */
    private void revive(ReservationMapper.Reservation existing) {
        Stock after = stocks.reserve(existing.skuId(), existing.warehouseId(), existing.quantity())
                .orElseThrow(() -> BusinessException.conflict(
                        ErrorCodes.INSUFFICIENT_STOCK, "预占已被释放且补不回来，应整单退款: sku=" + existing.skuId()));
        Stock before = new Stock(
                after.skuId(),
                after.warehouseId(),
                after.merchantId(),
                after.onHand(),
                after.availableToPromise() + existing.quantity(),
                after.reserved() - existing.quantity(),
                after.safety());
        logs.append(
                StockMoveType.RESERVE,
                new StockChange(before, after),
                -existing.quantity(),
                "order",
                existing.sellerOrderId(),
                "reserve:" + existing.sellerOrderId() + ":" + existing.lineNo() + ":revive",
                "system",
                null);

        if (!reservations.advance(existing.id(), existing.status(), ReservationStatus.COMMITTED)) {
            throw new IllegalStateException("预占复活后状态推进失败: " + existing.id());
        }
    }

    private ReservationMapper.Reservation requireReservation(UUID sellerOrderId, int lineNo) {
        return reservations
                .findByLine(sellerOrderId, lineNo)
                .orElseThrow(() -> BusinessException.notFound("预占不存在: " + sellerOrderId + ":" + lineNo));
    }

    private Stock requireStock(UUID skuId) {
        return stocks.find(skuId, Warehouse.DEFAULT).orElseThrow(() -> new IllegalStateException("库存行不存在: " + skuId));
    }
}

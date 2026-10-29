package com.shop.platform.inventory.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.inventory.api.AdjustRequest;
import com.shop.platform.inventory.api.InventoryCommand;
import com.shop.platform.inventory.api.InventoryQuery;
import com.shop.platform.inventory.api.InventoryQuery.StockAccount;
import com.shop.platform.inventory.api.ReserveRequest;
import com.shop.platform.inventory.api.RestockRequest;
import com.shop.platform.inventory.api.ShipRequest;
import com.shop.platform.inventory.mapper.ReservationMapper;
import com.shop.platform.inventory.mapper.StockLedgerMapper;
import com.shop.platform.inventory.mapper.StockMapper;
import com.shop.platform.inventory.model.ReservationStatus;
import com.shop.platform.inventory.model.Stock;
import com.shop.platform.inventory.model.StockChange;
import com.shop.platform.inventory.model.StockMoveType;
import com.shop.platform.inventory.model.Warehouse;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 库存的唯一写者。所有变动都按同一个顺序走：<b>幂等闸门 → 改账 → 记流水</b>，同一个事务。
 *
 * <p>顺序不能换。先改账再挡幂等，重复请求会先把数量改掉、再被唯一键拦住，账已经多扣了一次。
 *
 * <h2>为什么出库/回补先 {@code FOR UPDATE} 再记账</h2>
 *
 * <p>{@code stock_ledger} 的 before/after 是 NOT NULL 全量四列，只能在改账之后才拿到真值，
 * 所以它天生当不了"第一步的闸门"。这三个操作改成先在行锁里读一次前值：
 *
 * <ol>
 *   <li>{@code lock(...)}：{@code SELECT ... FOR UPDATE}，拿权威前值并占住这一行
 *   <li>{@code logs.append(...)}：{@code ON CONFLICT DO NOTHING}，false 即重复请求，直接返回
 *   <li>条件更新：影响 0 行说明账已经不对，抛异常让整笔回滚
 * </ol>
 *
 * <p>{@code FOR UPDATE} 不引入新的竞态（下一步的 UPDATE 本来就要拿这把行锁），代价是把它退化成
 * "锁 + 更新"。可以接受的原因有两条：
 *
 * <ul>
 *   <li>出库与回补都不在下单路径上，量级差一到两个数量级
 *   <li>换来的是流水里的 {@code before} 是<b>真值</b>而不是反推值。反推在有历史 bug 的场景下
 *       会把错误原样记进账本，而对账时账本正是那个基准
 * </ul>
 *
 * <p>下单预占 {@link #reserve} 仍然是纯条件更新、不回查：它在热点路径上，而且它没有"前值"要写进流水
 * 之外的需求（{@code before} 由操作语义唯一确定：扣 n 件之前就是多 n 件）。
 */
@Component
public class InventoryService implements InventoryCommand, InventoryQuery {

    private static final Logger log = LoggerFactory.getLogger(InventoryService.class);

    /**
     * 预占宽限：{@code expires_at = 订单 expires_at + 10 分钟}。
     *
     * <p>宽限是必须的——订单那边的取消 CAS 得先跑完，库存抢在前面释放就会造出"订单还开着、货已经放回去"的窗口。
     */
    private static final Duration GRACE = Duration.ofMinutes(10);

    private final StockMapper stocks;
    private final ReservationMapper reservations;
    private final StockLedgerMapper logs;

    /** 可售为负的次数。这个值只该由商家调整造出来，出现即说明账上已超卖。 */
    private final Counter oversold;

    public InventoryService(
            StockMapper stocks, ReservationMapper reservations, StockLedgerMapper logs, MeterRegistry registry) {
        this.stocks = Objects.requireNonNull(stocks, "stocks");
        this.reservations = Objects.requireNonNull(reservations, "reservations");
        this.logs = Objects.requireNonNull(logs, "logs");
        this.oversold = Counter.builder("shop.inventory.oversold")
                .description("可售量变成负值的次数（账上已超卖：盘亏或商家漏改）")
                .register(Objects.requireNonNull(registry, "registry"));
    }

    // ── 下单与释放 ────────────────────────────────────────────────────────────

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
                    Stock current = findStock(existing.skuId(), existing.warehouseId());
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

    // ── 出库、回补、调整 ──────────────────────────────────────────────────────

    /**
     * 出库：预占减、实物减，可售不动。
     *
     * <p>幂等锚点是 {@code (packageId, lineNo)}：一个子单可以分多个包裹发，同一行会出库多次。
     * 同一包裹重放是空操作，第二个包裹是一次新的出库。
     *
     * <p>行序按 {@code (warehouse, sku, lineNo)} 固定，与 {@link #commitAll} 同一把锁序——
     * 并发发货与并发关单碰同一组 SKU 时不会互相持有对方要的行锁。
     */
    @Override
    @Transactional
    public void ship(ShipRequest request) {
        // 先按 (warehouse, sku, lineNo) 全序排好再逐行处理：与 commitAll/releaseAll 同一把锁序，
        // 并发发货和并发关单碰同一组 SKU 时不会互相持有对方要的行锁
        List<Map.Entry<ReservationMapper.Reservation, Integer>> ordered = request.lines().stream()
                .map(line -> Map.entry(requireReservation(request.sellerOrderId(), line.lineNo()), line.quantity()))
                .sorted(Comparator.comparing((Map.Entry<ReservationMapper.Reservation, Integer> entry) ->
                                entry.getKey().warehouseId())
                        .thenComparing(entry -> entry.getKey().skuId())
                        .thenComparingInt(entry -> entry.getKey().lineNo()))
                .toList();
        for (Map.Entry<ReservationMapper.Reservation, Integer> entry : ordered) {
            shipLine(request.packageId(), entry.getKey(), entry.getValue());
        }
    }

    private void shipLine(UUID packageId, ReservationMapper.Reservation reservation, int quantity) {
        String idempotencyKey = "ship:" + packageId + ":" + reservation.lineNo();
        // 0. 幂等预检。重放同一个包裹是常态（渠道重推、任务重跑），先查一次比先去锁行便宜；
        //    真正的闸门仍是第 3 步的 ON CONFLICT，这里只是让重放不必付出加锁与异常判断
        if (logs.exists(idempotencyKey)) {
            return;
        }
        if (reservation.status() == ReservationStatus.RESERVED) {
            // 没付款就发货：订单侧已经放行到这里了，但账上这行货还挂在"待付款"的预占上。
            // 继续发会让 on_hand 少了、reserved 也少了，可售凭空多出来一件
            throw BusinessException.conflict(
                    "预占还没确认，不能出库（订单未付款？）: " + reservation.sellerOrderId() + ":" + reservation.lineNo());
        }
        if (!reservation.status().holdsStock() || reservation.remaining() < quantity) {
            throw BusinessException.conflict("预占不足以出库: 状态="
                    + reservation.status().dbValue() + " 剩余=" + reservation.remaining() + " 本次=" + quantity);
        }

        // 1. 行锁读真值，先占住这一行，后面的"记-改"才没有窗口
        Stock before = requireStock(reservation.skuId(), reservation.warehouseId());
        Stock after = new Stock(
                before.skuId(),
                before.warehouseId(),
                before.merchantId(),
                before.onHand() - quantity,
                before.availableToPromise(),
                before.reserved() - quantity,
                before.safety());

        // 2. 幂等闸门：包裹才是这次出库的事实单，同一包裹同一行只出一次
        if (!logs.append(
                StockMoveType.SHIP,
                new StockChange(before, after),
                -quantity,
                "package",
                packageId,
                idempotencyKey,
                "system",
                null)) {
            return;
        }

        // 3. 改账。0 行说明 reserved/on_hand 与预占行对不上，账已经坏了——回滚并告警
        Stock actual = stocks.ship(before.skuId(), before.warehouseId(), quantity)
                .orElseThrow(
                        () -> new IllegalStateException("预占或实物不足，账已经不对了: sku=" + before.skuId() + " n=" + quantity));
        // 流水里的 after 是算出来的、账上的 after 是改出来的。两者不等说明这一行在
        // 行锁之外被动过（有人绕过接口），此时流水已经记下了错的数——必须回滚，不能留
        if (!actual.equals(after)) {
            throw new IllegalStateException("改账结果与预期不符，库存行被绕过接口修改过: 预期=" + after + " 实际=" + actual);
        }

        // 4. 推进预占：发完才是 consumed，没发完就继续挂着 committed
        if (!reservations.shipPartial(reservation.id(), quantity)) {
            throw new IllegalStateException(
                    "出库推进失败，预占状态或余量与订单侧不一致: reservation=" + reservation.id() + " n=" + quantity);
        }
    }

    /**
     * 退货入库：实物加、可售加。
     *
     * <p>只有"货真的回到仓里"才调——仅退款不入库。幂等锚点是 {@code (rmaCaseId, lineNo)}。
     */
    @Override
    @Transactional
    public void restock(RestockRequest request) {
        request.lines().stream()
                .sorted(Comparator.comparing(RestockRequest.Line::skuId).thenComparingInt(RestockRequest.Line::lineNo))
                .forEach(line -> restockLine(request.rmaCaseId(), line));
    }

    private void restockLine(UUID rmaCaseId, RestockRequest.Line line) {
        Stock before = stocks.lock(line.skuId(), Warehouse.DEFAULT)
                .orElseThrow(() -> BusinessException.conflict("这个 SKU 没有库存记录，退货回补无处落账: " + line.skuId()));

        Stock after = new Stock(
                before.skuId(),
                before.warehouseId(),
                before.merchantId(),
                before.onHand() + line.quantity(),
                before.availableToPromise() + line.quantity(),
                before.reserved(),
                before.safety());

        String idempotencyKey = "restock:" + rmaCaseId + ":" + line.lineNo();
        if (!logs.append(
                StockMoveType.RESTOCK,
                new StockChange(before, after),
                line.quantity(),
                "rma",
                rmaCaseId,
                idempotencyKey,
                "system",
                null)) {
            return;
        }

        Stock actual = stocks.restock(before.skuId(), before.warehouseId(), line.quantity())
                .orElseThrow(() -> new IllegalStateException("回补失败，库存行不见了: " + before.skuId()));
        if (!actual.equals(after)) {
            throw new IllegalStateException("回补结果与预期不符，库存行被绕过接口修改过: 预期=" + after + " 实际=" + actual);
        }
    }

    /**
     * 商家调整：覆盖实物与安全库存，可售由守恒式反推。这是唯一允许覆盖数字的入口。
     *
     * <p>直接 {@code UPDATE stock} 而不同步可售，会被 {@code ck_stock_balance} 当场拒——那道护栏就是干这个的。
     *
     * <p><b>这里不做"调整后不能为负"的拦截。</b>见 {@code docs/domain/inventory.md} §2.2：可售
     * 允许为负，负值意味着账上已经超卖（盘亏、商家漏改）。拦住它，商家就没法把真实数字填进来，
     * 只会逼着人填一个假数字；正确的动作是记下来、进告警、补在途订单。
     */
    @Override
    @Transactional
    public void adjustAll(AdjustRequest request) {
        request.lines().stream()
                .sorted(Comparator.comparing(AdjustRequest.Line::skuId).thenComparingInt(AdjustRequest.Line::lineNo))
                .forEach(line -> adjustLine(request, line));
    }

    @Override
    @Transactional
    public void forgetSku(UUID skuId) {
        stocks.deleteBySku(skuId);
    }

    private void adjustLine(AdjustRequest request, AdjustRequest.Line line) {
        if (line.onHand() < 0 || line.safety() < 0) {
            throw BusinessException.badRequest("实物库存和安全库存都不能为负");
        }
        Stock before = stocks.lock(line.skuId(), Warehouse.DEFAULT).orElse(null);
        if (before != null && !before.merchantId().equals(request.merchantId())) {
            throw BusinessException.notFound("这个 SKU 不属于当前商家: " + line.skuId());
        }

        Stock after;
        if (before == null) {
            // 首次建档：可售 = 实物 - 安全库存，守恒式一条都不许破
            after = stocks.insert(new Stock(
                    line.skuId(),
                    Warehouse.DEFAULT,
                    request.merchantId(),
                    line.onHand(),
                    line.onHand() - line.safety(),
                    0,
                    line.safety()));
        } else {
            after = stocks.adjust(line.skuId(), Warehouse.DEFAULT, line.onHand(), line.safety());
        }

        StockChange change = new StockChange(
                before == null ? new Stock(line.skuId(), Warehouse.DEFAULT, request.merchantId(), 0, 0, 0, 0) : before,
                after);
        // 幂等键取客户端给的 requestId：批量调整一次上千行，超时重试必须只落一遍账
        if (change.movesLedger()) {
            logs.append(
                    StockMoveType.ADJUST,
                    change,
                    change.availableDelta(),
                    "manual",
                    request.requestId(),
                    "adjust:" + request.requestId() + ":" + line.lineNo(),
                    "merchant",
                    request.merchantId());
        }

        if (after.availableToPromise() < 0) {
            // 这是负可售唯一能出现的入口（reserve 有 >= qty 守卫，release/restock 只会加）。
            // 所以"立刻告警"在这里做，不等日检——日检叫"明天才发现"
            oversold.increment();
            log.error(
                    "库存已超卖：sku={} 可售={} 实物={} 预占={} 安全={}。商家报了真实的少量，在途订单要靠平台补偿",
                    after.skuId(),
                    after.availableToPromise(),
                    after.onHand(),
                    after.reserved(),
                    after.safety());
        }
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

    // ── 读侧 ─────────────────────────────────────────────────────────────────

    @Override
    public int availableToPromise(UUID skuId) {
        return stocks.find(skuId, Warehouse.DEFAULT)
                .map(Stock::availableToPromise)
                .orElse(0);
    }

    /**
     * 交易口径的批量可售量：只看默认仓，与 {@link #availableToPromise} 同源。
     *
     * <p>空集合直接返回空 Map，不打库——商家一页商品一个 SKU 都没有是正常状态
     * （全停售），不该为此付一次往返。
     */
    @Override
    public Map<UUID, Integer> availableToPromiseByIds(Collection<UUID> skuIds) {
        if (skuIds.isEmpty()) {
            return Map.of();
        }
        return toMap(stocks.availableOfWarehouse(skuIds, Warehouse.DEFAULT));
    }

    /** 商家口径：跨仓求和。"我还有多少货"，不是"现在能不能卖"。 */
    @Override
    public Map<UUID, Integer> availableAcrossWarehouses(Collection<UUID> skuIds) {
        if (skuIds.isEmpty()) {
            return Map.of();
        }
        return toMap(stocks.sumAvailableBySkuIds(skuIds));
    }

    private static Map<UUID, Integer> toMap(List<StockMapper.SkuAvailable> rows) {
        return rows.stream()
                .collect(Collectors.toUnmodifiableMap(
                        StockMapper.SkuAvailable::skuId, StockMapper.SkuAvailable::available));
    }

    @Override
    public Map<UUID, StockAccount> stockAccounts(Collection<UUID> skuIds) {
        if (skuIds.isEmpty()) {
            return Map.of();
        }
        return stocks.accountsOfWarehouse(skuIds, Warehouse.DEFAULT).stream()
                .collect(Collectors.toUnmodifiableMap(
                        StockMapper.StockRow::skuId,
                        row -> new StockAccount(
                                row.skuId(), row.onHand(), row.availableToPromise(), row.reserved(), row.safety())));
    }

    // ── 内部 ─────────────────────────────────────────────────────────────────

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

        int quantity = existing.remaining();
        if (quantity == 0) {
            // 已全部出库但状态还没转 consumed（理论上不会发生，shipPartial 是同一条 UPDATE）。
            // 此时没有可放的量，只把状态推过去，不写流水
            return true;
        }

        Stock before = requireStock(existing.skuId(), existing.warehouseId());
        Stock after = new Stock(
                before.skuId(),
                before.warehouseId(),
                before.merchantId(),
                before.onHand(),
                before.availableToPromise() + quantity,
                before.reserved() - quantity,
                before.safety());

        Stock actual = stocks.release(existing.skuId(), existing.warehouseId(), quantity)
                .orElseThrow(
                        () -> new IllegalStateException("预占不足，重复释放或账已不对: sku=" + existing.skuId() + " n=" + quantity));
        if (!actual.equals(after)) {
            throw new IllegalStateException("释放结果与预期不符，库存行被绕过接口修改过: 预期=" + after + " 实际=" + actual);
        }
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

    /** 行锁读：出库、回补、调整要用它拿权威前值。下单路径永远不许用。 */
    private Stock requireStock(UUID skuId, UUID warehouseId) {
        return stocks.lock(skuId, warehouseId)
                .orElseThrow(() -> new IllegalStateException("库存行不存在: sku=" + skuId + " warehouse=" + warehouseId));
    }

    /** 无锁读：只在不需要前值的场合用（如 commit 的流水快照）。 */
    private Stock findStock(UUID skuId, UUID warehouseId) {
        return stocks.find(skuId, warehouseId)
                .orElseThrow(() -> new IllegalStateException("库存行不存在: sku=" + skuId + " warehouse=" + warehouseId));
    }
}

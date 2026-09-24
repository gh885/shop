package com.shop.platform.aftersale.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.aftersale.events.AfterSaleRefundedEvent;
import com.shop.platform.aftersale.mapper.Ticket;
import com.shop.platform.aftersale.mapper.TicketEvent;
import com.shop.platform.aftersale.mapper.TicketEventMapper;
import com.shop.platform.aftersale.mapper.TicketMapper;
import com.shop.platform.aftersale.model.AfterSaleReason;
import com.shop.platform.aftersale.model.AfterSaleTimeouts;
import com.shop.platform.aftersale.model.TicketAction;
import com.shop.platform.aftersale.model.TicketAvailableAction;
import com.shop.platform.aftersale.model.TicketStatus;
import com.shop.platform.aftersale.model.TicketType;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.api.CouponCommand;
import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.logistics.api.ReturnShipmentCommand;
import com.shop.platform.logistics.api.ReturnShipmentView;
import com.shop.platform.order.api.OrderAfterSaleView;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.OrderLineView;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.order.api.OrderSummaryView;
import com.shop.platform.shop.api.AddressSnapshot;
import com.shop.platform.shop.api.MerchantAddressReadQuery;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 售后单的唯一驱动：买家申请/撤销/回寄，卖家同意/拒绝/收货。
 *
 * <p>转移合法性在 {@link TicketAction} 一张表；本类只负责驱动：取进行中的单 → 归属校验 → 条件更新
 * （WHERE status = action.from()，影响行数即并发闸门）→ 时间线 → 写回订单投影 → 副作用（退款事件 / 回补库存）。
 * 申请前置（订单已完成且申请窗口未过）与回补所需行项经 order :: api 只读点查，不碰 orders schema。
 *
 * <p>退款：payment 同步监听 {@link AfterSaleRefundedEvent} 经网关落退款单据（同事务），落不成整体回滚、
 * 售后单停回原态——不假报「已退款」。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AfterSaleService {

    private final TicketMapper ticketMapper;

    private final TicketEventMapper ticketEventMapper;

    private final OrderReadQuery orderReadQuery;

    private final OrderCommand orderCommand;

    private final StockCommand stockCommand;

    private final ApplicationEventPublisher events;

    /** 回寄包裹落 logistics（同事务）：退货物流不再是第二套字符串，而是复用正向包裹与轨迹的那一套 */
    private final ReturnShipmentCommand returnShipmentCommand;

    /** 券命令（coupon :: api）：退款完成时退券（另发新券），同事务 */
    private final CouponCommand couponCommand;

    /** 商家地址只读点查（shop :: api）：买家回寄地址在详情查询时实时解析，不落快照列 */
    private final MerchantAddressReadQuery merchantAddressReadQuery;

    // 买家
    /**
     * 申请售后：仅「已完成 + 申请窗口未过 + 无进行中的单 + 最新单非已退款」可发起；退款口径 = 整单实付（V1 整单售后）。
     *
     * <p>申请瞬间顺手判定这张单是否为<b>无理由强制单</b>（{@link #noReasonEnforced}，AFS-45）并把结论落列：
     * 法定权利是否成立取决于「申请那一刻」的主张、快照声明与窗口位置，事后现算会随卖家处理时长漂移。
     */
    @Transactional
    public Ticket apply(UUID userId, UUID orderId, TicketType type, AfterSaleReason reasonCode, String reason) {
        OrderAfterSaleView order = Validate.presentOwned(
                orderReadQuery.afterSaleViewById(orderId), OrderAfterSaleView::userId, userId, "订单不存在");
        Validate.isTrue(order.afterSaleOpenAt(OffsetDateTime.now()), 409, TicketAction.APPLY.conflictMessage());
        // 最新一张售后单已是 REFUNDED（终态）：整单退款只允许发生一次，堵住「退了再申请」的二次退款敞口。
        // 只挡 REFUNDED：REJECTED/CLOSED（被拒/撤销）不伤买家利益，仍可在窗口内重新申请
        Ticket latest = ticketMapper.selectLatestByOrder(orderId);
        if (latest != null && latest.getStatus() == TicketStatus.REFUNDED) {
            throw BusinessException.conflict(ErrorCodes.AFTER_SALE_ALREADY_REFUNDED, "该订单已完成退款，不能再次申请售后");
        }

        String trimmed = Text.trimToNull(reason);
        Ticket ticket = Ticket.builder()
                .orderId(orderId)
                .userId(userId)
                .shopId(order.shopId())
                .type(type)
                .status(TicketStatus.APPLYING)
                .reasonCode(reasonCode)
                .reason(trimmed)
                .noReasonEnforced(enforceNoReason(type, reasonCode, order, orderId))
                .refundAmount(order.payAmount().amount())
                .currency(order.payAmount().currency())
                .build();
        // uk_tickets_open_per_order：并发重复申请只能有一张进行中
        DuplicateKeys.conflictOnDuplicate(() -> ticketMapper.insert(ticket), "该订单已有进行中的售后");
        record(ticket, TicketAction.APPLY, trimmed);
        orderCommand.syncAfterSale(orderId, TicketStatus.APPLYING.name(), null);
        log.info(
                "[AFTERSALE] 申请售后, orderId={}, ticketId={}, type={}, reasonCode={}, noReasonEnforced={}",
                orderId,
                ticket.getId(),
                type,
                reasonCode,
                ticket.isNoReasonEnforced());
        return ticket;
    }

    /**
     * 七天无理由强制是否成立（消保法第 25 条）：三个条件全中才算——
     * ① 买家主张的是「无理由退货」（换成质量等原因走普通售后，卖家有权拒绝）；
     * ② 整单每一行的无理由声明快照都支持；③ 此刻仍在「收到商品起 7 天」内。
     *
     * <p>②读订单行快照而不是 SPU 当前值：卖家事后关掉开关抹不掉买家买到手时手上的权利。
     * 整单粒度（AFS-09）下取 allMatch——一张单里混进一件除外商品，就不整体强退，
     * 退回普通售后台阶（卖家可拒），而不是给一个整单做不到的承诺。
     *
     * <p>③的起算时刻拿不到（既没签收也没完成）时不成立：法定窗口自收到之日起算，
     * 连「收到」都无从证明时不该把卖家的拒绝权拿走——宁可少强制，不可错强制。
     */
    private boolean enforceNoReason(
            TicketType type, AfterSaleReason reasonCode, OrderAfterSaleView order, UUID orderId) {
        if (type != TicketType.RETURN_REFUND || reasonCode != AfterSaleReason.NO_REASON) {
            return false;
        }
        OffsetDateTime receivedAt = order.receivedAt();
        if (receivedAt == null || receivedAt.plus(AfterSaleTimeouts.NO_REASON).isBefore(OffsetDateTime.now())) {
            return false;
        }
        List<OrderLineView> lines = orderReadQuery.linesById(orderId);
        return !lines.isEmpty() && lines.stream().allMatch(OrderLineView::sevenDayReturn);
    }

    /** 撤销申请：APPLYING → CLOSED（终态） */
    @Transactional
    public void cancel(UUID userId, UUID orderId) {
        transition(requireBuyerOpen(userId, orderId, TicketAction.CLOSE), TicketAction.CLOSE, null, u -> {});
    }

    /**
     * 回寄并填写退货物流单（仅退货退款、处于 RETURNING）：态不变，只落物流单并记时间线。
     *
     * <p>回寄包裹落在 logistics（{@link ReturnShipmentCommand#replace}，同事务）：它之后自动享有正向包裹的一切
     * ——承运商推送按运单号就能匹配到它、轮询兜底会扫它、买家「查看物流」里会看到它的轨迹。
     * 售后单上的两列是<b>投影</b>（拿命令返回值写回，展示用），轨迹真相在 logistics。
     *
     * <p><b>覆盖更新（C10）</b>：买家可重复提交改运单号，每次提交作废旧 RETURN 包裹（含其轨迹节点）再新建，
     * 一单同一时刻至多一张有效回寄包裹——售后卡与物流页从此只见最新一条，旧单号的迟到轨迹不再串到新单上。
     */
    @Transactional
    public void returnGoods(UUID userId, UUID orderId, String carrierCode, String carrierName, String trackingNo) {
        Ticket ticket = requireBuyerOpen(userId, orderId, TicketAction.RETURN_GOODS);
        ReturnShipmentView shipment = returnShipmentCommand.replace(
                orderId, ticket.getUserId(), ticket.getShopId(), carrierCode, carrierName, trackingNo);
        transition(ticket, TicketAction.RETURN_GOODS, shipment.carrierName() + " " + shipment.trackingNo(), u -> u.set(
                        Ticket::getReturnLogisticsCompany, shipment.carrierName())
                .set(Ticket::getReturnTrackingNo, shipment.trackingNo()));
    }

    /** 买家视角最近一张售后单（含终态）；非本人的订单同不存在 */
    public Optional<Ticket> latestForBuyer(UUID userId, UUID orderId) {
        return Optional.ofNullable(ticketMapper.selectLatestByOrder(orderId))
                .filter(t -> t.getUserId().equals(userId));
    }

    /**
     * 买家回寄地址（售后详情查询时实时解析，不存快照）：本店默认退货地址折成一行
     * 「收件人 电话 · 省市区详址」；卖家没配默认退货地址返回 null，由前端引导联系客服。
     *
     * <p>查询时解析而不是申请时定格：卖家改了退货地址，买家看到的就是新地址；退地址不是资金口径，
     * 不需要「当时说了什么」的审计语义，快照列因此不值得为它开一场 migration。
     */
    public String resolveReturnAddress(UUID shopId) {
        return merchantAddressReadQuery
                .resolveReturnTo(shopId)
                .map(AfterSaleService::formatReturnAddress)
                .orElse(null);
    }

    /** 一行串是展示口径不是存储契约；省/市/详址的必填性由 AddressSnapshot 构造期校验兜底，这里只处理可空的区 */
    private static String formatReturnAddress(AddressSnapshot address) {
        String district = address.district() == null ? "" : address.district();
        return address.contactName() + " " + address.phone() + " · " + address.province() + address.city() + district
                + address.detail();
    }

    /**
     * 买家视角的当前可执行动作（C5b 下发用）：撤销 / 回寄从售后单状态推导，「重新申请」不是本单上的转移、
     * 吃的是订单申请窗口——售后单看不见订单，故由本服务经 order :: api 点查后把谓词喂给推导。
     */
    public List<TicketAvailableAction> buyerActions(Ticket ticket) {
        return TicketAvailableAction.buyerActions(ticket.getStatus(), reapplyAllowed(ticket));
    }

    /** 能否重新申请（AFS-04/05 口径，与 {@link #apply} 的闸门同款）：本单已到终态且非已退款，且订单申请窗口未过 */
    private boolean reapplyAllowed(Ticket ticket) {
        TicketStatus status = ticket.getStatus();
        if (status.open() || status == TicketStatus.REFUNDED) {
            return false;
        }
        return orderReadQuery
                .afterSaleViewById(ticket.getOrderId())
                .map(order -> order.afterSaleOpenAt(OffsetDateTime.now()))
                .orElse(false);
    }

    // 卖家
    /**
     * 同意售后，按已申请的 type 分派：仅退款 APPLYING → REFUNDED 一步到位（同意即退款，无「已同意待退款」悬挂态）；
     * 退货退款 APPLYING → RETURNING（进入退货流程，暂不退款），等买家回寄、卖家收货后再退。
     */
    @Transactional
    public void agree(UUID shopId, UUID orderId) {
        Ticket ticket = requireSellerOpen(shopId, orderId, TicketAction.REFUND);
        if (ticket.getType() == TicketType.RETURN_REFUND) {
            transition(ticket, TicketAction.AGREE_RETURN, null, u -> {});
            return;
        }
        refund(ticket, TicketAction.REFUND);
    }

    /**
     * 拒绝售后：申请阶段 APPLYING → REJECTED，退货阶段 RETURNING → REJECTED（货退回来了但验货不通过）。
     * 走哪条边由当前态决定——卖家侧从头到尾只有一个「拒绝」按钮（AFS-40 的多对一映射）。
     *
     * <p>理由<b>必填</b>并原样落时间线 note（AFS-30）：拒绝是卖家单方面的终局决定，买家看不到理由就不知道该
     * 改什么、该不该重新申请，日后有争议也无从判断责任在谁。
     *
     * <p>无理由强制单（AFS-45）在<b>申请阶段</b>直接挡掉：消保法第 25 条禁止的是「以不属于质量问题为由拒绝受理」，
     * 卖家侧本来就不会下发那颗按钮，但按钮的缺席不是授权——不信任前端的第二道门落在单上那个定格的标记列。
     * 退货阶段（RETURNING）的验货不通过不在此列：寄回的不是原件、商品已不完好，规章留了争议空间。
     */
    @Transactional
    public void reject(UUID shopId, UUID orderId, String reason) {
        Ticket ticket = requireSellerOpen(shopId, orderId, TicketAction.REJECT);
        Validate.isTrue(
                !ticket.isNoReasonEnforced() || ticket.getStatus() == TicketStatus.RETURNING,
                409,
                "该申请为七天无理由退货，不可拒绝受理");
        TicketAction action =
                ticket.getStatus() == TicketStatus.RETURNING ? TicketAction.REJECT_RETURN : TicketAction.REJECT;
        transition(ticket, action, Text.trimToNull(reason), u -> {});
    }

    /**
     * 确认收到退货（仅退货退款、处于 RETURNING）：RETURNING → REFUNDED，退款并回补总库存（货真的回来了）。
     * 仅退款路径没有本步——它同意即退，不回补库存。
     */
    @Transactional
    public void receiveReturn(UUID shopId, UUID orderId) {
        receive(requireSellerOpen(shopId, orderId, TicketAction.RECEIVE_RETURN), TicketAction.RECEIVE_RETURN, null);
    }

    /** 确认收货的落点（人工与超时自动共用）：退款 + 按整单行项回补，两个动作之间不存在第二套逻辑 */
    private void receive(Ticket ticket, TicketAction action, String note) {
        refund(ticket, action, note);
        stockCommand.restock(
                ticket.getOrderId(),
                orderReadQuery.linesById(ticket.getOrderId()).stream()
                        .map(l -> new StockLine(l.skuId(), l.quantity()))
                        .toList());
    }

    /**
     * 买家详情的附加视图（唯一消费点是 {@code GET /orders/{id}/after-sales}）：回寄地址 + 拒绝理由，
     * 两件事都不落 tickets 列、各自查真相源，且都只在买家这一侧解析（卖家看得到时间线的上下文，列表更不该 N+1）。
     */
    public BuyerTicketDetail buyerDetail(Ticket ticket) {
        String rejectReason = ticket.getStatus() == TicketStatus.REJECTED
                ? ticketEventMapper.selectLatestRejectNote(ticket.getId())
                : null;
        return new BuyerTicketDetail(resolveReturnAddress(ticket.getShopId()), rejectReason);
    }

    /** 卖家视角最近一张售后单（含终态）；非本店的订单同不存在 */
    public Optional<Ticket> latestForShop(UUID shopId, UUID orderId) {
        return Optional.ofNullable(ticketMapper.selectLatestByOrder(orderId))
                .filter(t -> t.getShopId().equals(shopId));
    }

    // 超时（C11）：单笔事务落点，由 AfterSaleTimeoutService 逐笔委托（不同 bean，@Transactional 才生效）
    /**
     * 卖家超 48h 未处理 → 自动同意：与 {@link #agree} 同款分派、同款副作用（仅退款即退、退货退款进 RETURNING
     * 等回寄），差别只是走 AUTO_* 动作让时间线记 actor=SYSTEM——超时放行不是卖家点出来的，账不说谎。
     *
     * @return 是否真的落成；条件更新抢不到行（卖家恰好也处理了）= false，让位给人工
     */
    @Transactional
    public boolean autoAgree(UUID ticketId) {
        Ticket ticket = ticketMapper.selectById(ticketId);
        if (ticket == null || ticket.getStatus() != TicketStatus.APPLYING) {
            return false;
        }
        if (ticket.getType() == TicketType.RETURN_REFUND) {
            transition(ticket, TicketAction.AUTO_AGREE_RETURN, "卖家超时未处理，系统自动同意", u -> {});
            return true;
        }
        refund(ticket, TicketAction.AUTO_REFUND, "卖家超时未处理，系统自动同意");
        return true;
    }

    /**
     * 买家回寄超 7 天未填运单号 → 自动关闭（CLOSED）：转终态即联动释放「一单一进行中」名额
     * （uk 部分索引随行状态让位，窗口内可重新申请），投影写回由 {@link #transition} 统一负责。
     *
     * <p>条件更新额外挂 {@code return_tracking_no IS NULL}：扫描与落点之间买家刚提交了回寄，就让位给他——
     * 货已在途的单绝不关。
     *
     * @return 是否真的落成；已填回寄 / 已被处理 = false
     */
    @Transactional
    public boolean autoCloseReturn(UUID ticketId) {
        Ticket ticket = ticketMapper.selectById(ticketId);
        if (ticket == null || ticket.getStatus() != TicketStatus.RETURNING || ticket.getReturnTrackingNo() != null) {
            return false;
        }
        transition(
                ticket, TicketAction.AUTO_CLOSE, "买家超时未回寄，系统自动关闭", u -> {}, u -> u.isNull(Ticket::getReturnTrackingNo));
        return true;
    }

    /**
     * 卖家超 10 天未确认收货 → 自动退款并回补（AFS-23）：买家已经把货寄回、运单号已登记，卖家的沉默
     * 不能把「已同意退货」悬成无限期——那条路上买家既拿不到钱、订单也因为争议未决不自动完成（AFS-43）。
     * 副作用与人工确认收货走 {@link #receive} 同一落点，只是动作换成 AUTO_RECEIVE 让时间线记 actor=SYSTEM。
     *
     * <p>落点前再读一次投影列而不是只信扫描结果：{@code return_tracking_no} 为 null 说明这条单归自动关闭
     * 管（AFS-23 第②条），两条超时线必须互斥，否则会出现「已关闭的单被退款」这种对不上的账。
     *
     * @return 是否真的落成；卖家恰好在这之前处理了 = false，让位给人工
     */
    @Transactional
    public boolean autoReceiveReturn(UUID ticketId) {
        Ticket ticket = ticketMapper.selectById(ticketId);
        if (ticket == null || ticket.getStatus() != TicketStatus.RETURNING || ticket.getReturnTrackingNo() == null) {
            return false;
        }
        receive(ticket, TicketAction.AUTO_RECEIVE, "卖家超时未确认收货，系统自动退款");
        return true;
    }

    /**
     * 卖家售后工作台：本店售后单分页，时间倒序（最新的申请/处理在最上面）。
     *
     * <p>不做「进行中优先」的排序：待办与历史是同一张表的两种看法，让 status 筛选去分流
     * （前端默认停在「待处理」tab），比在 SQL 里编一个状态优先级更容易讲清楚。
     * 每行补订单摘要——工作台要能认出是哪一单，而订单信息不属本模块，经 order :: api 批查后内存拼装。
     */
    @Transactional(readOnly = true)
    public PageResult<SellerTicketItem> pageShop(UUID shopId, String status, PageParams page) {
        // 1. 筛选值先校验：列表参数写错要立刻 400，静默忽略等于给出一份不知怎么筛出来的数据
        TicketStatus filter = Validate.enumFilter(TicketStatus.class, status, "非法的售后状态筛选值");
        // 2. 本店售后单分页：shop_id 是归属闸门，越店看不到（不是先查再过滤）
        Page<Ticket> rows = ticketMapper.selectPage(
                new Page<>(page.page(), page.size()),
                new LambdaQueryWrapper<Ticket>()
                        .eq(Ticket::getShopId, shopId)
                        .eq(filter != null, Ticket::getStatus, filter)
                        .orderByDesc(Ticket::getCreatedAt));
        // 3. 订单摘要批量补齐（跨模块只读点查，进 Map 后内存拼装；同一订单可能有多张历史售后单，去重再查）
        Map<UUID, OrderSummaryView> orders = orderReadQuery.summariesByIds(
                rows.getRecords().stream().map(Ticket::getOrderId).distinct().toList());
        // 4. 拼装工作台行
        return new PageResult<>(
                rows.getRecords().stream()
                        .map(t -> toSellerItem(t, orders.get(t.getOrderId())))
                        .toList(),
                rows.getTotal());
    }

    /**
     * 一批订单的卖家售后可执行动作（卖家订单列表行内按钮）：与工作台同一套算法
     * （{@link TicketAvailableAction#sellerActions}），前端不再按订单上的售后投影另推一张按钮表。
     *
     * <p>没有进行中售后单的订单不出现在结果里（前端按 orderId 取，取不到 = 无动作）：
     * 一行都没必要下发空集合，一页十几行乘一个空数组纯属噪音。
     */
    @Transactional(readOnly = true)
    public List<SellerOrderTicketActions> sellerActionsByOrders(UUID shopId, List<UUID> orderIds) {
        if (orderIds.isEmpty()) {
            return List.of();
        }
        return ticketMapper.selectOpenByOrders(shopId, orderIds).stream()
                .map(t -> new SellerOrderTicketActions(
                        t.getOrderId(), TicketAvailableAction.sellerActions(t.getStatus(), t.isNoReasonEnforced())))
                .toList();
    }

    /** 卖家工作台行 = 售后单 + 订单摘要；拼不出摘要说明数据被外力改坏，直接失败而不是给出一行缺订单号的售后单 */
    private SellerTicketItem toSellerItem(Ticket ticket, OrderSummaryView order) {
        Validate.isTrue(order != null, 500, "售后单对应的订单不存在，数据不一致");
        return new SellerTicketItem(
                ticket.getId(),
                ticket.getOrderId(),
                order.orderNo(),
                order.receiverName(),
                order.itemCount(),
                order.firstItemName(),
                ticket.getType(),
                ticket.getStatus(),
                TicketAvailableAction.sellerActions(ticket.getStatus(), ticket.isNoReasonEnforced()),
                ticket.getReasonCode(),
                ticket.getReason(),
                ticket.isNoReasonEnforced(),
                ticket.refundAmountAsMoney(),
                ticket.getReturnLogisticsCompany(),
                ticket.getReturnTrackingNo(),
                ticket.getRefundedAt(),
                ticket.getCreatedAt(),
                ticket.getUpdatedAt());
    }

    // 私有
    /** 退款落点（仅退款同意 / 退货收货 / 超时自动同意共用）：转 REFUNDED 回填时刻，再通知 payment 同事务落退款单据 */
    private void refund(Ticket ticket, TicketAction action) {
        refund(ticket, action, null);
    }

    /** note 给时间线补充动作上下文（超时自动同意要说明是谁做的决定）；人工路径传 null */
    private void refund(Ticket ticket, TicketAction action, String note) {
        OffsetDateTime now = OffsetDateTime.now();
        transition(ticket, action, note, u -> u.set(Ticket::getRefundedAt, now));
        events.publishEvent(
                new AfterSaleRefundedEvent(ticket.getOrderId(), ticket.getUserId(), ticket.refundAmountAsMoney()));
        // 退券：整单退款要把券还给买家（另发新券，原券保持 USED）。没用券、或券已过期时无副作用。
        // 与退款同事务：退款成立而券没退（或反之）都是对不上账的半成品
        couponCommand.returnOnRefund(ticket.getOrderId());
        log.info(
                "[AFTERSALE] 售后退款, orderId={}, ticketId={}, amount={}",
                ticket.getOrderId(),
                ticket.getId(),
                ticket.getRefundAmount());
    }

    /**
     * 转移的唯一落点：条件更新（WHERE status = action.from()）→ 影响行数闸门 → 时间线 → 写回订单投影。
     * extraSets 承载该动作附带的列（回寄填物流单、退款填时刻）。
     */
    private void transition(
            Ticket ticket, TicketAction action, String note, Consumer<LambdaUpdateWrapper<Ticket>> extraSets) {
        transition(ticket, action, note, extraSets, u -> {});
    }

    /** extraWhere 给并发闸门加列级条件（超时关闭要再确认「还没回寄」）；扫描-落点竞态同样靠影响行数让位 */
    private void transition(
            Ticket ticket,
            TicketAction action,
            String note,
            Consumer<LambdaUpdateWrapper<Ticket>> extraSets,
            Consumer<LambdaUpdateWrapper<Ticket>> extraWhere) {
        LambdaUpdateWrapper<Ticket> update = new LambdaUpdateWrapper<Ticket>()
                .eq(Ticket::getId, ticket.getId())
                .eq(Ticket::getStatus, action.from())
                .set(Ticket::getStatus, action.target());
        extraWhere.accept(update);
        extraSets.accept(update);
        Validate.isTrue(ticketMapper.update(null, update) == 1, 409, action.conflictMessage());
        record(ticket, action, note);
        orderCommand.syncAfterSale(
                ticket.getOrderId(),
                action.target().name(),
                action.target() == TicketStatus.REFUNDED ? ticket.refundAmountAsMoney() : null);
    }

    private void record(Ticket ticket, TicketAction action, String note) {
        ticketEventMapper.insert(TicketEvent.builder()
                .ticketId(ticket.getId())
                .actor(action.actor().name())
                .action(action.name())
                .note(note)
                .build());
    }

    /** 进行中的单：没有 → 409（用该动作的冲突文案）；不属于该买家 → 404，不泄露单据存在性 */
    private Ticket requireBuyerOpen(UUID userId, UUID orderId, TicketAction action) {
        return Validate.requireOwned(requireOpen(orderId, action), Ticket::getUserId, userId, "订单不存在");
    }

    private Ticket requireSellerOpen(UUID shopId, UUID orderId, TicketAction action) {
        return Validate.requireOwned(requireOpen(orderId, action), Ticket::getShopId, shopId, "订单不存在");
    }

    private Ticket requireOpen(UUID orderId, TicketAction action) {
        Ticket ticket = ticketMapper.selectOpenByOrder(orderId);
        Validate.isTrue(ticket != null, 409, action.conflictMessage());
        return ticket;
    }
}

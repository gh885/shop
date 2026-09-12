package com.shop.platform.coupon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.aftersale.model.TicketType;
import com.shop.platform.aftersale.service.AfterSaleService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.coupon.api.CouponBearer;
import com.shop.platform.coupon.api.CouponCommand;
import com.shop.platform.coupon.api.CouponReadQuery;
import com.shop.platform.coupon.api.CouponUnavailableReason;
import com.shop.platform.coupon.dto.CreateCouponTemplateRequest;
import com.shop.platform.coupon.service.CouponClaimService;
import com.shop.platform.coupon.service.CouponTemplateService;
import com.shop.platform.coupon.service.CouponWalletService;
import com.shop.platform.coupon.service.ShopCoupon;
import com.shop.platform.logistics.service.DispatchShipmentCommand;
import com.shop.platform.logistics.service.ShipmentService;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.service.CheckoutPreview;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderTransitionService;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 优惠券一期闭环集成验证（真库）：
 * 领券（限领 / 防超发）→ 结算预览算钱与不可用原因 → 下单占用并落快照 → 支付核销 →
 * 未付款取消释放（券回到手上）→ 已付款取消 / 售后退款补发新券。
 *
 * <p>数据自建自清，不依赖种子数据；券表按 userId / shopId 圈定登记清理。
 * 真实并发下的占用闸门（同一张券被两个事务同时抢）由 api 层的条件更新保证，这里用「重复占用」验证闸门本身。
 */
@SpringBootTest
class CouponFlowIT extends IntegrationTestSupport {

    @Autowired
    private CouponTemplateService couponTemplateService;

    @Autowired
    private CouponClaimService couponClaimService;

    @Autowired
    private CouponWalletService couponWalletService;

    @Autowired
    private CouponReadQuery couponReadQuery;

    @Autowired
    private CouponCommand couponCommand;

    @Autowired
    private OrderService orderService;

    @Autowired
    private OrderTransitionService orderTransitionService;

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private AfterSaleService afterSaleService;

    @Autowired
    private ShipmentService shipmentService;

    private final UUID userId = UUID.randomUUID();

    /** 另一个买家：验证「限量」是按人之外的全局名额，不是每人限领 */
    private final UUID otherUserId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID skuId;

    private UUID addressId;

    /** 建一个在售 SKU（单价 1000 分）并登记清理 */
    private void seed(int stock) {
        // 登记顺序 = 插入顺序（父表在前），purge 逆序执行 → 先删子表
        db.onDelete("DELETE FROM coupon.coupon_templates WHERE shop_id = ?::uuid", shopId.toString());
        db.onDelete("DELETE FROM coupon.user_coupons WHERE shop_id = ?::uuid", shopId.toString());
        db.onDelete("DELETE FROM coupon.coupon_usages WHERE shop_id = ?::uuid", shopId.toString());
        db.onDelete("DELETE FROM payment.payments WHERE user_id = ?::uuid", userId.toString());
        // 售后退款那条用例会先发货：包裹落在 logistics，不登记清理会在重跑时撞运单号唯一索引
        db.onDelete("DELETE FROM logistics.shipments WHERE user_id = ?::uuid", userId.toString());
        db.onDelete(
                "DELETE FROM logistics.tracking_nodes WHERE shipment_id IN (SELECT id FROM logistics.shipments WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete(
                "DELETE FROM orders.items WHERE order_id IN (SELECT id FROM orders.orders WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete("DELETE FROM orders.orders WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM kernel.event_publication WHERE serialized_event LIKE ?", "%" + userId + "%");
        skuId = db.seedOnSaleSku(shopId, 1000, stock);
        addressId = db.seedAddress(userId);
    }

    /** 建模板：满 threshold 减 discount（分），总量 total，此刻生效、7 天后到期 */
    private UUID seedTemplate(long threshold, long discount, int total) {
        OffsetDateTime now = OffsetDateTime.now();
        return couponTemplateService
                .create(
                        shopId,
                        new CreateCouponTemplateRequest(
                                "满%s减%s".formatted(threshold, discount),
                                threshold,
                                discount,
                                total,
                                now.minusMinutes(1),
                                now.plusDays(7)))
                .template()
                .getId();
    }

    private String couponStatus(UUID couponId) {
        return jdbc.queryForObject(
                "SELECT status FROM coupon.user_coupons WHERE id = ?::uuid", String.class, couponId.toString());
    }

    private UUID couponOrderRef(UUID couponId) {
        return jdbc.queryForObject(
                "SELECT order_id FROM coupon.user_coupons WHERE id = ?::uuid", UUID.class, couponId.toString());
    }

    private int usageCount(UUID couponId, String action) {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM coupon.coupon_usages WHERE user_coupon_id = ?::uuid AND action = ?",
                Integer.class,
                couponId.toString(),
                action);
        return n == null ? 0 : n;
    }

    private List<CheckoutPreview.Group> groupsWithCoupon(int quantity, UUID couponId) {
        return orderService
                .preview(userId, new PreviewOrderRequest(addressId, lines(quantity), List.of(couponId)))
                .groups();
    }

    /** 结算行 = 本测试的在售 SKU × 件数（skuId 是实例字段，故这里是实例方法） */
    private List<OrderLineRequest> lines(int quantity) {
        return List.of(new OrderLineRequest(skuId, quantity));
    }

    private Order createOrder(int quantity, UUID couponId) {
        return orderService
                .create(
                        userId,
                        new CreateOrderRequest(
                                UUID.randomUUID(),
                                addressId,
                                List.of(new OrderLineRequest(skuId, quantity)),
                                couponId == null ? null : List.of(couponId),
                                null))
                .getFirst();
    }

    // ========== 领券 ==========

    @Test
    void 领券_进入券包且状态为未使用() {
        seed(5);
        UUID templateId = seedTemplate(0, 500, 10);

        var claimed = couponClaimService.claim(userId, templateId);

        assertNotNull(claimed.coupon().getId());
        assertEquals("满0减500", claimed.coupon().getName());
        assertEquals("UNUSED", claimed.displayStatus().name());
        assertEquals("CLAIM", claimed.coupon().getSource().name());
        // 名额条件扣减生效：已发放数 +1
        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT issued_quantity FROM coupon.coupon_templates WHERE id = ?::uuid",
                        Integer.class,
                        templateId.toString()));
    }

    @Test
    void 重复领同一张券_409且带错误码() {
        seed(5);
        UUID templateId = seedTemplate(0, 500, 10);
        couponClaimService.claim(userId, templateId);

        BusinessException ex =
                assertThrows(BusinessException.class, () -> couponClaimService.claim(userId, templateId));
        assertEquals(409, ex.getHttpStatus());
        assertEquals("COUPON_ALREADY_CLAIMED", ex.getCode());
        // 失败的那次不该白占名额（友好判重挡在扣减之前）
        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT issued_quantity FROM coupon.coupon_templates WHERE id = ?::uuid",
                        Integer.class,
                        templateId.toString()));
    }

    @Test
    void 领完即止_别人也领不到_且不超发() {
        seed(5);
        UUID templateId = seedTemplate(0, 500, 1);
        couponClaimService.claim(userId, templateId);

        BusinessException ex =
                assertThrows(BusinessException.class, () -> couponClaimService.claim(otherUserId, templateId));
        assertEquals(409, ex.getHttpStatus());
        assertTrue(ex.getDetail().contains("领完"));
        // 超发被条件更新闸住：发放数不超过总量
        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT issued_quantity FROM coupon.coupon_templates WHERE id = ?::uuid",
                        Integer.class,
                        templateId.toString()));
    }

    // ========== 预览算钱 ==========

    @Test
    void 预览_达门槛_应付减券额() {
        seed(5);
        UUID couponId = couponClaimService
                .claim(userId, seedTemplate(1500, 300, 10))
                .coupon()
                .getId();

        CheckoutPreview.Group group = groupsWithCoupon(2, couponId).getFirst();

        assertEquals(Money.cny(2000), group.itemAmount());
        assertEquals(Money.cny(300), group.discountAmount());
        assertEquals(Money.cny(1700), group.payAmount());
        assertEquals(couponId, group.appliedCoupon().userCouponId());
    }

    @Test
    void 预览_未达门槛_券不可用且给出原因码() {
        seed(5);
        UUID couponId = couponClaimService
                .claim(userId, seedTemplate(5000, 300, 10))
                .coupon()
                .getId();

        // 没选券时也能看到这张券「为什么不能用」——结算页据此渲染，而不是把它藏起来
        var preview = orderService.preview(userId, new PreviewOrderRequest(addressId, lines(2), null));
        var coupon = preview.groups().getFirst().coupons().getFirst();

        assertEquals(couponId, coupon.userCouponId());
        assertEquals(false, coupon.usable());
        assertEquals(CouponUnavailableReason.THRESHOLD_NOT_MET, coupon.unavailableReason());
        assertEquals(Money.cny(0), preview.groups().getFirst().discountAmount());
    }

    @Test
    void 预览_选了不可用的券_400拒绝而不是静默忽略() {
        seed(5);
        UUID couponId = couponClaimService
                .claim(userId, seedTemplate(5000, 300, 10))
                .coupon()
                .getId();

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> orderService.preview(userId, new PreviewOrderRequest(addressId, lines(2), List.of(couponId))));
        assertEquals(400, ex.getHttpStatus());
        assertTrue(ex.getDetail().contains("门槛"));
    }

    @Test
    void 预览_无门槛券面额超过商品额_封顶到商品额_实付为零不为负() {
        seed(5);
        UUID couponId = couponClaimService
                .claim(userId, seedTemplate(0, 5000, 10))
                .coupon()
                .getId();

        CheckoutPreview.Group group = groupsWithCoupon(1, couponId).getFirst();

        assertEquals(Money.cny(1000), group.discountAmount()); // 1000 而非 5000
        assertEquals(Money.cny(0), group.payAmount());
    }

    // ========== 下单占用与支付核销 ==========

    @Test
    void 下单_占券并落快照_支付后核销() {
        seed(5);
        UUID couponId = couponClaimService
                .claim(userId, seedTemplate(1500, 300, 10))
                .coupon()
                .getId();

        Order order = createOrder(2, couponId);

        // 订单快照：金额与券的可追溯信息一起定格
        assertEquals(2000L, order.getItemAmount());
        assertEquals(300L, order.getDiscountAmount());
        assertEquals(1700L, order.getPayAmount());
        assertEquals(couponId, order.getUserCouponId());
        assertEquals(CouponBearer.SELLER, order.getCouponBearer());
        // 下单只占用，不核销
        assertEquals("LOCKED", couponStatus(couponId));
        assertEquals(order.getId(), couponOrderRef(couponId));
        assertEquals(1, usageCount(couponId, "LOCK"));

        Payment pending = paymentService.pay(userId, order.getId());
        paymentService.confirm(userId, pending.getId());

        // 支付成功即核销（同事务），流水留痕
        assertEquals("USED", couponStatus(couponId));
        assertEquals(1, usageCount(couponId, "USE"));
    }

    @Test
    void 下单_已占用的券不可再用() {
        seed(5);
        UUID couponId = couponClaimService
                .claim(userId, seedTemplate(1500, 300, 10))
                .coupon()
                .getId();
        createOrder(2, couponId);

        // 第二笔单再选同一张券：它已不在「未使用」候选里，落不了地就必须拒绝
        BusinessException ex = assertThrows(BusinessException.class, () -> createOrder(2, couponId));
        assertEquals(400, ex.getHttpStatus());
        assertTrue(ex.getDetail().contains("不可用于本单"));
    }

    @Test
    void 重复占用同一张券_二次占用409() {
        seed(5);
        UUID couponId = couponClaimService
                .claim(userId, seedTemplate(1500, 300, 10))
                .coupon()
                .getId();
        UUID firstOrder = UUID.randomUUID();
        couponCommand.lock(couponId, userId, firstOrder, Money.cny(300));

        // 条件更新的闸门本身：绕过「候选里没有它」的前置判断，直接抢第二次必须失败
        BusinessException ex = assertThrows(
                BusinessException.class, () -> couponCommand.lock(couponId, userId, UUID.randomUUID(), Money.cny(300)));
        assertEquals(409, ex.getHttpStatus());
        assertEquals(firstOrder, couponOrderRef(couponId)); // 占用关系没被后来的抢走
        assertEquals(1, usageCount(couponId, "LOCK")); // 失败的那次不留流水
    }

    @Test
    void 占用_减免额超过券面额_被拒绝() {
        seed(5);
        UUID couponId = couponClaimService
                .claim(userId, seedTemplate(1500, 300, 10))
                .coupon()
                .getId();

        // 面额护栏：调用方算错了不该让券模块买单
        BusinessException ex = assertThrows(
                BusinessException.class, () -> couponCommand.lock(couponId, userId, UUID.randomUUID(), Money.cny(301)));
        assertEquals(400, ex.getHttpStatus());
        assertTrue(ex.getDetail().contains("超过券面额"));
    }

    // ========== 取消：未付款释放 / 已付款补发 ==========

    @Test
    void 未付款取消_券释放回未使用_可再次使用() {
        seed(5);
        UUID couponId = couponClaimService
                .claim(userId, seedTemplate(1500, 300, 10))
                .coupon()
                .getId();
        Order order = createOrder(2, couponId);

        orderTransitionService.cancel(userId, order.getId(), "不想要了");

        // 券回到买家手上：状态与占用痕迹一起清掉，能再用
        assertEquals("UNUSED", couponStatus(couponId));
        assertNull(couponOrderRef(couponId));
        assertEquals(1, usageCount(couponId, "RELEASE"));

        createOrder(2, couponId);
        assertEquals("LOCKED", couponStatus(couponId));
    }

    @Test
    void 已付款取消_券保持已核销_补发一张新券() {
        seed(5);
        UUID couponId = couponClaimService
                .claim(userId, seedTemplate(1500, 300, 10))
                .coupon()
                .getId();
        Order order = createOrder(2, couponId);
        Payment pending = paymentService.pay(userId, order.getId());
        paymentService.confirm(userId, pending.getId());

        orderTransitionService.cancel(userId, order.getId(), "不想要了");

        // 原券仍是 USED（核销不可逆、流水不断链），补偿另发一张
        assertEquals("USED", couponStatus(couponId));
        assertEquals(1, usageCount(couponId, "RETURN"));
        assertEquals(1, (int) jdbc.queryForObject(
                "SELECT count(*) FROM coupon.user_coupons WHERE shop_id = ?::uuid AND source = 'REFUND_RETURN' AND status = 'UNUSED'",
                Integer.class,
                shopId.toString()));
    }

    @Test
    void 售后退款_补发新券() {
        seed(5);
        db.seedShipAddress(shopId);
        UUID couponId = couponClaimService
                .claim(userId, seedTemplate(1500, 300, 10))
                .coupon()
                .getId();
        Order order = createOrder(2, couponId);
        Payment pending = paymentService.pay(userId, order.getId());
        paymentService.confirm(userId, pending.getId());
        shipmentService.dispatch(new DispatchShipmentCommand(shopId, order.getId(), "SF", "SF100"));
        orderTransitionService.receive(userId, order.getId());

        // 仅退款：卖家同意即退款完成
        afterSaleService.apply(userId, order.getId(), TicketType.REFUND_ONLY, "不想要了");
        afterSaleService.agree(shopId, order.getId());

        assertEquals(1, usageCount(couponId, "RETURN"));
        assertEquals(1, (int) jdbc.queryForObject(
                "SELECT count(*) FROM coupon.user_coupons WHERE shop_id = ?::uuid AND source = 'REFUND_RETURN'",
                Integer.class,
                shopId.toString()));
    }

    // ========== 有效期 ==========

    @Test
    void 未开始发放的券_领券被拒且提示可等待() {
        seed(5);
        OffsetDateTime now = OffsetDateTime.now();
        // 明天才开始：领券页也不会列它（selectClaimable 过滤 validFrom），所以「领了但不能用」在一期没有可达路径
        UUID templateId = couponTemplateService
                .create(shopId, new CreateCouponTemplateRequest("预告券", 0L, 300L, 10, now.plusDays(1), now.plusDays(8)))
                .template()
                .getId();

        BusinessException ex =
                assertThrows(BusinessException.class, () -> couponClaimService.claim(userId, templateId));
        assertEquals(400, ex.getHttpStatus());
        assertTrue(ex.getDetail().contains("尚未开始"));
    }

    @Test
    void 已结束发放的券_领券被拒提示已结束() {
        seed(5);
        OffsetDateTime now = OffsetDateTime.now();
        UUID templateId = couponTemplateService
                .create(
                        shopId,
                        new CreateCouponTemplateRequest("过期活动", 0L, 300L, 10, now.minusDays(2), now.minusDays(1)))
                .template()
                .getId();

        BusinessException ex =
                assertThrows(BusinessException.class, () -> couponClaimService.claim(userId, templateId));
        assertEquals(400, ex.getHttpStatus());
        assertTrue(ex.getDetail().contains("已结束"));
    }

    @Test
    void 未生效的券_不进入结算候选() {
        seed(5);
        // 绕过领券的时间窗，直接建一张「已领但尚未生效」的券（一期只能这么造）：
        // 验的是评估器的兜底判定——真出现这种数据时也不能被用掉
        UUID templateId = seedTemplate(0, 300, 10);
        UUID couponId = couponClaimService.claim(userId, templateId).coupon().getId();
        jdbc.update(
                "UPDATE coupon.user_coupons SET effective_at = ? WHERE id = ?::uuid",
                OffsetDateTime.now().plusDays(1),
                couponId.toString());

        var candidates = couponReadQuery.evaluateForShop(userId, shopId, 2000L, "CNY");

        assertEquals(1, candidates.size());
        assertEquals(couponId, candidates.getFirst().userCouponId());
        assertEquals(
                CouponUnavailableReason.NOT_EFFECTIVE, candidates.getFirst().unavailableReason());
    }

    @Test
    void 已过失效时刻的券_不进入结算候选() {
        seed(5);
        UUID templateId = seedTemplate(0, 300, 10);
        UUID couponId = couponClaimService.claim(userId, templateId).coupon().getId();
        // 同理：把失效时刻推到过去，验证「以绝对时间为准」而不是看状态列（状态列还是 UNUSED）
        jdbc.update(
                "UPDATE coupon.user_coupons SET expire_at = ? WHERE id = ?::uuid",
                OffsetDateTime.now().minusSeconds(1),
                couponId.toString());

        var candidates = couponReadQuery.evaluateForShop(userId, shopId, 2000L, "CNY");

        assertEquals(CouponUnavailableReason.EXPIRED, candidates.getFirst().unavailableReason());
        assertEquals("UNUSED", couponStatus(couponId)); // 状态列没被改：正确性不依赖收敛任务
    }

    @Test
    void 退券补偿不受每人限领约束_原券在手也能补发() {
        seed(5);
        UUID templateId = seedTemplate(1500, 300, 10);
        UUID couponId = couponClaimService.claim(userId, templateId).coupon().getId();
        Order order = createOrder(2, couponId);
        Payment pending = paymentService.pay(userId, order.getId());
        paymentService.confirm(userId, pending.getId());
        orderTransitionService.cancel(userId, order.getId(), "不想要了");

        // 补偿券与「每人限领 1 张」的部分唯一索引（只装 CLAIM）不冲突
        assertEquals(2, (int) jdbc.queryForObject(
                "SELECT count(*) FROM coupon.user_coupons WHERE template_id = ?::uuid AND user_id = ?::uuid",
                Integer.class,
                templateId.toString(),
                userId.toString()));
        // 且买家能再次领同一张模板的券？不能——限领看的是 CLAIM 那条
        BusinessException ex =
                assertThrows(BusinessException.class, () -> couponClaimService.claim(userId, templateId));
        assertEquals("COUPON_ALREADY_CLAIMED", ex.getCode());
    }

    // ========== 状态口径与卖家统计 ==========

    @Test
    void 券包未使用页签_收下被未付款单占用的券() {
        seed(5);
        UUID couponId = couponClaimService
                .claim(userId, seedTemplate(1500, 300, 10))
                .coupon()
                .getId();
        createOrder(2, couponId);
        assertEquals("LOCKED", couponStatus(couponId));

        // LOCKED 对用户就是「还没用掉的券」，只是暂时不可选；把它排除掉会让这张券三个页签里都查不到
        var unusedTab = couponWalletService.pageMine(userId, "UNUSED", new PageParams(1, 10));
        assertTrue(unusedTab.records().stream().anyMatch(c -> c.coupon().getId().equals(couponId)));
        // 展示状态如实是「结算中」，不退化成未使用——页签收进来，不代表状态要改口径
        assertEquals(
                "LOCKED",
                unusedTab.records().stream()
                        .filter(c -> c.coupon().getId().equals(couponId))
                        .findFirst()
                        .orElseThrow()
                        .displayStatus()
                        .name());
    }

    @Test
    void 卖家券列表_已核销数只算支付用掉的_占用中不算() {
        seed(5);
        UUID templateId = seedTemplate(1500, 300, 10);
        UUID couponId = couponClaimService.claim(userId, templateId).coupon().getId();

        Order order = createOrder(2, couponId);
        // 领走 1 张、占用 1 张、核销 0 张：卖家看「已发放 1 / 已核销 0」才知道券还没变成订单
        ShopCoupon beforePay = shopCouponOf(templateId);
        assertEquals(1, beforePay.template().getIssuedQuantity());
        assertEquals(0L, beforePay.usedQuantity());

        Payment pending = paymentService.pay(userId, order.getId());
        paymentService.confirm(userId, pending.getId());

        assertEquals(1L, shopCouponOf(templateId).usedQuantity());
    }

    /** 从卖家列表里取指定模板那一行（走真实分页查询，而不是直接数表——顺带覆盖批量统计的拼装） */
    private ShopCoupon shopCouponOf(UUID templateId) {
        return couponTemplateService.pageMine(shopId, new PageParams(1, 20)).records().stream()
                .filter(row -> row.template().getId().equals(templateId))
                .findFirst()
                .orElseThrow();
    }
}

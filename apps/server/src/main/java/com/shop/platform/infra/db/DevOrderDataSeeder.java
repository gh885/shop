package com.shop.platform.infra.db;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/**
 * 开发环境订单种子（{@code @Profile("dev")}，仅 dev 生效，prod 不注册）。
 *
 * <p>为什么落在这里：模块对外 api 只暴露只读查询 + OrderCommand.markPaid/StockCommand，
 * 没有「创建店铺/商品/订单」的命令接口（那些走 controller 上下文），纯领域层 Seeder 搭不起来；
 * 而 JdbcTemplate 架构规则只允许 infra.db 与各模块 api 包引用，故种子放进 infra（OPEN 共享模块）。
 *
 * <p>直接在 DB 层插入合法状态的订单（读现库已有店铺/商品/SKU/用户，不新建主数据），
 * 用确定性 UUID（order_no 派生）+ ON CONFLICT DO NOTHING 幂等：重启不重复、不改表结构。
 * 订单只在展示层消费，无需走状态机；demo 数据不参与真实流转。
 *
 * <p>但「不参与真实流转」不等于可以留下内部矛盾的账：已付款的单必须配一条 payment.payments 成功流水，
 * 否则任何可退款路径（买家取消、卖家同意售后、售后超时自动同意）都会卡在「该订单没有可退款的支付流水」
 * 上——售后那条还是抛异常回滚，于是售后单停回 APPLYING 被定时任务每 30s 重试一次。种子造了订单，
 * 就得把支付流水一并补齐（见 {@link #insertPayment}）。
 *
 * <p>同理，售后单的申请时刻不能一律贴完成时刻：APPLYING 的演示单要落在卖家审核窗口之内，
 * 否则超时任务会把它当成「卖家拖了两天没处理」当场自动同意掉（见 {@link #applied}）。
 *
 * <p>还有一条同源的：待付款演示单的付款截止必须<b>远在</b>未来（见 {@link #payExpire}）。超时关单任务
 * 按 {@code pay_expire_at} 扫到期单，而这些单没有库存冻结行可释放，一旦被扫到就必然抛异常、关不掉，
 * 每 30s 重试一次刷一条 ERROR——「未来」得是整个 dev 生命周期内的未来，不是半小时。
 *
 * <p>仅当存在「正常营业店铺 + 在售且有价 SKU + 至少一个用户」时才种，否则跳过（不打穿空库）。
 */
@Component
@Profile("dev")
@RequiredArgsConstructor
public class DevOrderDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevOrderDataSeeder.class);

    private final JdbcTemplate jdbc;

    private record Sku(
            UUID productId,
            String productName,
            String productImage,
            UUID skuId,
            String skuName,
            String skuImage,
            long price,
            String currency) {}

    private record Spec(String status, String afterSaleStatus, String afterSaleType, String receiverName) {}

    private record Receiver(String name, String phone, String province, String city, String district, String detail) {}

    private static final List<Receiver> RECEIVERS = List.of(
            new Receiver("张伟", "13800138001", "浙江省", "杭州市", "西湖区", "文三路 128 号"),
            new Receiver("李娜", "13900139002", "广东省", "广州市", "天河区", "体育西路 188 号"),
            new Receiver("王强", "13700137003", "江苏省", "南京市", "鼓楼区", "中山北路 66 号"),
            new Receiver("刘敏", "13600136004", "四川省", "成都市", "高新区", "天府大道 999 号"),
            new Receiver("陈静", "13500135005", "湖北省", "武汉市", "洪山区", "珞喻路 152 号"));

    @Override
    public void run(ApplicationArguments args) {
        // 尽力而为：dev 种子失败只记日志，绝不让数据问题阻断应用启动
        try {
            seedOrders();
        } catch (Exception e) {
            log.warn("[dev-seed] 订单种子执行失败（不影响应用启动）：{}", e.getMessage());
        }
    }

    private void seedOrders() {
        // reset + reseed：先清掉历史 DEV 种子单（含更早版本落下的、截止时间已过去的单，
        // 那些会被超时关单任务扫到并因无库存冻结行而报错），确保每次重启落成一致的确定性数据。
        // 注意这条 reset 是「老单的兜底清理」，不是现版本种子的保护伞——现在的种子单截止时间远在未来
        // （见 payExpire），扫不到；靠 reset 兜底等于依赖重启频率，机器挂着不重启就照样进循环。
        jdbc.update(
                "DELETE FROM orders.items WHERE order_id IN (SELECT id FROM orders.orders WHERE order_no LIKE 'DEV%')");
        // 退款单先于订单删：行与执行记录再先于退款单删（无 FK，但顺序反了会留下孤儿行）
        jdbc.update("DELETE FROM aftersale.refund_executions WHERE refund_id IN (SELECT r.id FROM aftersale.refunds r"
                + " JOIN orders.orders o ON o.id = r.order_id WHERE o.order_no LIKE 'DEV%')");
        jdbc.update("DELETE FROM aftersale.refund_lines WHERE refund_id IN (SELECT r.id FROM aftersale.refunds r"
                + " JOIN orders.orders o ON o.id = r.order_id WHERE o.order_no LIKE 'DEV%')");
        jdbc.update(
                "DELETE FROM aftersale.refunds WHERE order_id IN (SELECT id FROM orders.orders WHERE order_no LIKE 'DEV%')");
        // 支付流水排在订单前删：payments 没有 FK，订单先走就会留下一批指向不存在订单的孤儿流水
        jdbc.update(
                "DELETE FROM payment.payments WHERE order_id IN (SELECT id FROM orders.orders WHERE order_no LIKE 'DEV%')");
        jdbc.update("DELETE FROM orders.orders WHERE order_no LIKE 'DEV%'");
        jdbc.update("DELETE FROM orders.trades WHERE trade_no LIKE 'DEVT%'");

        UUID shopId = firstActiveShop();
        if (shopId == null) {
            log.info("[dev-seed] 跳过订单种子：没有正常营业店铺");
            return;
        }
        List<Sku> skus = shopPricedSkus(shopId);
        if (skus.isEmpty()) {
            log.info("[dev-seed] 跳过订单种子：该店铺无「在售且有价」的 SKU");
            return;
        }
        List<UUID> buyerIds =
                jdbc.queryForList("SELECT id FROM account.users ORDER BY created_at LIMIT 12", UUID.class);
        if (buyerIds.isEmpty()) {
            log.info("[dev-seed] 跳过订单种子：无买家用户");
            return;
        }

        int inserted = 0;
        for (Spec spec : specs()) {
            inserted += insertOrder(spec, shopId, skus, buyerIds);
        }
        log.info("[dev-seed] 订单种子完成：新增 {} 笔订单（幂等，已存在则跳过）", inserted);
    }

    private UUID firstActiveShop() {
        List<UUID> ids = jdbc.queryForList(
                "SELECT id FROM shop.shops WHERE status = 'ACTIVE' ORDER BY created_at LIMIT 1", UUID.class);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private List<Sku> shopPricedSkus(UUID shopId) {
        RowMapper<Sku> mapper = (rs, _) -> new Sku(
                rs.getObject("product_id", UUID.class),
                rs.getString("product_name"),
                rs.getString("product_image"),
                rs.getObject("sku_id", UUID.class),
                rs.getString("sku_name"),
                rs.getString("sku_image"),
                rs.getLong("price"),
                rs.getString("currency"));
        return jdbc.query(
                """
                SELECT p.id AS product_id, p.name AS product_name, p.main_image AS product_image,
                       s.id AS sku_id, s.name AS sku_name, s.image AS sku_image,
                       s.price AS price, s.currency AS currency
                FROM product.products p
                JOIN product.skus s ON s.product_id = p.id
                WHERE p.shop_id = ? AND p.status = 'PUBLISHED' AND s.status = 'ON_SALE' AND s.price IS NOT NULL
                ORDER BY p.created_at, s.price
                LIMIT 60
                """,
                mapper,
                shopId);
    }

    /** 待种订单形态：状态 + 售后（售后只挂 COMPLETED），配合时间回填，覆盖列表所有展示域 */
    private List<Spec> specs() {
        return List.of(
                new Spec("PENDING_PAYMENT", "NONE", null, "张伟"),
                new Spec("PENDING_PAYMENT", "NONE", null, "李娜"),
                new Spec("PAID", "NONE", null, "王强"),
                new Spec("PAID", "NONE", null, "刘敏"),
                new Spec("PAID", "NONE", null, "陈静"),
                new Spec("PAID", "NONE", null, "张伟"),
                new Spec("PAID", "NONE", null, "李娜"),
                new Spec("SHIPPED", "NONE", null, "王强"),
                new Spec("SHIPPED", "NONE", null, "刘敏"),
                new Spec("SHIPPED", "NONE", null, "陈静"),
                new Spec("COMPLETED", "NONE", null, "张伟"),
                new Spec("COMPLETED", "NONE", null, "李娜"),
                new Spec("COMPLETED", "NONE", null, "王强"),
                new Spec("COMPLETED", "APPLYING", "REFUND_ONLY", "刘敏"),
                new Spec("COMPLETED", "APPLYING", "RETURN_REFUND", "陈静"),
                new Spec("COMPLETED", "RETURNING", "RETURN_REFUND", "张伟"),
                new Spec("COMPLETED", "REFUNDED", "REFUND_ONLY", "李娜"),
                new Spec("COMPLETED", "REFUNDED", "RETURN_REFUND", "王强"),
                new Spec("COMPLETED", "REJECTED", "REFUND_ONLY", "刘敏"),
                new Spec("COMPLETED", "REJECTED", "RETURN_REFUND", "陈静"),
                new Spec("CANCELLED", "NONE", null, "张伟"),
                new Spec("CANCELLED", "NONE", null, "王强"));
    }

    private int insertOrder(Spec spec, UUID shopId, List<Sku> skus, List<UUID> buyerIds) {
        // 用确定性 seedKey（String.hashCode）而非 record.hashCode：后者带随机盐，跨重启不稳定会破坏幂等
        int index = seedKey(spec);
        UUID buyer = buyerIds.get(index % buyerIds.size());
        Receiver receiver = RECEIVERS.get(index % RECEIVERS.size());
        int daysAgo = 1 + (index % 30);
        Instant createdAt = created(spec, daysAgo);

        // 每单 1-3 个不同 SKU；价格取 SKU 当前价（demo，不做折扣）
        int itemCount = Math.min(1 + (index % 3), skus.size());
        int offset = index % skus.size();
        long itemAmount = 0;
        List<Object[]> itemInserts = new ArrayList<>();
        Set<UUID> used = new HashSet<>();
        for (int i = 0; i < itemCount; i++) {
            Sku s = skus.get((offset + i) % skus.size());
            if (!used.add(s.skuId())) continue; // 同单同 SKU 会撞唯一索引，跳过
            int qty = 1 + ((index + i) % 3);
            long amount = s.price() * qty;
            itemAmount += amount;
            int shippedQuantity =
                    spec.status().equals("SHIPPED") || spec.status().equals("COMPLETED") ? qty : 0;
            itemInserts.add(new Object[] {
                UUID.nameUUIDFromBytes((orderId(spec) + "-" + s.skuId()).getBytes()),
                orderId(spec),
                s.productId(),
                s.skuId(),
                skuDisplayName(s),
                firstNonBlank(s.skuImage(), s.productImage()),
                s.price(),
                s.currency(),
                qty,
                amount,
                amount, // goods_paid_amount = amount - 0
                amount, // refundable_amount = goods_paid + 0
                shippedQuantity,
                shippedQuantity, // settled_quantity
                ts(createdAt), // 行项 created_at 与订单同源（不能用 paidAt：待付款/已取消为 null）
            });
        }

        Instant payExpire = payExpire();

        // 主订单先落：子订单的 trade_id 非空；一张演示单对应一张主订单（单店结算）
        try {
            jdbc.update(
                    tradeSql(),
                    tradeId(spec),
                    tradeNo(spec),
                    buyer,
                    tradeStatus(spec),
                    spec.status().equals("CANCELLED") ? "PAY_TIMEOUT" : null,
                    itemAmount,
                    itemAmount,
                    isPaid(spec) ? itemAmount : 0L,
                    "REFUNDED".equals(spec.afterSaleStatus()) ? itemAmount : 0L,
                    receiver.name(),
                    receiver.phone(),
                    "000000",
                    receiver.province(),
                    receiver.city(),
                    receiver.district(),
                    receiver.detail(),
                    buyerMessage(index),
                    ts(payExpire),
                    ts(paidAt(spec, daysAgo)),
                    ts(spec.status().equals("CANCELLED") ? createdAt.plus(1, ChronoUnit.HOURS) : null),
                    checkoutKey(spec),
                    ts(createdAt),
                    ts(createdAt));
        } catch (Exception e) {
            log.warn("[dev-seed] 插入主订单 {} 失败：{}", tradeNo(spec), e.getMessage());
            return 0;
        }

        int affected;
        try {
            affected = jdbc.update(
                    orderSql(),
                    orderId(spec),
                    orderNo(spec),
                    buyer,
                    shopId,
                    tradeId(spec),
                    orderStatus(spec),
                    itemAmount,
                    itemAmount,
                    logistics(spec),
                    tracking(spec),
                    ts(paidAt(spec, daysAgo)),
                    ts(shipped(spec, daysAgo)),
                    ts(completed(spec, daysAgo)),
                    ts(spec.status().equals("CANCELLED") ? createdAt.plus(1, ChronoUnit.HOURS) : null),
                    spec.status().equals("CANCELLED") ? "买家超时未支付，系统自动关闭" : null,
                    ts(spec.status().equals("PAID") ? Instant.now().plus(3, ChronoUnit.DAYS) : null),
                    ts(createdAt),
                    ts(createdAt),
                    badge(spec),
                    ts(
                            completed(spec, daysAgo) != null && !"NONE".equals(spec.afterSaleStatus())
                                    ? createdAt.plus(15, ChronoUnit.DAYS)
                                    : null),
                    ts(shipped(spec, daysAgo) != null ? Instant.now().plus(10, ChronoUnit.DAYS) : null));
        } catch (Exception e) {
            log.warn("[dev-seed] 插入订单 {} 失败：{}", orderNo(spec), e.getMessage());
            return 0;
        }
        // 行项只在订单已存在时插入（ON CONFLICT DO NOTHING）：既覆盖新单，也自愈旧版残留的有单缺行项情况；
        // 不 gate 在 affected>0 上——否则该订单若是更早版本成功落单但行项失败，永远补不回来。
        boolean orderExists = affected > 0
                || Boolean.TRUE.equals(jdbc.queryForObject(
                        "SELECT EXISTS(SELECT 1 FROM orders.orders WHERE id = ?)", Boolean.class, orderId(spec)));
        if (orderExists) {
            for (Object[] params : itemInserts) {
                jdbc.update(itemSql(), params);
            }
        }
        // 支付流水：订单是直插的，可退款路径（订单取消 / 售后同意）却要靠 payment.payments 里的成功流水
        // 才退得动——缺了这一行，售后超时任务的自动同意会一路抛「该订单没有可退款的支付流水」并整笔回滚，
        // 那张售后单就永远停在 APPLYING、每 30s 重试一次刷一条 ERROR。种子自己造的单，流水也得自己补。
        if (affected > 0 && isPaid(spec)) {
            insertPayment(spec, daysAgo, buyer, itemAmount);
        }
        // 退款单：orders 上只剩角标投影，单据本体在 aftersale.refunds（直插一张对应状态的单 + 逐行款项）。
        // 演示数据也要能解释「为什么这张单挂着退款中 / 已退款」——状态映射与角标映射各自收在方法里。
        if (affected > 0 && !"NONE".equals(spec.afterSaleStatus())) {
            UUID refundId = UUID.nameUUIDFromBytes(("refund:" + orderNo(spec)).getBytes());
            String status = refundStatus(spec);
            Timestamp applied = ts(applied(spec, daysAgo));
            Timestamp succeeded = ts(afterSaleRefunded(spec, daysAgo));
            boolean open = "REFUNDING".equals(badge(spec));
            jdbc.update(
                    "INSERT INTO aftersale.refunds (id, trade_id, order_id, user_id, shop_id, refund_no, type, amount,"
                            + " currency, status, reason, reason_code, no_reason_enforced, succeeded_at, agreed_at,"
                            + " created_at, updated_at)"
                            + " VALUES (?,?,?,?,?,?,?,?,'CNY',?,?, 'QUALITY_ISSUE', FALSE, ?,?,?,?) ON CONFLICT DO NOTHING",
                    refundId,
                    tradeId(spec),
                    orderId(spec),
                    buyer,
                    shopId,
                    "DEMORF" + seedKey(spec),
                    spec.afterSaleType(),
                    itemAmount,
                    status,
                    "演示退款：商品与描述不符",
                    succeeded,
                    "PENDING".equals(status) ? null : applied,
                    applied,
                    applied);
            for (Object[] params : itemInserts) {
                jdbc.update(
                        "INSERT INTO aftersale.refund_lines (id, refund_id, order_item_id, line_type, quantity, amount,"
                                + " currency, active, created_at) VALUES (?,?,?,'ITEM',?,?,'CNY',?,?) ON CONFLICT DO NOTHING",
                        UUID.nameUUIDFromBytes(("refund-line:" + params[0]).getBytes()),
                        refundId,
                        params[0],
                        params[9],
                        params[10],
                        open,
                        applied);
            }
        }
        // 销量投影：直插的已完成单不经 OrderTransitionService，补一笔 products.sold_count（只对本次新插入的单，重启不重复累加）
        if (affected > 0 && spec.status().equals("COMPLETED")) {
            for (Object[] params : itemInserts) {
                jdbc.update(
                        "UPDATE product.products SET sold_count = sold_count + ? WHERE id = ?", params[8], params[2]);
            }
        }
        return affected;
    }

    // 确定性 key：order_no 派生 UUID，天然幂等
    private UUID orderId(Spec spec) {
        return UUID.nameUUIDFromBytes(("orders:" + orderNo(spec)).getBytes());
    }

    private String orderNo(Spec spec) {
        return String.format("DEV%s-%05d", baseDay(), seedKey(spec));
    }

    /** 演示单一张主订单：确定性 UUID，重置时按 trade_no 前缀清理 */
    private UUID tradeId(Spec spec) {
        return UUID.nameUUIDFromBytes(("trades:" + orderNo(spec)).getBytes());
    }

    private String tradeNo(Spec spec) {
        return String.format("DEVT%s-%05d", baseDay(), seedKey(spec));
    }

    private UUID checkoutKey(Spec spec) {
        return UUID.nameUUIDFromBytes(("checkout:" + orderNo(spec)).getBytes());
    }

    /** 子订单没有待付款态：「待付款」演示单落成待发货 + paid_at 为空，支付生死在主订单 */
    private String orderStatus(Spec spec) {
        return spec.status().equals("PENDING_PAYMENT") ? "PAID" : spec.status();
    }

    private String tradeStatus(Spec spec) {
        return switch (spec.status()) {
            case "PENDING_PAYMENT" -> "PENDING_PAYMENT";
            case "CANCELLED" -> "CLOSED";
            default -> "PAID";
        };
    }

    /** 已付款单才有流水可退：待付款没付过，已取消的取消原因也写着「超时未支付」 */
    private boolean isPaid(Spec spec) {
        return switch (spec.status()) {
            case "PAID", "SHIPPED", "COMPLETED" -> true;
            default -> false;
        };
    }

    /**
     * 补一条成功流水，金额与订单 pay_amount 同源（演示单不打折，两者都取行项合计）。
     *
     * <p>售后已退款的演示单落成 REFUNDED：否则一张「已经退过款」的单上还挂着一笔可退的成功流水，
     * 数据自相矛盾，退款路径也可能照着它再退一次。
     */
    private void insertPayment(Spec spec, int daysAgo, UUID buyer, long amount) {
        boolean refunded = "REFUNDED".equals(spec.afterSaleStatus());
        UUID paymentId = UUID.nameUUIDFromBytes(("payments:" + orderNo(spec)).getBytes());
        jdbc.update(
                "INSERT INTO payment.payments (id, trade_id, order_id, order_no, user_id, amount, currency, channel, status,"
                        + " paid_at, created_at, refunded_at, refund_gateway_no, refunded_amount)"
                        + " VALUES (?,?,?,?,?,?,'CNY','MOCK',?,?,?,?,?,?) ON CONFLICT DO NOTHING",
                paymentId,
                tradeId(spec),
                orderId(spec),
                orderNo(spec),
                buyer,
                amount,
                refunded ? "REFUNDED" : "SUCCESS",
                ts(paidAt(spec, daysAgo)),
                ts(paidAt(spec, daysAgo)),
                ts(refunded ? afterSaleRefunded(spec, daysAgo) : null),
                refunded ? "MOCK-REFUND-" + paymentId : null,
                refunded ? amount : 0L);
    }

    private int seedKey(Spec spec) {
        return (spec.status() + "-" + spec.afterSaleStatus() + "-" + spec.receiverName()).hashCode() & 0x7fffffff;
    }

    /**
     * 单号里的日期段：昨天。
     *
     * <p>用 {@link LocalDate} 而不是 {@code OffsetDateTime}：{@code BASIC_ISO_DATE} 对带偏移量的 temporal
     * 会把偏移量一并格式化出来（{@code OffsetDateTime.now()} 在 +08 时区下给出 {@code 20261006+0800}），
     * 单号就成了 {@code DEV20261006+0800-397392974}——原先那句 {@code .replace("-", "")} 正是为了擦掉
     * 这个不该出现的偏移量，但它擦不掉（偏移量是 {@code +0800}，没有连字符）。日期本来就不带时区，
     * 换 LocalDate 从源头上不产生偏移量，那句 replace 随之删掉。
     */
    private String baseDay() {
        return LocalDate.now().minusDays(1).format(DateTimeFormatter.BASIC_ISO_DATE);
    }

    private String orderSql() {
        return """
                INSERT INTO orders.orders
                  (id, order_no, user_id, shop_id, trade_id, status, item_amount, shipping_fee, discount_amount,
                   pay_amount, currency, logistics_company, tracking_no, paid_at, shipped_at, completed_at,
                   cancelled_at, cancel_reason, ship_expire_at, created_at, updated_at, after_sale_badge,
                   apply_expire_at, receive_expire_at)
                VALUES (?,?,?,?,?,?,?,0,0,?,'CNY',?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT DO NOTHING
                """;
    }

    private String tradeSql() {
        return """
                INSERT INTO orders.trades
                  (id, trade_no, user_id, status, closed_reason, item_amount, shipping_fee, discount_amount,
                   pay_amount, paid_amount, refunded_amount, compensated_amount, currency,
                   receiver_name, receiver_phone, receiver_region_code, receiver_province, receiver_city,
                   receiver_district, receiver_detail, buyer_message, pay_expire_at, paid_at, closed_at,
                   checkout_key, created_at, updated_at)
                VALUES (?,?,?,?,?,?,0,0,?,?,?,0,'CNY',?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT DO NOTHING
                """;
    }

    private String itemSql() {
        return "INSERT INTO orders.items (id, order_id, product_id, sku_id, name, image, price, original_price,"
                + " currency, quantity, amount, discount_allocated, shipping_allocated, goods_paid_amount,"
                + " refundable_amount, shipped_quantity, refunded_quantity, settled_quantity, refunded_amount,"
                + " seven_day_return, created_at)"
                + " VALUES (?,?,?,?,?,?,?,NULL,?,?,?,0,0,?,?,?,0,?,0,TRUE,?) ON CONFLICT DO NOTHING";
    }

    private String skuDisplayName(Sku s) {
        return s.skuName() == null || s.skuName().isBlank() ? s.productName() : s.skuName();
    }

    private String firstNonBlank(String a, String b) {
        return a != null && !a.isBlank() ? a : b;
    }

    private String buyerMessage(int index) {
        return switch (index % 4) {
            case 0 -> "请尽快发货，谢谢！";
            case 1 -> "放门口就行";
            default -> null;
        };
    }

    private String logistics(Spec spec) {
        return spec.status().equals("SHIPPED") || spec.status().equals("COMPLETED") ? "顺丰速运" : null;
    }

    private String tracking(Spec spec) {
        return spec.status().equals("SHIPPED") || spec.status().equals("COMPLETED")
                ? "SF" + String.format("%011d", seedKey(spec) % 1000000000L)
                : null;
    }

    private Long afterSaleRefund(Spec spec, long itemAmount) {
        return "REFUNDED".equals(spec.afterSaleStatus()) ? itemAmount : null;
    }

    /** 演示售后状态 → 退款单十态（旧演示词表只表达「进行中 / 已退 / 被拒 / 撤销」四类结果） */
    private String refundStatus(Spec spec) {
        return switch (spec.afterSaleStatus()) {
            case "APPLYING" -> "PENDING";
            case "RETURNING" -> "RETURN_PENDING";
            case "REFUNDED" -> "REFUNDED";
            case "REJECTED" -> "REJECTED";
            case "CLOSED" -> "CANCELLED";
            default -> "PENDING";
        };
    }

    /** 演示订单的售后角标：进行中挂退款中、退完挂已退款，其余不挂 */
    private String badge(Spec spec) {
        return switch (spec.afterSaleStatus()) {
            case "APPLYING", "RETURNING" -> "REFUNDING";
            case "REFUNDED" -> "REFUNDED";
            default -> "NONE";
        };
    }

    private Instant created(Spec spec, int daysAgo) {
        return Instant.now().minus(daysAgo, ChronoUnit.DAYS).minus(seedKey(spec) % 24, ChronoUnit.HOURS);
    }

    /**
     * 演示单的付款截止：远在未来。
     *
     * <p>直接插单没有配套的库存冻结行（真实下单会在 {@code StockCommand.freeze} 里把 frozen_stock 加上、
     * 并落一条 FREEZE 流水），而超时关单的落点是 {@code closeUnpaid → StockCommand.release}：它要求冻结量
     * 足够才放行，种子单必然不够，于是抛「订单库存冻结状态异常，请联系客服」令整笔回滚——这张单永远关不掉，
     * 被 {@code OrderTimeoutJob} 每 30s 重扫一次、每轮刷一条 ERROR。
     *
     * <p>所以唯一安全的做法是让扫描线<b>够不着</b>它。原先写死 {@code now + 30 分钟} 也是这个意图
     * （注释原话「截止时间一律设在未来」），但 30 分钟对跑几天的 dev 进程等于没有：实测 05:42 种下，
     * 08:40 机器唤醒后首次扫到，25 分钟内刷了 50 轮。演示单本就只在展示层消费、不参与真实流转，
     * 这里给足 30 天，让它在一整个 dev 生命周期内都不越线（每次重启 reset 还会重新铺一遍）。
     *
     * <p><b>为什么不给种子补冻结库存行</b>：这些 SKU 是真实 dev 数据、与手工测试共用，种子去写
     * {@code frozen_stock} 就得在 reset 时精确回补——一旦某轮没等到关单进程就退出，冻结量会持续泄漏，
     * 最后撞 DB 的 {@code frozen_stock <= stock} 检查，把种子自己搞崩。展示层数据的账，不拿真实库存去平。
     */
    private Instant payExpire() {
        return Instant.now().plus(30, ChronoUnit.DAYS);
    }

    private Instant paidAt(Spec spec, int daysAgo) {
        if (spec.status().equals("PENDING_PAYMENT") || spec.status().equals("CANCELLED")) return null;
        return created(spec, daysAgo).plus(5, ChronoUnit.MINUTES);
    }

    private Instant shipped(Spec spec, int daysAgo) {
        return switch (spec.status()) {
            case "SHIPPED", "COMPLETED" -> paidAt(spec, daysAgo).plus((seedKey(spec) % 20) + 4, ChronoUnit.HOURS);
            default -> null;
        };
    }

    private Instant completed(Spec spec, int daysAgo) {
        return spec.status().equals("COMPLETED")
                ? shipped(spec, daysAgo).plus((seedKey(spec) % 3) + 1, ChronoUnit.DAYS)
                : null;
    }

    /**
     * 售后单的申请时刻（同时是那条 APPLY 事件的时刻）。
     *
     * <p>APPLYING 是「正等卖家处理」的演示单，必须落在卖家审核窗口（48h）<b>之内</b>：照旧沿用
     * {@code completed(...)} 会把它摆到十几天前，售后超时任务一启动就把它自动同意掉——演示用的待办行
     * 当场消失。其余状态是「已经走完某一步」的历史单，申请时刻贴完成时刻，时间线才连贯。
     */
    private Instant applied(Spec spec, int daysAgo) {
        return "APPLYING".equals(spec.afterSaleStatus())
                ? Instant.now().minus((seedKey(spec) % 40) + 1, ChronoUnit.HOURS)
                : completed(spec, daysAgo);
    }

    private Instant afterSaleRefunded(Spec spec, int daysAgo) {
        return "REFUNDED".equals(spec.afterSaleStatus())
                ? completed(spec, daysAgo).plus((seedKey(spec) % 3) + 1, ChronoUnit.DAYS)
                : null;
    }

    private Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}

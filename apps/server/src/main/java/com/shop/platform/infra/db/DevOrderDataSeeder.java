package com.shop.platform.infra.db;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
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
        jdbc.update(
                "DELETE FROM orders.items WHERE order_id IN (SELECT id FROM orders.orders WHERE order_no LIKE 'DEV%')");
        jdbc.update("DELETE FROM aftersale.ticket_events WHERE ticket_id IN (SELECT t.id FROM aftersale.tickets t"
                + " JOIN orders.orders o ON o.id = t.order_id WHERE o.order_no LIKE 'DEV%')");
        jdbc.update(
                "DELETE FROM aftersale.tickets WHERE order_id IN (SELECT id FROM orders.orders WHERE order_no LIKE 'DEV%')");
        jdbc.update("DELETE FROM orders.orders WHERE order_no LIKE 'DEV%'");

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
                ts(createdAt), // 行项 created_at 与订单同源（不能用 paidAt：待付款/已取消为 null）
            });
        }

        // 截止时间一律设在未来：直接插单没有对应的库存冻结/回补行，过去的截止时间会被超时关单任务扫到并报错
        Instant payExpire = Instant.now().plus(30, ChronoUnit.MINUTES);

        int affected;
        try {
            affected = jdbc.update(
                    orderSql(),
                    orderId(spec),
                    orderNo(spec),
                    buyer,
                    shopId,
                    spec.status(),
                    itemAmount,
                    itemAmount,
                    "CNY",
                    receiver.name(),
                    receiver.phone(),
                    receiver.province(),
                    receiver.city(),
                    receiver.district(),
                    receiver.detail(),
                    buyerMessage(index),
                    logistics(spec),
                    tracking(spec),
                    ts(paidAt(spec, daysAgo)),
                    ts(shipped(spec, daysAgo)),
                    ts(completed(spec, daysAgo)),
                    ts(spec.status().equals("CANCELLED") ? createdAt.plus(1, ChronoUnit.HOURS) : null),
                    spec.status().equals("CANCELLED") ? "买家超时未支付，系统自动关闭" : null,
                    ts(payExpire),
                    ts(createdAt),
                    ts(createdAt),
                    spec.afterSaleStatus(),
                    afterSaleRefund(spec, itemAmount),
                    ts(
                            completed(spec, daysAgo) != null && !"NONE".equals(spec.afterSaleStatus())
                                    ? createdAt.plus(15, ChronoUnit.DAYS)
                                    : null),
                    ts(spec.status().equals("PAID") ? Instant.now().plus(3, ChronoUnit.DAYS) : null),
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
        // 售后单：orders 上只剩投影列，单据本体在 aftersale.tickets（直插一张对应状态的单 + 一条申请时间线）
        if (affected > 0 && !"NONE".equals(spec.afterSaleStatus())) {
            UUID ticketId = UUID.nameUUIDFromBytes(("aftersale:" + orderNo(spec)).getBytes());
            Timestamp applied = ts(completed(spec, daysAgo));
            jdbc.update(
                    "INSERT INTO aftersale.tickets (id, order_id, user_id, shop_id, type, status, reason, refund_amount, currency,"
                            + " refunded_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,'CNY',?,?,?) ON CONFLICT DO NOTHING",
                    ticketId,
                    orderId(spec),
                    buyer,
                    shopId,
                    spec.afterSaleType(),
                    spec.afterSaleStatus(),
                    "演示售后：商品与描述不符",
                    itemAmount,
                    ts(afterSaleRefunded(spec, daysAgo)),
                    applied,
                    applied);
            jdbc.update(
                    "INSERT INTO aftersale.ticket_events (ticket_id, actor, action, note, created_at) VALUES (?,'BUYER','APPLY',?,?)",
                    ticketId,
                    "演示售后：商品与描述不符",
                    applied);
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

    private int seedKey(Spec spec) {
        return (spec.status() + "-" + spec.afterSaleStatus() + "-" + spec.receiverName()).hashCode() & 0x7fffffff;
    }

    private String baseDay() {
        return OffsetDateTime.now()
                .minusDays(1)
                .format(DateTimeFormatter.BASIC_ISO_DATE)
                .replace("-", "");
    }

    private String orderSql() {
        return """
                INSERT INTO orders.orders
                  (id, order_no, user_id, shop_id, status, item_amount, shipping_fee, pay_amount, currency,
                   receiver_name, receiver_phone, receiver_province, receiver_city, receiver_district, receiver_detail,
                   buyer_message, logistics_company, tracking_no, paid_at, shipped_at, completed_at, cancelled_at,
                   cancel_reason, pay_expire_at, created_at, updated_at, after_sale_status,
                   refund_amount, apply_expire_at, ship_expire_at, receive_expire_at)
                VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT DO NOTHING
                """;
    }

    private String itemSql() {
        return "INSERT INTO orders.items (id, order_id, product_id, sku_id, name, image, price, original_price,"
                + " currency, quantity, amount, created_at) VALUES (?,?,?,?,?,?,?,NULL,?,?,?,?) ON CONFLICT DO NOTHING";
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

    private Instant created(Spec spec, int daysAgo) {
        return Instant.now().minus(daysAgo, ChronoUnit.DAYS).minus(seedKey(spec) % 24, ChronoUnit.HOURS);
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

    private Instant afterSaleRefunded(Spec spec, int daysAgo) {
        return "REFUNDED".equals(spec.afterSaleStatus())
                ? completed(spec, daysAgo).plus((seedKey(spec) % 3) + 1, ChronoUnit.DAYS)
                : null;
    }

    private Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}

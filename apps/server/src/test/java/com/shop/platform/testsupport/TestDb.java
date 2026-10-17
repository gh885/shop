package com.shop.platform.testsupport;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 真库集成测试的数据登记表：谁建的数谁登记，结束统一清。
 *
 * <p>用法：种子数据走 {@code seedXxx}（自动登记清理）；service 调用产生的数据在建出后立即
 * {@link #onDelete} 登记（按自有 ID/UUID 圈定）。{@link #purge()} 由
 * {@link IntegrationTestSupport} 在 {@code @AfterEach} 调用，按登记逆序执行——所以
 * <b>登记顺序 = 插入顺序（父表在前）</b>，逆序删除天然先子后父。删除幂等，重复登记无害。
 *
 * <p>不用 {@code @Transactional} 回滚：AFTER_COMMIT 监听、Modulith outbox 登记这类
 * 提交期行为只有在真提交下才验得到，回滚反而制造假绿。
 */
public final class TestDb {

    private record Cleanup(String sql, Object[] args) {}

    private final JdbcTemplate jdbc;

    private final Deque<Cleanup> cleanups = new ArrayDeque<>();

    public TestDb(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 登记一条清理 DELETE（登记顺序 = 插入顺序，父表在前；purge 时逆序执行）。 */
    public void onDelete(String sql, Object... args) {
        cleanups.addLast(new Cleanup(sql, args));
    }

    /** AfterEach 统一入口：逆序执行所有登记的删除（幂等，行不在则删 0 行）。 */
    public void purge() {
        var c = cleanups.pollLast();
        while (c != null) {
            jdbc.update(c.sql(), c.args());
            c = cleanups.pollLast();
        }
    }

    // 常用种子（自动登记清理）
    /**
     * 造一家指定状态的店铺（status 传 {@code ShopStatus.name()}：ACTIVE / PENDING_REVIEW / REJECTED / DISABLED）。
     *
     * <p>下单与加购有营业闸门（{@code ShopReadQuery.isActive}），交易相关用例的 shopId 必须在 shop.shops 有行；
     * 店主与店名都是占位派生值（店名有全局唯一索引，按 shopId 取唯一后缀）。
     */
    public UUID seedShop(UUID shopId, String status) {
        jdbc.update(
                "INSERT INTO shop.shops (id, owner_id, name, status) VALUES (?::uuid, ?::uuid, ?, ?)",
                shopId.toString(),
                UUID.randomUUID().toString(),
                "测试店-" + shopId,
                status);
        onDelete("DELETE FROM shop.shops WHERE id = ?::uuid", shopId.toString());
        return shopId;
    }

    /** 造一家 ACTIVE 店铺（已存在则原样保留，便于与 {@link #seedOnSaleSku} 的隐式造店共存）。 */
    public UUID seedActiveShop(UUID shopId) {
        jdbc.update(
                "INSERT INTO shop.shops (id, owner_id, name, status) VALUES (?::uuid, ?::uuid, ?, 'ACTIVE') ON CONFLICT (id) DO NOTHING",
                shopId.toString(),
                UUID.randomUUID().toString(),
                "测试店-" + shopId);
        onDelete("DELETE FROM shop.shops WHERE id = ?::uuid", shopId.toString());
        return shopId;
    }

    /**
     * 登记「一家店 + 它名下的成员与评价」（按 shopId 圈定，店是父表所以先登记 → purge 时最后删）。
     *
     * <p>三张表之间没有外键（schema 隔离），漏一张不会报错，只会在重跑时撞 {@code uk_shop_members_shop_user}
     * 这类唯一索引。凡自己 {@code createShop} 出店、又动了成员或评价的用例都要登记这一套。
     */
    public void onDeleteShopSide(UUID shopId) {
        String id = shopId.toString();
        onDelete("DELETE FROM shop.shops WHERE id = ?::uuid", id);
        onDelete("DELETE FROM shop.shop_members WHERE shop_id = ?::uuid", id);
        onDelete("DELETE FROM account.shop_subaccounts WHERE shop_id = ?::uuid", id);
        onDelete("DELETE FROM shop.shop_reviews WHERE shop_id = ?::uuid", id);
    }

    /**
     * 子账号凭证行（登录名 + 手机号 + 口令哈希 + 状态 + 权限码）。
     *
     * <p>口令哈希由调用方给（IT 里注入 {@code PasswordEncoder} 现算）——账号域的口令策略是 BCrypt，
     * 在测试里塞一个假串会让「登录失败」与「哈希不合法」混成同一件事，那种用例测不出东西。
     */
    public UUID seedSubaccount(
            UUID shopId, String loginName, String phone, String status, String passwordHash, String permissionsJson) {
        UUID id = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO account.shop_subaccounts (id, shop_id, login_name, password_hash, phone, status, permissions, verified_at) "
                        + "VALUES (?::uuid, ?::uuid, ?, ?, ?, ?, ?::jsonb, ?)",
                id.toString(),
                shopId.toString(),
                loginName,
                passwordHash,
                phone,
                status,
                permissionsJson == null ? "[]" : permissionsJson,
                "ACTIVE".equals(status) ? java.time.OffsetDateTime.now() : null);
        onDelete("DELETE FROM account.shop_subaccounts WHERE id = ?::uuid", id.toString());
        return id;
    }

    /**
     * 店的一个成员行（{@code role} 传 OWNER/MEMBER、{@code status} 传 MemberStatus 的 name；不写 permissions
     * 即落 DB 默认的空覆盖集，判权走角色那份）。
     */
    public UUID seedShopMember(UUID shopId, UUID userId, String role, String status) {
        return insertShopMember(shopId, userId, role, status, null);
    }

    /** 带权限覆盖的成员行——{@code permissions} 是 jsonb 字面量，逐码判权的用例要的就是这一列。 */
    public UUID seedShopMember(UUID shopId, UUID userId, String role, String status, String permissionsJson) {
        return insertShopMember(shopId, userId, role, status, permissionsJson);
    }

    private UUID insertShopMember(UUID shopId, UUID userId, String role, String status, String permissionsJson) {
        UUID memberId = UUID.randomUUID();
        if (permissionsJson == null) {
            jdbc.update(
                    "INSERT INTO shop.shop_members (id, shop_id, user_id, role, status) VALUES (?::uuid, ?::uuid, ?::uuid, ?, ?)",
                    memberId.toString(),
                    shopId.toString(),
                    userId.toString(),
                    role,
                    status);
        } else {
            jdbc.update(
                    "INSERT INTO shop.shop_members (id, shop_id, user_id, role, status, permissions) VALUES (?::uuid, ?::uuid, ?::uuid, ?, ?, ?::jsonb)",
                    memberId.toString(),
                    shopId.toString(),
                    userId.toString(),
                    role,
                    status,
                    permissionsJson);
        }
        onDelete("DELETE FROM shop.shop_members WHERE id = ?::uuid", memberId.toString());
        return memberId;
    }

    /**
     * 造一个真实 ACTIVE 买家账号：下单入口的账号闸门（{@code UserReadQuery.isActive}）要求 account.users 有行，
     * 幽灵 uuid 会被 403 USER_DISABLED 拒单。手机号按 uuid 派生，避免并发跑撞唯一索引。
     */
    public UUID seedActiveUser(UUID userId) {
        return seedActiveUser(userId, "139" + Math.abs(userId.getMostSignificantBits() % 100_000_000L));
    }

    /** 指定手机号的 ACTIVE 账号——用例要靠号码把人找出来时（邀请、登录族）用它。 */
    public UUID seedActiveUser(UUID userId, String phone) {
        jdbc.update(
                "INSERT INTO account.users (id, phone, status) VALUES (?::uuid, ?, 'ACTIVE') ON CONFLICT (id) DO NOTHING",
                userId.toString(),
                phone);
        onDelete("DELETE FROM account.users WHERE id = ?::uuid", userId.toString());
        return userId;
    }

    /**
     * 登记「一个买家走完整条下单链路」留下的所有行（按 userId 圈定）。
     *
     * <p>下单→支付→发货→售后横跨五个 schema，而它们之间<b>没有外键</b>（schema 隔离），所以漏登记任何一张都不会
     * 报错，只会在下次重跑时撞各自表上的唯一索引（运单号、outbox 那一类）。账号那一行由
     * {@link #seedActiveUser} 自己登记，且要<b>先</b>调它——purge 逆序执行，父表先登记才最后删。
     */
    public void onDeleteBuyerOrderChain(UUID userId) {
        String id = userId.toString();
        // 主订单与子订单没有 FK，但子订单的 trade_id 非空：先登记主订单、再登记子订单，
        // purge 逆序执行时子订单先删、主订单后删
        onDelete("DELETE FROM orders.trades WHERE user_id = ?::uuid", id);
        onDelete("DELETE FROM orders.orders WHERE user_id = ?::uuid", id);
        onDelete(
                "DELETE FROM orders.items WHERE order_id IN (SELECT id FROM orders.orders WHERE user_id = ?::uuid)",
                id);
        onDelete("DELETE FROM payment.payments WHERE user_id = ?::uuid", id);
        onDelete("DELETE FROM aftersale.tickets WHERE user_id = ?::uuid", id);
        onDelete(
                "DELETE FROM aftersale.ticket_events WHERE ticket_id IN (SELECT id FROM aftersale.tickets WHERE user_id = ?::uuid)",
                id);
        onDelete("DELETE FROM logistics.shipments WHERE user_id = ?::uuid", id);
        onDelete(
                "DELETE FROM logistics.tracking_nodes WHERE shipment_id IN (SELECT id FROM logistics.shipments WHERE user_id = ?::uuid)",
                id);
        onDelete(
                "DELETE FROM logistics.shipment_issues WHERE shipment_id IN (SELECT id FROM logistics.shipments WHERE user_id = ?::uuid)",
                id);
        onDelete("DELETE FROM kernel.event_publication WHERE serialized_event LIKE ?", "%" + userId + "%");
    }

    /**
     * 在售商品（草稿类目占位）+ 单 SKU（priceFen 分，CNY）+ inventory 库存行（stock 件，无冻结）。
     *
     * <p>顺带保证店铺存在且 ACTIVE：下单/加购的营业闸门（{@code ShopReadQuery.isActive}）要求 shop.shops 有行，
     * 已存在则不动（要先造 DISABLED/REJECTED 店的用例，先 {@code seedShop} 再调本方法即可）。
     *
     * @return skuId
     */
    public UUID seedOnSaleSku(UUID shopId, long priceFen, int stock) {
        seedActiveShop(shopId);
        UUID productId = UUID.randomUUID();
        UUID skuId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO product.products (id, shop_id, category_id, name, status) VALUES (?::uuid, ?::uuid, ?::uuid, '测试商品', 'PUBLISHED')",
                productId.toString(),
                shopId.toString(),
                UUID.randomUUID().toString());
        jdbc.update(
                "INSERT INTO product.skus (id, product_id, name, price, currency, status, spec_key) VALUES (?::uuid, ?::uuid, '测试SKU', ?, 'CNY', 'ON_SALE', '')",
                skuId.toString(),
                productId.toString(),
                priceFen);
        jdbc.update(
                "INSERT INTO inventory.sku_stock (id, sku_id, stock, frozen_stock) VALUES (?::uuid, ?::uuid, ?, 0)",
                UUID.randomUUID().toString(),
                skuId.toString(),
                stock);
        onDelete("DELETE FROM product.products WHERE id = ?::uuid", productId.toString());
        onDelete("DELETE FROM product.skus WHERE product_id = ?::uuid", productId.toString());
        onDelete("DELETE FROM inventory.sku_stock WHERE sku_id = ?::uuid", skuId.toString());
        onDelete("DELETE FROM inventory.stock_movements WHERE sku_id = ?::uuid", skuId.toString());
        return skuId;
    }

    /** {@link #seedOnSaleSku} 造出的那个商品 id——下架看商品、下单按 SKU，两边都要拿到手。 */
    public UUID productIdOfSku(UUID skuId) {
        return jdbc.queryForObject(
                "SELECT product_id FROM product.skus WHERE id = ?::uuid", UUID.class, skuId.toString());
    }

    /** 测试收货地址（北京市朝阳区占位，非默认），返回地址 id。 */
    public UUID seedAddress(UUID userId) {
        return seedAddress(userId, "110105", "北京市", "北京市", "朝阳区");
    }

    /** 指定默认态的测试收货地址——{@code is_default} 参与「每人至多一个默认」的部分唯一索引，用例要的就是这一列。 */
    public UUID seedAddress(UUID userId, boolean isDefault) {
        return insertAddress(userId, "110105", "北京市", "北京市", "朝阳区", "测试路 1 号", isDefault);
    }

    /**
     * 指定地区的测试收货地址，返回地址 id —— 运费按收货地区计价时用它造「不同地区的两笔单」。
     * regionCode 取国标 6 位码（模板的区域前缀就是拿它做前缀匹配的）。
     */
    public UUID seedAddress(UUID userId, String regionCode, String province, String city, String district) {
        return insertAddress(userId, regionCode, province, city, district, "测试路 1 号", false);
    }

    private UUID insertAddress(
            UUID userId,
            String regionCode,
            String province,
            String city,
            String district,
            String detail,
            boolean isDefault) {
        UUID addressId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO account.addresses (id, user_id, receiver_name, phone, region_code, province, city, district, detail, is_default) "
                        + "VALUES (?::uuid, ?::uuid, '张三', '13800000000', ?, ?, ?, ?, ?, ?)",
                addressId.toString(),
                userId.toString(),
                regionCode,
                province,
                city,
                district,
                detail,
                isDefault);
        onDelete("DELETE FROM account.addresses WHERE id = ?::uuid", addressId.toString());
        return addressId;
    }

    /** 本店默认发货地址（发货时 order 经 shop::api 解析寄件人，无默认即拒绝发货），返回地址 id。 */
    public UUID seedShipAddress(UUID shopId) {
        UUID addressId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO shop.addresses (id, shop_id, contact_name, phone, region_code, province, city, district, detail, default_ship) "
                        + "VALUES (?::uuid, ?::uuid, '发货员', '13900000000', '440305', '广东省', '深圳市', '南山区', '科技园 1 号', TRUE)",
                addressId.toString(),
                shopId.toString());
        onDelete("DELETE FROM shop.addresses WHERE id = ?::uuid", addressId.toString());
        return addressId;
    }
}

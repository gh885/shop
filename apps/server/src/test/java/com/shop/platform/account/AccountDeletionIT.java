package com.shop.platform.account;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.account.mapper.User;
import com.shop.platform.account.mapper.UserMapper;
import com.shop.platform.account.model.AccountDeletionTimeouts;
import com.shop.platform.account.model.UserStatus;
import com.shop.platform.account.service.AccountDeletionService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.coupon.model.UserCouponStatus;
import com.shop.platform.infra.security.DeviceInfo;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.shop.model.ShopStatus;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 买家自助注销（个保法第 47 条）集成验证（真库）：申请 → 15 天冷静期 → 期满匿名化，以及注销在
 * 四个模块的连带清理（cart / favorite / coupon / shop 同步监听 {@code UserDeletedEvent}）。
 *
 * <p>时间推进用 SQL 回拨 {@code deletion_requested_at}，而不是把 {@link AccountDeletionTimeouts#COOLING_OFF}
 * 改小：扫的就是生产那条判定（{@code selectDeletionDue} 的 cutoff 与 {@code anonymize} 的资格闸门），
 * 常量改小测的是另一个系统。
 *
 * <p>两个闸门是这里的主要失败面，都吃 Mapper 里的 WHERE 条件（并发真相）：
 * <ul>
 *   <li><b>申请</b>：只放 ACTIVE + 未注销 + 没提过申请的行，且必须先用掉一枚已发出的验证码
 *   <li><b>执行</b>：冷静期内被平台禁用的行不执行——注销不能成为「把追踪线索自我销毁」的出口（ACC-76）
 * </ul>
 */
@SpringBootTest
class AccountDeletionIT extends IntegrationTestSupport {

    /** 测试环境的固定验证码（{@code sms-channel=dev}，见 DevSmsChannel） */
    private static final String DEV_CODE = "666666";

    /** 注销后的系统昵称文案，与 AccountDeletionExecutor.DELETED_NICKNAME 同值（那个常量是包内可见） */
    private static final String ANONYMIZED_NICKNAME = "已注销用户";

    @Autowired
    private AccountDeletionService deletion;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private RefreshTokenStore refreshTokenStore;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    /**
     * 每次发码换一个来源 IP：短信的 IP 频控是「每 IP 每分钟 10 条」（SmsCodeService.IP_RATE_MAX），
     * 全类共用回环地址会让排在后面的用例被 429 挡下，红得莫名其妙。
     */
    private final String clientIp = "10.77." + Math.abs(userId.getLeastSignificantBits() % 200) + "."
            + (Math.abs(userId.getMostSignificantBits() % 200) + 1);

    private UUID productId;

    private UUID unusedCouponId;

    private UUID usedCouponId;

    private UUID lockedCouponId;

    @BeforeEach
    void registerCleanup() {
        // 登记顺序 = 插入顺序（父表在前）：purge 逆序执行，账号行最后走
        db.onDelete("DELETE FROM account.users WHERE id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM account.addresses WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM cart.items WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM favorite.items WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM coupon.user_coupons WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM coupon.coupon_templates WHERE shop_id = ?::uuid", shopId.toString());
        db.onDelete("DELETE FROM shop.shop_members WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM shop.shops WHERE id = ?::uuid", shopId.toString());
        db.onDelete("DELETE FROM kernel.event_publication WHERE serialized_event LIKE ?", "%" + userId + "%");
    }

    // ==================== 场景 1：申请 ====================

    @Test
    void 申请注销_未发送验证码直接提交_400验证码已过期() {
        seedBuyer();

        // 固定码也不例外：consumeOtp 先要「这号码发过码」，没发过就是过期，而不是放行后门
        BusinessException ex = assertThrows(BusinessException.class, () -> deletion.request(userId, DEV_CODE));

        assertEquals(400, ex.getHttpStatus());
        assertEquals("SMS_CODE_EXPIRED", ex.getCode());
        assertNull(user().getDeletionRequestedAt(), "被拒的申请不留任何痕迹");
        assertNull(user().getDeletedAt());
        assertEquals(UserStatus.ACTIVE, user().getStatus());
    }

    @Test
    void 申请注销_验证码通过_只落申请时刻且冷静期内一切照常() {
        seedBuyer();
        String phone = phone();
        deletion.sendCode(userId, clientIp);

        OffsetDateTime before = OffsetDateTime.now();
        deletion.request(userId, DEV_CODE);
        OffsetDateTime after = OffsetDateTime.now();

        // 1. 申请只落一个时刻：注销与匿名化都还没发生，个人信息原样
        User user = user();
        assertNotNull(user.getDeletionRequestedAt(), "冷静期起点已落");
        assertNull(user.getDeletedAt(), "期满不自动生效，等扫描器");
        assertEquals(phone, user.getPhone(), "号码还没释放");
        assertEquals("小张", user.getNickname());
        assertNotNull(user.getPasswordHash());
        assertEquals(UserStatus.ACTIVE, user.getStatus(), "期内账号照常可用");
        assertNotNull(userMapper.selectByPhone(phone), "期内还能按原号码登录");

        // 2. 状态查询报「有申请、生效于申请时刻 + 15 天」（窗口吃常量，边界另钉一遍防常量被顺手改掉）
        var state = deletion.status(userId);
        assertTrue(state.requested());
        assertEquals(user.getDeletionRequestedAt().plus(AccountDeletionTimeouts.COOLING_OFF), state.effectiveAt());
        assertFalse(state.effectiveAt().isBefore(before.plusDays(15)));
        assertFalse(state.effectiveAt().isAfter(after.plusDays(15)));
    }

    // ==================== 场景 2：撤销 ====================

    @Test
    void 撤销注销_冷静期内撤销_申请时刻清空且重复撤销409() {
        seedBuyer();
        request();
        assertNotNull(user().getDeletionRequestedAt());

        deletion.cancel(userId);

        // 冷静期内什么都没动过，所以清空申请时刻就等于回到申请前的完全同一状态
        User user = user();
        assertNull(user.getDeletionRequestedAt());
        assertNull(user.getDeletedAt());
        assertEquals(UserStatus.ACTIVE, user.getStatus());
        assertEquals("小张", user.getNickname());
        assertFalse(deletion.status(userId).requested());

        BusinessException ex = assertThrows(BusinessException.class, () -> deletion.cancel(userId));
        assertEquals(409, ex.getHttpStatus(), "没有待生效的申请不是「撤销成功了一次」");
    }

    // ==================== 场景 3：未满冷静期 ====================

    @Test
    void 冷静期未满_扫描返回0且数据分毫未动() {
        seedEverythingOwned();
        request();

        assertEquals(0, deletion.sweep());

        User user = user();
        assertNotNull(user.getDeletionRequestedAt());
        assertNull(user.getDeletedAt());
        assertEquals(UserStatus.ACTIVE, user.getStatus());
        assertEquals("小张", user.getNickname());
        assertEquals(
                1,
                rows(
                        "SELECT count(*) FROM account.addresses WHERE user_id = ?::uuid AND deleted_at IS NULL",
                        userId.toString()),
                "地址没被软删");
        assertEquals(1, cartRows());
        assertEquals(1, favoriteRows());
        assertEquals(UserCouponStatus.UNUSED.name(), couponStatus(unusedCouponId));
        assertEquals(1, memberRows(shopId), "店主身份还在");
        assertEquals(ShopStatus.ACTIVE.name(), shopStatus(shopId));
        assertEquals("PUBLISHED", productStatus());
    }

    // ==================== 场景 4：期满执行 ====================

    @Test
    void 冷静期满_扫描执行_匿名化账号并清空四处关联数据吊销全部会话() {
        seedEverythingOwned();
        request();
        String phone = phone();
        refreshTokenStore.issue(
                userId.toString(),
                "device-1",
                "raw-" + UUID.randomUUID(),
                new DeviceInfo("买家端", null, OffsetDateTime.now()));
        assertEquals(1, refreshTokenStore.listDevices(userId.toString()).size(), "注销前有一台设备在线");

        ageRequestDays(16);
        assertEquals(1, deletion.sweep(), "16 > 15：这一笔到期了");

        // 1. 账号行匿名化：身份封存，行保留（历史订单还要挂在它上面）
        User user = user();
        assertTrue(user.getPhone().startsWith("dz"), "占位号前缀：" + user.getPhone());
        assertNotEquals(phone, user.getPhone(), "号码已交还循环放号");
        assertEquals(ANONYMIZED_NICKNAME, user.getNickname());
        assertNull(user.getPasswordHash(), "密码哈希必须显式清空，不能留着能登的东西");
        assertNull(user.getAvatarKey());
        assertEquals(UserStatus.DISABLED, user.getStatus());
        assertNotNull(user.getDeletedAt(), "生效时刻已落（与状态推进同一笔更新）");

        // 2. 地址：软删而不是消失（count 还在，deleted_at 非空）
        assertEquals(
                0,
                rows(
                        "SELECT count(*) FROM account.addresses WHERE user_id = ?::uuid AND deleted_at IS NULL",
                        userId.toString()));
        assertEquals(1, rows("SELECT count(*) FROM account.addresses WHERE user_id = ?::uuid", userId.toString()));

        // 3. 意愿数据：购物车与收藏是硬删
        assertEquals(0, cartRows());
        assertEquals(0, favoriteRows());

        // 4. 券：只有未使用的作废（核销流水要对账），已用/占用的不动
        assertEquals(UserCouponStatus.VOID.name(), couponStatus(unusedCouponId));
        assertEquals(UserCouponStatus.USED.name(), couponStatus(usedCouponId), "已核销的券是账，不是个人意愿数据");
        assertEquals(UserCouponStatus.LOCKED.name(), couponStatus(lockedCouponId), "在途单占用的券不能被注销打断");

        // 5. 店主身份：成员行删掉，店停营业，商品级联下架（shop → product 事件）
        assertEquals(0, memberRows(shopId), "人不在了，ACTIVE 成员不能悬着");
        assertEquals(ShopStatus.DISABLED.name(), shopStatus(shopId));
        assertEquals("WAREHOUSE", productStatus(), "店主注销与审核驳回同一停营业口径（ACC-72）");

        // 6. 会话：refresh token 全端吊销（Redis 不在事务里，所以排在最后）
        assertEquals(0, refreshTokenStore.listDevices(userId.toString()).size(), "注销后没有任何设备还能刷新");
    }

    // ==================== 场景 5：号码释放 ====================

    @Test
    void 号码释放_注销后按原号码查不到_同号可注册成新主体() {
        seedBuyer();
        String phone = phone();
        request();
        ageRequestDays(16);
        assertEquals(1, deletion.sweep());

        // 登录族按号码查不到那个封存行（占位号不是合法号码形状）—— 否则等于给循环放号的下一个人开门
        assertNull(userMapper.selectByPhone(phone));

        // 同一个号码重新注册 = 一个全新主体：新 id、没有注销痕迹
        UUID rebornId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO account.users (id, phone, status) VALUES (?::uuid, ?, 'ACTIVE')",
                rebornId.toString(),
                phone);
        db.onDelete("DELETE FROM account.users WHERE id = ?::uuid", rebornId.toString());

        User reborn = userMapper.selectByPhone(phone);
        assertNotNull(reborn, "号码已交还，可重新注册");
        assertEquals(rebornId, reborn.getId());
        assertNull(reborn.getDeletedAt());
        assertNull(reborn.getDeletionRequestedAt());
        assertNotEquals(userId, reborn.getId(), "新旧两个主体不共用身份");
    }

    // ==================== 场景 6：禁用账号 ====================

    @Test
    void 禁用账号_申请与发码一律403USER_DISABLED() {
        seedBuyer();
        disable();

        // 禁用优先于验证码：账号闸门在消费验证码之前，被禁用的人连「烧掉一枚码」的代价都不该付
        BusinessException send = assertThrows(BusinessException.class, () -> deletion.sendCode(userId, clientIp));
        assertEquals(403, send.getHttpStatus());
        assertEquals("USER_DISABLED", send.getCode());

        BusinessException request = assertThrows(BusinessException.class, () -> deletion.request(userId, DEV_CODE));
        assertEquals(403, request.getHttpStatus());
        assertEquals("USER_DISABLED", request.getCode());
        assertNull(user().getDeletionRequestedAt(), "封号没有自助注销这条出口（ACC-76）");
    }

    @Test
    void 冷静期内被平台禁用_扫描返回0_不被动注销() {
        seedEverythingOwned();
        request();
        String phone = phone();
        ageRequestDays(16);
        disable(); // 期内封号：申请还在，但行已不是 ACTIVE

        assertEquals(0, deletion.sweep(), "扫描只挑 ACTIVE 行：注销不给封号销毁追踪线索");

        User user = user();
        assertEquals(UserStatus.DISABLED, user.getStatus());
        assertNull(user.getDeletedAt(), "禁用 ≠ 注销：没有匿名化，也没落生效时刻");
        assertEquals(phone, user.getPhone(), "号码没释放");
        assertNotNull(user.getPasswordHash());
        assertEquals("小张", user.getNickname());
        assertEquals(1, cartRows(), "四处关联数据一处都没动");
        assertEquals(1, memberRows(shopId));
        assertEquals(ShopStatus.ACTIVE.name(), shopStatus(shopId));
        assertEquals(UserCouponStatus.UNUSED.name(), couponStatus(unusedCouponId));
    }

    // ==================== 场景 7：幂等 / 并发 ====================

    @Test
    void 重复扫描_同一行两轮_第二轮返回0且不重复动作() {
        seedEverythingOwned();
        request();
        ageRequestDays(16);

        assertEquals(1, deletion.sweep());
        OffsetDateTime effectiveAt = user().getDeletedAt();
        assertNotNull(effectiveAt);

        // 第二轮：selectDeletionDue 已收不到它（deleted_at 非空），anonymize 的资格闸门也再拿不到行
        assertEquals(0, deletion.sweep());
        assertEquals(effectiveAt, user().getDeletedAt(), "生效时刻不被下一轮改写");
        assertEquals(ANONYMIZED_NICKNAME, user().getNickname());
        assertEquals(0, cartRows(), "清理没有第二遍（也没有「清出错的东西」）");
        assertEquals(1, rows("SELECT count(*) FROM account.users WHERE id = ?::uuid", userId.toString()));
    }

    // ==================== 场景 8：店已非 ACTIVE ====================

    @Test
    void 店主注销_店待审核或已驳回_状态不被推进商品不下架() {
        seedBuyer();
        // 一家没开起来（PENDING_REVIEW）+ 一家被驳回（REJECTED）：停营业只对正在营业的店有意义
        UUID pendingShop = db.seedShop(UUID.randomUUID(), ShopStatus.PENDING_REVIEW.name());
        UUID rejectedShop = db.seedShop(UUID.randomUUID(), ShopStatus.REJECTED.name());
        UUID skuOnRejectedShop = db.seedOnSaleSku(rejectedShop, 1000, 5);
        UUID rejectedProduct = jdbc.queryForObject(
                "SELECT product_id FROM product.skus WHERE id = ?::uuid", UUID.class, skuOnRejectedShop.toString());
        seedOwnerMembership(pendingShop);
        seedOwnerMembership(rejectedShop);
        request();
        ageRequestDays(16);

        assertEquals(1, deletion.sweep());

        assertEquals(ShopStatus.PENDING_REVIEW.name(), shopStatus(pendingShop), "只动 ACTIVE：审核中的店交给审核流程");
        assertEquals(ShopStatus.REJECTED.name(), shopStatus(rejectedShop));
        assertEquals(
                "PUBLISHED",
                jdbc.queryForObject(
                        "SELECT status FROM product.products WHERE id = ?::uuid",
                        String.class,
                        rejectedProduct.toString()));
        // 但成员行照删：人不在了，与店是什么状态无关
        assertEquals(0, rows("SELECT count(*) FROM shop.shop_members WHERE user_id = ?::uuid", userId.toString()));
    }

    // ==================== 种子与探针 ====================

    /** 造一个可自助注销的真人买家；昵称/密码/头像都非空，「注销后被清空」才不是空断言 */
    private void seedBuyer() {
        db.seedActiveUser(userId);
        jdbc.update(
                "UPDATE account.users SET nickname = '小张', password_hash = '$2a$10$devhash', avatar_key = 'u/avatar.png' WHERE id = ?::uuid",
                userId.toString());
    }

    /**
     * 备齐「注销生效要带走的东西」：账号 + 地址 + 购物车 + 收藏 + 三种状态的券 + 一家 ACTIVE 店的店主身份
     * 与该店在架商品。未满期与期满两个场景共用这份种子，差别只在申请时刻被回拨了几天。
     */
    private void seedEverythingOwned() {
        seedBuyer();
        db.seedAddress(userId);
        UUID skuId = db.seedOnSaleSku(shopId, 1000, 5);
        productId = jdbc.queryForObject(
                "SELECT product_id FROM product.skus WHERE id = ?::uuid", UUID.class, skuId.toString());
        jdbc.update(
                "INSERT INTO cart.items (id, user_id, sku_id, quantity) VALUES (?::uuid, ?::uuid, ?::uuid, 1)",
                UUID.randomUUID().toString(),
                userId.toString(),
                skuId.toString());
        jdbc.update(
                "INSERT INTO favorite.items (id, user_id, product_id) VALUES (?::uuid, ?::uuid, ?::uuid)",
                UUID.randomUUID().toString(),
                userId.toString(),
                productId.toString());
        unusedCouponId = seedCoupon(UserCouponStatus.UNUSED);
        usedCouponId = seedCoupon(UserCouponStatus.USED);
        lockedCouponId = seedCoupon(UserCouponStatus.LOCKED);
        seedOwnerMembership(shopId);
    }

    /** 本人是这家店的 ACTIVE 店主（OWNER 行是店主身份的唯一真相，见 ShopMemberMapper.selectOwnedShopIds） */
    private void seedOwnerMembership(UUID shop) {
        jdbc.update(
                "INSERT INTO shop.shop_members (id, shop_id, user_id, role, status) VALUES (?::uuid, ?::uuid, ?::uuid, 'OWNER', 'ACTIVE')",
                UUID.randomUUID().toString(),
                shop.toString(),
                userId.toString());
    }

    /**
     * 名下一张指定状态的券。占用/核销的行把状态与订单引用<b>同一笔</b>更新写进去：
     * {@code ck_user_coupons_order_ref} 不许「半份状态」（有 LOCKED 没单号即拒），这道约束正是
     * 「注销不能改写已核销的账」的 DB 兜底。
     */
    private UUID seedCoupon(UserCouponStatus status) {
        UUID couponId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update(
                "INSERT INTO coupon.user_coupons (id, template_id, user_id, shop_id, name, threshold_amount, discount_amount, effective_at, expire_at)"
                        + " VALUES (?::uuid, ?::uuid, ?::uuid, ?::uuid, '测试券', 0, 500, ?, ?)",
                couponId.toString(),
                UUID.randomUUID().toString(),
                userId.toString(),
                shopId.toString(),
                now.minusDays(1),
                now.plusDays(7));
        if (status == UserCouponStatus.USED || status == UserCouponStatus.LOCKED) {
            jdbc.update(
                    "UPDATE coupon.user_coupons SET status = ?, order_id = ?::uuid, locked_at = NOW(), used_at = NOW(), applied_discount_amount = 500 WHERE id = ?::uuid",
                    status.name(),
                    UUID.randomUUID().toString(),
                    couponId.toString());
        }
        db.onDelete("DELETE FROM coupon.user_coupons WHERE id = ?::uuid", couponId.toString());
        return couponId;
    }

    /** 发码 + 用固定码提交申请：申请动作的正常前置 */
    private void request() {
        deletion.sendCode(userId, clientIp);
        deletion.request(userId, DEV_CODE);
    }

    /**
     * 把申请时刻回拨 n 天（= 冷静期已停留 n 天）：扫描判定吃的就是 {@code deletion_requested_at <= now - 15d}，
     * 与 {@code anonymize} 的 {@code le(requestedBefore)} 同一把尺子。
     */
    private void ageRequestDays(int days) {
        jdbc.update(
                "UPDATE account.users SET deletion_requested_at = deletion_requested_at - make_interval(days => ?) WHERE id = ?::uuid",
                days,
                userId.toString());
    }

    /** 平台封号（治理侧动作，注销自助通道没有入口，只能改库造） */
    private void disable() {
        jdbc.update("UPDATE account.users SET status = 'DISABLED' WHERE id = ?::uuid", userId.toString());
    }

    private User user() {
        User user = userMapper.selectById(userId);
        assertNotNull(user);
        return user;
    }

    private String phone() {
        return jdbc.queryForObject(
                "SELECT phone FROM account.users WHERE id = ?::uuid", String.class, userId.toString());
    }

    private int cartRows() {
        return rows("SELECT count(*) FROM cart.items WHERE user_id = ?::uuid", userId.toString());
    }

    private int favoriteRows() {
        return rows("SELECT count(*) FROM favorite.items WHERE user_id = ?::uuid", userId.toString());
    }

    private int memberRows(UUID shop) {
        return rows(
                "SELECT count(*) FROM shop.shop_members WHERE user_id = ?::uuid AND shop_id = ?::uuid",
                userId.toString(),
                shop.toString());
    }

    private String couponStatus(UUID couponId) {
        return jdbc.queryForObject(
                "SELECT status FROM coupon.user_coupons WHERE id = ?::uuid", String.class, couponId.toString());
    }

    private String shopStatus(UUID shop) {
        return jdbc.queryForObject("SELECT status FROM shop.shops WHERE id = ?::uuid", String.class, shop.toString());
    }

    private String productStatus() {
        return jdbc.queryForObject(
                "SELECT status FROM product.products WHERE id = ?::uuid", String.class, productId.toString());
    }

    private int rows(String sql, Object... args) {
        Integer count = jdbc.queryForObject(sql, Integer.class, args);
        assertNotNull(count);
        return count;
    }
}

package com.shop.platform.governance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.governance.controller.AdminGovernanceSellerController;
import com.shop.platform.governance.service.GovernanceOnboardingService;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.ForbiddenException;
import com.shop.platform.seller.service.SellerOnboardingService;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 入驻审核：注册落档案进队列、通过即生效、驳回带理由、重提 CAS、权限点与员工身份。
 *
 * <p>事件监听器在测试里直接驱动（新 eventId 经 inbox 抢占），不赌异步时序。
 */
@SpringBootTest
@ActiveProfiles("test")
class GovernanceOnboardingTest {

    @Autowired
    private GovernanceOnboardingService onboarding;

    @Autowired
    private AdminGovernanceSellerController controller;

    @Autowired
    private SellerOnboardingService sellerOnboarding;

    @Autowired
    private JdbcTemplate jdbc;

    private static final AtomicInteger IP_SEQ = new AtomicInteger();
    /** 注册限流按 IP 计在 Redis 里，跨测试运行持久——网段每次运行随机，避开上一轮的配额残渣 */
    private static final String IP_BASE =
            "10." + (100 + Math.abs(UUID.randomUUID().hashCode()) % 100) + ".";

    private SellerOnboardingService.Registration registration;

    @AfterEach
    void cleanUp() {
        if (registration == null) {
            return;
        }
        jdbc.update("DELETE FROM governance.seller_profile WHERE merchant_id = ?", registration.merchantId());
        jdbc.update("DELETE FROM seller.onboarding WHERE merchant_id = ?", registration.merchantId());
        jdbc.update("DELETE FROM seller.shop WHERE merchant_id = ?", registration.merchantId());
        jdbc.update("DELETE FROM seller.operator WHERE merchant_id = ?", registration.merchantId());
        jdbc.update("DELETE FROM seller.merchant WHERE id = ?", registration.merchantId());
        registration = null;
    }

    private SellerOnboardingService.Registration registeredMerchant() {
        var r = sellerOnboarding.register(
                "审核测试商家",
                "gov-" + Ids.newId().toString().substring(0, 13),
                "Str0ng!Passphrase",
                IP_BASE + IP_SEQ.incrementAndGet() + ".1");
        registration = r;
        // 直接驱动注册事件的消费：seller_profile 落 applied（监听器异步，轮询等它落库）
        onboarding.on(new com.shop.platform.seller.events.MerchantRegistered(
                Ids.newId(), r.merchantId(), "审核测试商家", r.shopId(), Instant.now()));
        assertThat(eventually(() -> "applied".equals(profileStatus(r.merchantId()))))
                .isTrue();
        return r;
    }

    private String profileStatus(UUID merchantId) {
        var rows = jdbc.queryForList(
                "SELECT status FROM governance.seller_profile WHERE merchant_id = ?", String.class, merchantId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 监听器经 Modulith 异步执行（直调代理也是异步），断言轮询等待落库。 */
    private static boolean eventually(java.util.function.Supplier<Boolean> probe) {
        for (int i = 0; i < 100; i++) {
            if (Boolean.TRUE.equals(probe.get())) {
                return true;
            }
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }

    private static CurrentOperator staff(String... permissions) {
        return new CurrentOperator(UUID.randomUUID(), "staff", null, Set.of(), Set.copyOf(List.of(permissions)));
    }

    private static CurrentOperator seller(SellerOnboardingService.Registration r) {
        return new CurrentOperator(r.operatorId(), "seller", r.merchantId(), Set.of(), Set.of());
    }

    @Test
    void 注册进队列且带主体名称() {
        var r = registeredMerchant();

        Authorizer.runAs(staff("SHOP_REVIEW"), () -> assertThat(controller.queue("applied"))
                .anyMatch(item -> item.merchantId().equals(r.merchantId()) && "审核测试商家".equals(item.name())));
    }

    @Test
    void 通过即生效并只过一次() {
        var r = registeredMerchant();

        Authorizer.runAs(staff("SHOP_REVIEW"), () -> controller.approve(r.merchantId()));

        var row = jdbc.queryForMap(
                "SELECT status, joined_at FROM governance.seller_profile WHERE merchant_id = ?", r.merchantId());
        assertThat(row.get("status")).isEqualTo("active");
        assertThat(row.get("joined_at")).isNotNull();
        // 同一事务里卖家侧申请单也翻到 approved：重提闸门没有「已通过却重提报错」的窗口
        assertThat(jdbc.queryForObject(
                        "SELECT status FROM seller.onboarding WHERE merchant_id = ?", String.class, r.merchantId()))
                .isEqualTo("approved");

        // 已通过的不是待审：再通过是冲突
        Authorizer.runAs(staff("SHOP_REVIEW"), () -> assertThatThrownBy(() -> controller.approve(r.merchantId()))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(409)));
    }

    @Test
    void 驳回后重提回到队列() {
        var r = registeredMerchant();

        Authorizer.runAs(
                staff("SHOP_REVIEW"),
                () -> controller.reject(r.merchantId(), new AdminGovernanceSellerController.RejectRequest("资质不全")));
        assertThat(jdbc.queryForObject(
                        "SELECT status FROM governance.seller_profile WHERE merchant_id = ?",
                        String.class,
                        r.merchantId()))
                .isEqualTo("rejected");
        // 申请单同步落理由：卖家端重提前能看到该改什么
        var application = jdbc.queryForMap(
                "SELECT status, reject_reason FROM seller.onboarding WHERE merchant_id = ?", r.merchantId());
        assertThat(application.get("status")).isEqualTo("rejected");
        assertThat(application.get("reject_reason")).isEqualTo("资质不全");

        // 商家侧重提：申请单翻回 pending，治理侧经事件翻回 applied
        Authorizer.runAs(seller(r), () -> sellerOnboarding.resubmit(r.merchantId()));
        onboarding.on(
                new com.shop.platform.seller.events.MerchantResubmitted(Ids.newId(), r.merchantId(), Instant.now()));
        assertThat(eventually(() -> "applied".equals(profileStatus(r.merchantId()))))
                .isTrue();

        assertThat(jdbc.queryForObject(
                        "SELECT status FROM governance.seller_profile WHERE merchant_id = ?",
                        String.class,
                        r.merchantId()))
                .isEqualTo("applied");

        Authorizer.runAs(staff("SHOP_REVIEW"), () -> controller.approve(r.merchantId()));
        assertThat(jdbc.queryForObject(
                        "SELECT status FROM governance.seller_profile WHERE merchant_id = ?",
                        String.class,
                        r.merchantId()))
                .isEqualTo("active");
    }

    @Test
    void 档案不存在的审核是404() {
        UUID ghost = Ids.newId();
        Authorizer.runAs(staff("SHOP_REVIEW"), () -> assertThatThrownBy(() -> controller.approve(ghost))
                .isInstanceOf(BusinessException.class));
    }

    @Test
    void 审核要平台员工加审核权限点() {
        var r = registeredMerchant();

        // 没有身份上下文：拒
        assertThatThrownBy(() -> controller.queue(null)).isInstanceOf(ForbiddenException.class);

        // 卖家即使被错授权限点也不是员工：拒
        Authorizer.runAs(
                new CurrentOperator(UUID.randomUUID(), "seller", r.merchantId(), Set.of(), Set.of("SHOP_REVIEW")),
                () -> assertThatThrownBy(() -> controller.approve(r.merchantId()))
                        .isInstanceOf(BusinessException.class));

        // 员工缺权限点：拒
        Authorizer.runAs(staff("LEDGER_VIEW"), () -> assertThatThrownBy(() -> controller.approve(r.merchantId()))
                .isInstanceOf(ForbiddenException.class));
    }
}

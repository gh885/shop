package com.shop.platform.seller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.seller.controller.SellerShopController;
import com.shop.platform.seller.dto.CloseShopRequest;
import com.shop.platform.seller.dto.RenameShopRequest;
import com.shop.platform.seller.service.SellerOnboardingService;
import com.shop.platform.testsupport.IntegrationTest;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 入驻与店铺生命周期：注册三写（merchant/operator/shop）+ 入驻投影、登录名冲突、
 * 改名与关店的终态 CAS、主账号闸门、被拒重提。
 *
 * <p>用真库：唯一索引兜冲突、closed 无重开路径、onboarding 的 CAS 闸门全是数据库行为。
 */
class SellerOnboardingTest extends IntegrationTest {

    @Autowired
    private SellerOnboardingService onboarding;

    @Autowired
    private SellerShopController shopController;

    private static final AtomicInteger IP_SEQ = new AtomicInteger();
    /** 注册限流按 IP 计在 Redis 里，跨测试运行持久——网段每次运行随机，避开上一轮的配额残渣 */
    private static final String IP_BASE =
            "10." + (100 + Math.abs(UUID.randomUUID().hashCode()) % 100) + ".";

    private SellerOnboardingService.Registration registration;

    private SellerOnboardingService.Registration register() {
        SellerOnboardingService.Registration r = onboarding.register(
                "测试商家",
                "reg-" + Ids.newId().toString().substring(0, 13),
                "Str0ng!Passphrase",
                IP_BASE + IP_SEQ.incrementAndGet() + ".1");
        registration = r;
        return r;
    }

    private CurrentOperator asPrimary(SellerOnboardingService.Registration r) {
        return new CurrentOperator(r.operatorId(), "seller", r.merchantId(), Set.of(), Set.of());
    }

    @Test
    void 注册即时成立身份并进入待审() {
        var r = register();

        Integer merchants =
                jdbc.queryForObject("SELECT count(*) FROM seller.merchant WHERE id = ?", Integer.class, r.merchantId());
        Integer operators = jdbc.queryForObject(
                "SELECT count(*) FROM seller.operator WHERE id = ? AND is_primary", Integer.class, r.operatorId());
        String shopStatus =
                jdbc.queryForObject("SELECT status FROM seller.shop WHERE id = ?", String.class, r.shopId());
        String onboarding = jdbc.queryForObject(
                "SELECT status FROM seller.onboarding WHERE merchant_id = ?", String.class, r.merchantId());

        assertThat(merchants).isEqualTo(1);
        assertThat(operators).isEqualTo(1);
        assertThat(shopStatus).isEqualTo("active");
        assertThat(onboarding).isEqualTo("pending");
    }

    @Test
    void 登录名撞唯一索引兜成409() {
        var first = register();
        String taken = jdbc.queryForObject(
                "SELECT login_name FROM seller.operator WHERE id = ?", String.class, first.operatorId());

        assertThatThrownBy(() -> onboarding.register("另一个商家", taken, "Str0ng!Passphrase", IP_BASE + "999.9"))
                .isInstanceOfSatisfying(
                        BusinessException.class, e -> assertThat(e.getCode()).isEqualTo("LOGIN_NAME_TAKEN"));
    }

    @Test
    void 弱口令当场拒绝() {
        assertThatThrownBy(() -> onboarding.register("测试商家", "reg-weakpw" + Ids.newId(), "password", IP_BASE + "998.8"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 改名与关店的终态语义() {
        var r = register();
        Authorizer.runAs(asPrimary(r), () -> shopController.renameShop(new RenameShopRequest("新店名")));

        assertThat(jdbc.queryForObject("SELECT name FROM seller.shop WHERE id = ?", String.class, r.shopId()))
                .isEqualTo("新店名");

        Authorizer.runAs(asPrimary(r), () -> shopController.closeShop(new CloseShopRequest("不想开了")));

        assertThat(jdbc.queryForObject("SELECT status FROM seller.shop WHERE id = ?", String.class, r.shopId()))
                .isEqualTo("closed");

        // closed 是终态：再改名、再关店、重提都被 CAS 挡住
        Authorizer.runAs(
                asPrimary(r), () -> assertThatThrownBy(() -> shopController.renameShop(new RenameShopRequest("又一个名字")))
                        .isInstanceOf(BusinessException.class));
        Authorizer.runAs(
                asPrimary(r), () -> assertThatThrownBy(() -> shopController.closeShop(new CloseShopRequest(null)))
                        .isInstanceOf(BusinessException.class));
    }

    @Test
    void 非主账号不能动店铺() {
        var r = register();
        UUID subId = Ids.newId();
        jdbc.update(
                "INSERT INTO seller.operator (id, merchant_id, login_name, password_hash, display_name, is_primary)"
                        + " VALUES (?, ?, ?, 'x', '客服', false)",
                subId,
                r.merchantId(),
                "reg-sub-" + Ids.newId().toString().substring(0, 8));

        Authorizer.runAs(
                new CurrentOperator(subId, "seller", r.merchantId(), Set.of(), Set.of()),
                () -> assertThatThrownBy(() -> shopController.renameShop(new RenameShopRequest("越权改名")))
                        .isInstanceOf(BusinessException.class));
    }

    @Test
    void 被拒后重提翻回待审() {
        var r = register();
        jdbc.update(
                "UPDATE seller.onboarding SET status = 'rejected', reject_reason = '资质不全' WHERE merchant_id = ?",
                r.merchantId());

        Authorizer.runAs(asPrimary(r), () -> shopController.resubmit());

        assertThat(jdbc.queryForObject(
                        "SELECT status FROM seller.onboarding WHERE merchant_id = ?", String.class, r.merchantId()))
                .isEqualTo("pending");

        // 不在被拒态时重提被拒
        Authorizer.runAs(asPrimary(r), () -> assertThatThrownBy(() -> shopController.resubmit())
                .isInstanceOf(BusinessException.class));
    }

    private String onboardingStatus(UUID merchantId) {
        return jdbc.queryForObject(
                "SELECT status FROM seller.onboarding WHERE merchant_id = ?", String.class, merchantId);
    }
}

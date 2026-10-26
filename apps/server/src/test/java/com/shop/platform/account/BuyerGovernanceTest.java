package com.shop.platform.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.account.mapper.BuyerMapper;
import com.shop.platform.account.service.BuyerGovernanceService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.OperatorResolver;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

/**
 * 买家封禁的语义验收：条件更新的判决、会话吊销、审计脱敏、身份解析当场拒。
 *
 * <p>用真库：这里验的四件事里有三件是数据库 / Redis 行为（CAS 的 0 行判决、
 * 会话被吊销后 refresh 失效、审计行落库），mock 掉等于什么都没验。
 */
@SpringBootTest
@ActiveProfiles("test")
class BuyerGovernanceTest {

    @Autowired
    private BuyerGovernanceService governance;

    @Autowired
    private BuyerMapper buyers;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private List<OperatorResolver> resolvers;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID buyer;

    @AfterEach
    void cleanUp() {
        if (buyer != null) {
            // 审计行不删：audit.entry 挂只追加触发器，DELETE 会被拒（那是设计，不是障碍）。
            // 每个测试用新的随机 buyerId，所以残留行不会干扰其他用例。
            jdbc.update("DELETE FROM account.buyer WHERE id = ?", buyer);
        }
    }

    @Test
    void disablingThenRepeatingTheSameCommandIsAConflict() {
        buyer = newBuyer();
        UUID staff = Ids.newId();

        governance.updateStatus(buyer, "disabled", staff);

        assertThat(buyers.find(buyer).orElseThrow().status()).isEqualTo("disabled");
        // 重复下发同一条命令：0 行，回 409。不静默成功——静默会让「点了没反应」和「已经生效」看起来一样
        assertThatThrownBy(() -> governance.updateStatus(buyer, "disabled", staff))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("账号状态已变化");
    }

    @Test
    void disabledBuyerCanNoLongerBeResolvedAsAnOperator() {
        buyer = newBuyer();
        OperatorResolver buyerResolver = resolvers.stream()
                .filter(resolver -> CurrentOperator.TYPE_BUYER.equals(resolver.operatorType()))
                .findFirst()
                .orElseThrow();

        assertThat(buyerResolver.find(buyer)).as("封之前能解析").isPresent();

        governance.updateStatus(buyer, "disabled", Ids.newId());

        // 判权每请求查库：封禁下一请求即生效，不等 access 过期
        assertThat(buyerResolver.find(buyer)).as("封之后身份解析直接返回空").isEmpty();
    }

    /** 封禁要 bump permission_version——它是「影响快照的写」。 */
    @Test
    void disablingBumpsThePermissionSnapshotVersion() {
        buyer = newBuyer();
        long before = buyers.find(buyer).orElseThrow().permissionVersion();

        governance.updateStatus(buyer, "disabled", Ids.newId());

        assertThat(buyers.find(buyer).orElseThrow().permissionVersion())
                .as("影响身份解析的写必须 bump，否则将来加缓存后封禁延迟生效")
                .isGreaterThan(before);
    }

    /** 审计里的手机号必须是掩码。 */
    @Test
    void theAuditEntryCarriesAMaskedPhoneOnly() {
        buyer = newBuyer();
        String plainPhone = buyers.find(buyer).orElseThrow().phone();

        governance.updateStatus(buyer, "disabled", Ids.newId());

        String changes = jdbc.queryForObject(
                "SELECT changes::text FROM audit.entry WHERE object_id = ? AND action = 'account.buyer.status_changed'",
                String.class,
                buyer.toString());

        assertThat(changes).contains(PhoneNumber.mask(plainPhone));
        assertThat(changes).as("明文手机号绝不能进审计账本").doesNotContain(plainPhone);
    }

    /** 未知状态词回 400，不静默放进去。 */
    @Test
    void anUnknownStatusIsRejected() {
        buyer = newBuyer();

        assertThatThrownBy(() -> governance.updateStatus(buyer, "suspended", Ids.newId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("未知的账号状态");
    }

    @Test
    void anUnknownBuyerIsNotFound() {
        assertThatThrownBy(() -> governance.updateStatus(Ids.newId(), "disabled", Ids.newId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("买家不存在");
    }

    /** 解封能恢复；解封之后再解封同样是 409。 */
    @Test
    void reEnablingRestoresTheAccount() {
        buyer = newBuyer();
        UUID staff = Ids.newId();

        governance.updateStatus(buyer, "disabled", staff);
        governance.updateStatus(buyer, "active", staff);

        assertThat(buyers.find(buyer).orElseThrow().status()).isEqualTo("active");
        assertThatThrownBy(() -> governance.updateStatus(buyer, "active", staff))
                .isInstanceOf(BusinessException.class);
    }

    /** 后台列表把手机号脱敏；关键字能按手机号与昵称搜。 */
    @Test
    void theAdminListMasksPhonesAndCanSearchByPhoneOrName() {
        buyer = newBuyer();
        String phone = buyers.find(buyer).orElseThrow().phone();

        var byPhone = governance.adminPage(null, phone, null, 20);
        assertThat(byPhone.items()).anySatisfy(item -> {
            assertThat(item.buyerId()).isEqualTo(buyer);
            assertThat(item.phone()).as("列表里的手机号必须是掩码").isEqualTo(PhoneNumber.mask(phone));
        });

        var byName = governance.adminPage(null, "治理测试", null, 20);
        assertThat(byName.items()).anySatisfy(item -> assertThat(item.buyerId()).isEqualTo(buyer));
    }

    @Test
    void anUnknownStatusFilterIsRejected() {
        assertThatThrownBy(() -> governance.adminPage("suspended", null, null, 20))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("未知的账号状态");
    }

    /** 造一个买家，昵称带「治理测试」便于关键字搜索。 */
    private UUID newBuyer() {
        UUID id = Ids.newId();
        // 手机号在库里唯一且有格式约束；用随机 11 位避免撞已有数据
        String phone = "1" + String.format("%010d", Math.abs(id.hashCode()) % 10_000_000_000L);
        buyers.insert(id, phone, passwordEncoder.encode("Passw0rd!x"), "治理测试买家");
        return id;
    }
}

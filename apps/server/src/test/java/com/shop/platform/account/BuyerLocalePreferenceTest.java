package com.shop.platform.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.account.dto.UpdateLocaleRequest;
import com.shop.platform.account.mapper.BuyerMapper;
import com.shop.platform.account.service.BuyerAuthService;
import com.shop.platform.account.service.BuyerLocaleService;
import com.shop.platform.common.BusinessException;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 买家语言偏好的语义验收：归一、白名单、账号切换保护、读回。
 *
 * <p>用真库：这一列可空且 {@code null} 有语义（"没表过态"），mock 掉 mapper 就等于不验它。
 */
@SpringBootTest
@ActiveProfiles("test")
class BuyerLocalePreferenceTest {

    @Autowired
    private BuyerLocaleService locale;

    @Autowired
    private BuyerMapper buyers;

    @Autowired
    private BuyerAuthService auth;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID buyer;

    @AfterEach
    void cleanUp() {
        if (buyer != null) {
            jdbc.update("DELETE FROM account.buyer WHERE id = ?", buyer);
        }
    }

    private UUID newBuyer() {
        buyer = UUID.randomUUID();
        return buyer;
    }

    @Test
    void unsetLocaleReadsBackAsNullNotAsTheDefault() {
        UUID id = newBuyer();
        // 直接插一行，不经过注册：这里只验"没表过态"的读回形状
        jdbc.update(
                "INSERT INTO account.buyer (id, phone, display_name) VALUES (?, ?, ?)",
                id,
                "138" + String.format("%08d", Math.abs(id.hashCode() % 100_000_000)),
                "测试");

        assertThat(locale.find(id)).isNull();
    }

    @Test
    void writingALocaleNormalizesItToTheConfiguredTag() {
        UUID id = newBuyer();
        jdbc.update(
                "INSERT INTO account.buyer (id, phone, display_name) VALUES (?, ?, ?)",
                id,
                "138" + String.format("%08d", Math.abs(id.hashCode() % 100_000_000)),
                "测试");

        String stored = locale.update(id, new UpdateLocaleRequest("zh-CN", id.toString()));

        // zh-CN 归到 zh-Hans-CN：同一个语言同一个文字，只是没写 script
        assertThat(stored).isEqualTo("zh-Hans-CN");
        assertThat(locale.find(id)).isEqualTo("zh-Hans-CN");
    }

    @Test
    void unsupportedLocaleIsRejectedInsteadOfSilentlyDefaulting() {
        UUID id = newBuyer();
        jdbc.update(
                "INSERT INTO account.buyer (id, phone, display_name) VALUES (?, ?, ?)",
                id,
                "138" + String.format("%08d", Math.abs(id.hashCode() % 100_000_000)),
                "测试");

        assertThatThrownBy(() -> locale.update(id, new UpdateLocaleRequest("ja-JP", id.toString())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不支持的语言");
        // 静默落默认会让"我选了日语"和"我选了中文"在库里长得一样
        assertThat(locale.find(id)).isNull();
    }

    @Test
    void writingSomeoneElsesLocaleIsRejectedAsAccountSwitched() {
        UUID id = newBuyer();
        jdbc.update(
                "INSERT INTO account.buyer (id, phone, display_name) VALUES (?, ?, ?)",
                id,
                "138" + String.format("%08d", Math.abs(id.hashCode() % 100_000_000)),
                "测试");

        // 页面上的选择器还停在上一个人的渲染结果上时，不能顺手写到刚登进来的人身上
        assertThatThrownBy(() -> locale.update(
                        id, new UpdateLocaleRequest("en-US", UUID.randomUUID().toString())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("账号已切换");
        assertThat(locale.find(id)).isNull();
    }
}

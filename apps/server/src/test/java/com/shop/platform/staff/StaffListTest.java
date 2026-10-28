package com.shop.platform.staff;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import com.shop.platform.staff.service.StaffProfileService;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 员工列表的验收：游标形状、筛选词表、坏游标折 400、关键字匹配。
 *
 * <p>用真库：游标是 {@code (created_at, id)} 复合键，只能对着真实排序验。
 * 测试库没有种子员工（{@code LocalStaffSeed} 是 {@code @Profile("!test")}），所以自建。
 */
@SpringBootTest
@ActiveProfiles("test")
class StaffListTest {

    @Autowired
    private StaffProfileService profiles;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID alpha;

    private UUID beta;

    @BeforeEach
    void seed() {
        alpha = insertStaff("fixture-alpha", "甲");
        beta = insertStaff("fixture-beta", "乙");
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("DELETE FROM staff.member WHERE id IN (?, ?)", alpha, beta);
    }

    private UUID insertStaff(String loginName, String displayName) {
        UUID id = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO staff.member (id, login_name, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)",
                id,
                loginName,
                "x",
                displayName,
                "OPS");
        return id;
    }

    @Test
    void unknownStatusIsA400NotAnEmptyPage() {
        // 筛错词放进 SQL 会变成永远空页——那比报错更糟，用户以为"没有这个状态的人"
        assertThatThrownBy(() -> profiles.adminPage("bogus", null, null, 20))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("未知的员工状态");
    }

    @Test
    void malformedCursorIsA400NotA500() {
        // 游标是客户端可控输入，格式错是客户端的锅
        assertThatThrownBy(() -> profiles.adminPage(null, null, "not-a-cursor", 20))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void secondPageIsReachableThroughTheCursor() {
        // limit=1 逼出翻页：第一页给一条 + nextCursor，第二页接着给
        StaffProfileService.StaffPage first = profiles.adminPage(null, "fixture-", null, 1);

        assertThat(first.items()).hasSize(1);
        assertThat(first.nextCursor()).isNotNull();

        StaffProfileService.StaffPage second = profiles.adminPage(null, "fixture-", first.nextCursor(), 1);

        assertThat(second.items()).hasSize(1);
        // 两页不能是同一个人——(created_at, id) 复合游标的意义就在这
        assertThat(second.items().getFirst().id())
                .isNotEqualTo(first.items().getFirst().id());
    }

    @Test
    void keywordMatchesLoginName() {
        StaffProfileService.StaffPage page = profiles.adminPage(null, "fixture-alpha", null, 100);

        assertThat(page.items()).hasSize(1);
        assertThat(page.items().getFirst().loginName()).isEqualTo("fixture-alpha");
    }
}

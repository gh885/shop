package com.shop.platform.account;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.shop.platform.account.mapper.UserMapper;
import com.shop.platform.account.model.UserStatus;
import com.shop.platform.account.service.AuthService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 管理端买家治理与账号写入的<b>真库</b>验证（对接 audit :: api 的同事务契约）。
 *
 * <p>为什么必须真库：这条路径此前只有 mock 单测覆盖，而 mock 恰好把唯一的失败面挡住了——
 * {@code RecordAuditCommand.record} 是 {@code Propagation.MANDATORY}，只有在真事务里才抛得出「没有事务」；
 * 封号方法漏了 {@code @Transactional} 时，mock 版一路绿灯，真跑起来是状态先提交、写审计抛异常、
 * 接口回 500、账本缺这一行。
 *
 * <p>第二个主题：<b>每一笔写只动自己那几列</b>（{@link UserMapper} 的条件更新族）。断言打在语句的效果上而不是
 * 打在「谁调了谁」上——整行回写的危害是并发下把别人的处置写回旧值，而这种覆盖只在真库里看得见。
 */
@SpringBootTest
class UserGovernanceIT extends IntegrationTestSupport {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserMapper userMapper;

    private final UUID operator = UUID.randomUUID();

    /**
     * 造一个可被治理的 ACTIVE 买家，并登记账本清理。
     *
     * <p>登记顺序 = 插入顺序（父表 users 在前）：purge 逆序执行，才先删审计行再删账号行。
     */
    private UUID seedUser(String phone) {
        UUID userId = db.seedActiveUser(UUID.randomUUID(), phone);
        db.onDelete("DELETE FROM audit.audit_records WHERE target_id = ?", userId.toString());
        return userId;
    }

    private String statusOf(UUID userId) {
        String status =
                jdbc.queryForObject("SELECT status FROM account.users WHERE id = ?::uuid", String.class, userId);
        assertNotNull(status);
        return status;
    }

    private long auditRows(UUID targetId, String action) {
        Long count = jdbc.queryForObject(
                "SELECT count(*) FROM audit.audit_records WHERE target_id = ? AND action = ?",
                Long.class,
                targetId.toString(),
                action);
        assertNotNull(count);
        return count;
    }

    @Test
    void 禁用买家_状态与审计行同一事务落库() {
        UUID userId = seedUser("13900001001");

        authService.updateUserStatus(userId, UserStatus.DISABLED, operator);

        assertEquals("DISABLED", statusOf(userId));
        // 缺一行账本的封号 = 事后无从回答「谁在什么时候封的这个号」
        assertEquals(1, auditRows(userId, "account.user.status_changed"));
    }

    @Test
    void 重复下同一道命令_409_账本不补第二行() {
        UUID userId = seedUser("13900001002");
        authService.updateUserStatus(userId, UserStatus.DISABLED, operator);

        BusinessException again = assertThrows(
                BusinessException.class, () -> authService.updateUserStatus(userId, UserStatus.DISABLED, operator));

        assertEquals(409, again.getHttpStatus());
        assertEquals(1, auditRows(userId, "account.user.status_changed"));
    }

    @Test
    void 注销主体被下启用_409_不撞状态CHECK() {
        // 注销后的行留在原处供管理端看见（本表刻意不加 @TableLogic），它是 DISABLED + deleted_at 那一档
        UUID userId = seedUser("13900001003");
        jdbc.update(
                "UPDATE account.users SET status = 'DISABLED', deleted_at = NOW() WHERE id = ?::uuid",
                userId.toString());

        BusinessException ex = assertThrows(
                BusinessException.class, () -> authService.updateUserStatus(userId, UserStatus.ACTIVE, operator));

        // ck_users_deletion_state（V64）：有生效时刻的行不得留在 ACTIVE。此前这一条直撞约束，管理端看到 500
        assertEquals(409, ex.getHttpStatus());
        assertEquals("DISABLED", statusOf(userId));
        assertEquals(0, auditRows(userId, "account.user.status_changed"));
    }

    @Nested
    class 每笔写只动自己那几列 {

        /** 登录/刷新手里的是更早的快照：它落库时，别人封的号、抹掉的号码都必须在原位不动 */
        @Test
        void 刷登录时间不撤销封号也不复活号码() {
            UUID userId = seedUser("13900001004");
            jdbc.update(
                    "UPDATE account.users SET status = 'DISABLED', phone = '13900009004', nickname = '已匿名'"
                            + " WHERE id = ?::uuid",
                    userId.toString());

            assertEquals(1, userMapper.touchLastLogin(userId, OffsetDateTime.now()));

            Map<String, Object> row = jdbc.queryForMap(
                    "SELECT status, phone, nickname, last_login_at FROM account.users WHERE id = ?::uuid",
                    userId.toString());
            assertEquals("DISABLED", row.get("status"));
            assertEquals("13900009004", row.get("phone"));
            assertEquals("已匿名", row.get("nickname"));
            assertNotNull(row.get("last_login_at"), "登录时刻要真的落下来，这一笔写才有意义");
        }

        @Test
        void 换口令不撤销封号也不复活已注销的号() {
            UUID banned = seedUser("13900001005");
            jdbc.update("UPDATE account.users SET status = 'DISABLED' WHERE id = ?::uuid", banned.toString());
            assertEquals(1, userMapper.updatePasswordHash(banned, "$2a$12$banned", OffsetDateTime.now()));
            assertEquals("DISABLED", statusOf(banned));
            assertEquals(
                    "$2a$12$banned",
                    jdbc.queryForObject(
                            "SELECT password_hash FROM account.users WHERE id = ?::uuid", String.class, banned));

            // 注销生效后哈希被显式抹掉（anonymize），在途 access token 那 10 分钟里的改密不能把它写回去
            UUID deleted = seedUser("13900001006");
            jdbc.update(
                    "UPDATE account.users SET status = 'DISABLED', password_hash = NULL, deleted_at = NOW()"
                            + " WHERE id = ?::uuid",
                    deleted.toString());
            assertEquals(0, userMapper.updatePasswordHash(deleted, "$2a$12$ghost", OffsetDateTime.now()));
        }

        /** 「空串＝清空头像」此前被 updateById 的非空跳过策略吃掉：这一条钉住它真的写成了 NULL */
        @Test
        void 清空头像写得进去_不改的列不被动() {
            UUID userId = seedUser("13900001007");
            jdbc.update(
                    "UPDATE account.users SET nickname = '老昵称', avatar_key = 'old-key' WHERE id = ?::uuid",
                    userId.toString());

            assertEquals(1, userMapper.updateProfile(userId, null, true, null, OffsetDateTime.now()));

            Map<String, Object> row = jdbc.queryForMap(
                    "SELECT nickname, avatar_key, status FROM account.users WHERE id = ?::uuid", userId.toString());
            assertEquals(null, row.get("avatar_key"));
            assertEquals("老昵称", row.get("nickname"));
            assertEquals("ACTIVE", row.get("status"));
        }
    }
}

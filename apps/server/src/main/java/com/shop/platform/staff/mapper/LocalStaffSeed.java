package com.shop.platform.staff.mapper;

import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 本地开发用的平台员工种子：一个超管。
 *
 * <p>与 {@code LocalAccountSeed} 同三条限制，理由也一样：只认 {@code SHOP_SEED_PASSWORD} 开关、
 * 密码从环境变量来（不把哈希写进迁移，那是把凭证提交进仓库）、已有数据就跳过。
 *
 * <p>为什么必须是 SUPER_ADMIN 而不是 OPS：本地要能一路点到"审核商品"，而审核需要 REVIEWER；
 * 超管持有全部权限点，一个账号能走完所有平台侧流程，省得本地建三个账号。
 */
@Component
@Profile("!test")
public class LocalStaffSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LocalStaffSeed.class);

    private static final String LOGIN_NAME = "admin";

    private static final String COUNT_STAFF = "SELECT count(*) FROM staff.account";

    private static final String INSERT_STAFF =
            """
            INSERT INTO staff.account (login_name, password_hash, display_name, role)
            VALUES (:loginName, :passwordHash, :displayName, 'SUPER_ADMIN')
            """;

    private final JdbcClient jdbc;

    private final PasswordEncoder passwordEncoder;

    private final String seedPassword;

    public LocalStaffSeed(
            JdbcClient jdbc, PasswordEncoder passwordEncoder, @Value("${shop.seed.password:}") String seedPassword) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.passwordEncoder = Objects.requireNonNull(passwordEncoder, "passwordEncoder");
        this.seedPassword = seedPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (seedPassword == null || seedPassword.isBlank()) {
            return;
        }
        Integer existing = jdbc.sql(COUNT_STAFF).query(Integer.class).single();
        if (existing != null && existing > 0) {
            return;
        }
        jdbc.sql(INSERT_STAFF)
                .param("loginName", LOGIN_NAME)
                .param("passwordHash", passwordEncoder.encode(seedPassword))
                .param("displayName", "平台管理员")
                .update();
        log.info("本地平台员工种子已创建：loginName={}（密码取自 SHOP_SEED_PASSWORD）", LOGIN_NAME);
    }
}

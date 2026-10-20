package com.shop.platform.seller.store;

import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 本地开发用的账号种子：一个商家、一个在营店铺、一个主账号。
 *
 * <p>三个刻意的限制，避免它变成生产后门：
 *
 * <ul>
 *   <li>只认 {@code SHOP_SEED_PASSWORD} 这个显式开关，没设就整个跳过——生产不设这个变量，种子就不存在。
 *   <li>密码从环境变量来，<b>不把任何密码哈希写进迁移脚本</b>：那是把凭证提交进仓库，gitleaks 也会拦。
 *   <li>已经有商家数据就跳过，不覆盖任何人手工改过的东西。
 * </ul>
 *
 * <p>放在 {@code store} 包里是因为它直接写 seller 的几张表；放在 api 或 controller 层会更像业务代码，
 * 而这不是业务代码，是一次性的脚手架。
 */
@Component
@Profile("!test")
public class LocalAccountSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LocalAccountSeed.class);

    private static final String LOGIN_NAME = "boss";

    private static final String COUNT_MERCHANTS = "SELECT count(*) FROM seller.merchant";

    private static final String INSERT_MERCHANT = "INSERT INTO seller.merchant (name) VALUES (?) RETURNING id";

    private static final String INSERT_SHOP = "INSERT INTO seller.shop (merchant_id, name) VALUES (?, ?) RETURNING id";

    private static final String INSERT_OPERATOR =
            """
            INSERT INTO seller.operator (merchant_id, login_name, password_hash, display_name, is_primary)
            VALUES (?, ?, ?, ?, true)
            """;

    private final JdbcTemplate jdbc;

    private final PasswordEncoder passwordEncoder;

    private final String seedPassword;

    public LocalAccountSeed(
            JdbcTemplate jdbc, PasswordEncoder passwordEncoder, @Value("${shop.seed.password:}") String seedPassword) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.passwordEncoder = Objects.requireNonNull(passwordEncoder, "passwordEncoder");
        this.seedPassword = seedPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (seedPassword == null || seedPassword.isBlank()) {
            return;
        }
        Integer existing = jdbc.queryForObject(COUNT_MERCHANTS, Integer.class);
        if (existing != null && existing > 0) {
            return;
        }

        String merchantId = jdbc.queryForObject(INSERT_MERCHANT, String.class, "示例商家");
        jdbc.queryForObject(INSERT_SHOP, String.class, java.util.UUID.fromString(merchantId), "示例店铺");
        jdbc.update(
                INSERT_OPERATOR,
                java.util.UUID.fromString(merchantId),
                LOGIN_NAME,
                passwordEncoder.encode(seedPassword),
                "老板");

        log.info("本地种子账号已创建：loginName={}（密码取自 SHOP_SEED_PASSWORD）", LOGIN_NAME);
    }
}

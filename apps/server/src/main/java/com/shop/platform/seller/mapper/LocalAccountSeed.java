package com.shop.platform.seller.mapper;

import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
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
 * <p>放在 {@code mapper} 包里是因为它直接写 seller 的几张表；放在 api 或 controller 层会更像业务代码，
 * 而这不是业务代码，是一次性的脚手架。
 */
@Component
@Profile("!test")
public class LocalAccountSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LocalAccountSeed.class);

    private static final String LOGIN_NAME = "boss";

    private final LocalAccountSeedMapper seed;
    private final PasswordEncoder passwordEncoder;
    private final String seedPassword;

    public LocalAccountSeed(
            LocalAccountSeedMapper seed,
            PasswordEncoder passwordEncoder,
            @Value("${shop.seed.password:}") String seedPassword) {
        this.seed = Objects.requireNonNull(seed, "seed");
        this.passwordEncoder = Objects.requireNonNull(passwordEncoder, "passwordEncoder");
        this.seedPassword = seedPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (seedPassword == null || seedPassword.isBlank()) {
            return;
        }
        if (seed.countMerchants() > 0) {
            return;
        }

        UUID merchantId = seed.insertMerchant("示例商家");
        seed.insertShop(merchantId, "示例店铺");
        seed.insertOperator(merchantId, LOGIN_NAME, passwordEncoder.encode(seedPassword), "老板");

        log.info("本地种子账号已创建：loginName={}（密码取自 SHOP_SEED_PASSWORD）", LOGIN_NAME);
    }
}

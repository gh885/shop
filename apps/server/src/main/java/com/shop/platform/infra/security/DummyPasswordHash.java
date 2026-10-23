package com.shop.platform.infra.security;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/**
 * 登录限流被拒时的等时占位哈希（防时序账号枚举）：用户不存在/被限流时拿它跑一次 BCrypt，
 * 让响应耗时与「用户存在且密码错误」一致，堵掉按响应时间做账号枚举。
 *
 * <p>必须是<b>合法</b> BCrypt 串且代价与 {@code SecurityConfig#BCRYPT_STRENGTH} 相同：Spring 的
 * BCryptPasswordEncoder 先用正则校验格式，不合法就打条 WARN 直接 return false——KDF 根本不执行，
 * 等时防护形同虚设（占位 139µs vs 真实 179ms，差三个数量级）。故由编码器现算而非硬编码字面量，
 * 代价因子跟着 {@code BCRYPT_STRENGTH} 走，不会失配。
 *
 * <p>住 infra 而不是哪个身份域：买家、卖家、员工三条登录路径都要用它，infra 是三方共同可依赖的共享包。
 */
public final class DummyPasswordHash {

    public static final String HASH = new BCryptPasswordEncoder(SecurityConfig.BCRYPT_STRENGTH)
            .encode("dummy-placeholder-never-matches-any-real-password");

    private DummyPasswordHash() {}
}

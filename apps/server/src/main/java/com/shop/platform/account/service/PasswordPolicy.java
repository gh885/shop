package com.shop.platform.account.service;

import com.shop.platform.account.dto.AccountFieldRules;
import com.shop.platform.common.BusinessException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

/**
 * 口令强度口径（REG-01 / REG-03 / REG-06）：买家与平台员工两条建密路径共用一份判定。
 *
 * <p>此前这套判定住在 {@code AuthService} 的私有方法里，员工创建这条路径要另抄一份——
 * 而「强度」是一个概念，两份答案必然漂移（抄漏字节档就是多字节口令被静默截断，REG-06 的原事故）。
 */
public final class PasswordPolicy {

    /** REG-03 常见口令黑名单：登录账号被爆破的首批字典词 */
    private static final Set<String> COMMON_PASSWORDS = Set.of(
            "123456",
            "12345678",
            "123456789",
            "password",
            "qwerty123",
            "111111",
            "000000",
            "admin123",
            "abc123",
            "password1",
            "1234567890",
            "qwertyuiop",
            "asdfghjkl",
            "zxcvbnm");

    /**
     * 口令可接受性判定：最小长度（REG-01）、BCrypt 字节上限（REG-06）、常见口令黑名单（REG-03）。
     * 不含「不与手机号相同」（REG-05）——那是买家侧才有的对照物，参数化进来只为让调用点多传一个可能为 null 的值。
     *
     * @param comparableUserValue 与口令不得相同的对照值（买家手机号；员工创建传 null）
     */
    public static void require(String password, String comparableUserValue) {
        // REG-01: 最小长度与 DTO 那一格同一个数
        if (password == null || password.length() < AccountFieldRules.PASSWORD_MIN) {
            throw BusinessException.badRequest("密码长度至少 " + AccountFieldRules.PASSWORD_MIN + " 位");
        }
        // REG-06: BCrypt 的 72 是「字节」上限，不是字符数（多字节字符会超 72 字节导致编码失败/截断失配）
        //         ——所以 DTO 的字符档（PASSWORD_MAX）放得进来的，这里还要再过一道字节档
        if (password.getBytes(StandardCharsets.UTF_8).length > AccountFieldRules.BCRYPT_INPUT_MAX_BYTES) {
            throw BusinessException.badRequest("密码长度不能超过 " + AccountFieldRules.BCRYPT_INPUT_MAX_BYTES + " 位");
        }
        // REG-05: 不与对照值相同（员工创建传 null，跳过）
        if (comparableUserValue != null && password.equals(comparableUserValue)) {
            throw BusinessException.badRequest("密码不能与手机号相同");
        }
        // REG-03: 常见密码黑名单
        if (COMMON_PASSWORDS.contains(password.toLowerCase(Locale.ROOT))) {
            throw BusinessException.badRequest("密码过于常见，请更换");
        }
    }

    private PasswordPolicy() {}
}

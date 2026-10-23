package com.shop.platform.common;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

/**
 * 口令强度口径：买家与平台员工两条建密路径共用一份判定。
 *
 * <p>住 common 而不是某个身份域：「强度」是一个概念，两份答案必然漂移——抄漏字节档就是
 * 多字节口令被静默截断的真实事故。BCrypt 只认前 72 个<b>字节</b>（不是字符）：多字节字符
 * 超过 72 字节会被静默截断，所以 DTO 的字符上限之外还要过一道字节档。
 *
 * @param comparableUserValue 与口令不得相同的对照值（买家手机号；员工等无对照物的路径传 null）
 */
public final class PasswordPolicy {

    /** 最小长度。与各登录 DTO 的 @Size(min=…) 必须同一个数 */
    public static final int MIN_LENGTH = 8;

    /** BCrypt 的输入上限按「字节」算，不是字符数 */
    public static final int BCRYPT_INPUT_MAX_BYTES = 72;

    /** 常见口令黑名单：登录账号被爆破的首批字典词 */
    private static final Set<String> COMMON_PASSWORDS = Set.of(
            "12345678",
            "123456789",
            "1234567890",
            "password",
            "password1",
            "qwerty123",
            "qwertyuiop",
            "asdfghjkl",
            "zxcvbnm",
            "11111111",
            "00000000",
            "admin123",
            "abc123456",
            "88888888");

    public static void require(String password, String comparableUserValue) {
        if (password == null || password.length() < MIN_LENGTH) {
            throw BusinessException.badRequest("密码长度至少 " + MIN_LENGTH + " 位");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > BCRYPT_INPUT_MAX_BYTES) {
            throw BusinessException.badRequest("密码长度不能超过 " + BCRYPT_INPUT_MAX_BYTES + " 字节");
        }
        if (comparableUserValue != null && password.equals(comparableUserValue)) {
            throw BusinessException.badRequest("密码不能与手机号相同");
        }
        if (COMMON_PASSWORDS.contains(password.toLowerCase(Locale.ROOT))) {
            throw BusinessException.badRequest("密码过于常见，请更换");
        }
    }

    private PasswordPolicy() {}
}

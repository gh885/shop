package com.shop.platform.account.infra;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import io.swagger.v3.oas.annotations.media.Schema;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import javax.imageio.ImageIO;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 图形验证码（人机验证）：生成 4 位字符图，答案 SHA-256 摘要落 Redis（5 分钟一次性消费），
 * 校验后即焚。
 *
 * <p>位置：本类是认证模块自己的技术管道，住在 {@code account.infra}（Modulith 规定子包类型即模块内部，
 * 别的模块 import 不到）。今天只有 {@code /auth/captcha} 与 {@code AuthService} 的两个发码用例消费它，
 * 所以不上移根 infra——真有第二个模块要人机验证时，再按「换技术会不会重写」搬到根 infra 或开 api 口子。
 *
 * <p>防御定位：拦截「脚本直调匿名发码端点短信轰炸」这类裸接口滥用。防线顺序：
 * 人机验证（本类） → 频控（SmsCodeService）→ OTP，见 ACC-35。仅凭图形验证码不足以对抗高级黑产
 * （滑块/行为指纹/设备指纹由 SaaS 承担），C 端登录的目标是挡普通脚本，此处够用。
 *
 * <p>唯一豁免：配了 {@code shop.auth.captcha-channel=dev} 时固定码直通（见 {@link DevCaptchaChannel}），
 * 给 E2E 每轮注册新账号用。该属性在生产 profile 里写死成非 dev 值，bean 不装配 = 这条分支恒假。
 */
@Service
@RequiredArgsConstructor
public class CaptchaService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private static final String KEY = "captcha:";
    private static final Duration TTL = Duration.ofMinutes(5);
    private static final int CODE_LENGTH = 4;

    /** 混淆字符表：剔除 0/O/1/I/L 等易混淆字符，降低用户识别成本 */
    private static final char[] CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ".toCharArray();

    private final StringRedisTemplate redisTemplate;
    private final ObjectProvider<DevCaptchaChannel> devCaptchaChannelProvider;

    /** 生成验证码：返回 data:image/png base64 图 + 短 token（前端点图刷新，校验时带回） */
    public Captcha generate() {
        String code = randomCode();
        String captchaId = UUID.randomUUID().toString();
        redisTemplate.opsForValue().set(KEY + captchaId, hash(code), TTL);
        return new Captcha(captchaId, render(code));
    }

    /**
     * 校验验证码：一次性消费（校验成功或失败都删除该 token，杜绝同一 token 反复猜）。
     * 失败抛统一 400 业务错，前端据此刷新验证码并提示重输。
     *
     * <p>缺参（没带 id 或没填码）在生产与 dev 都一律 400——直通只免掉「比对」这一步，不免掉「必须提交过人机验证」，
     * 否则自动化可以省掉一次 /auth/captcha 往返，后门边界就画错地方了。
     */
    public void verify(String captchaId, String captchaCode) {
        if (!StringUtils.hasText(captchaId) || !StringUtils.hasText(captchaCode)) {
            throw BusinessException.badRequest(ErrorCodes.CAPTCHA_REQUIRED, "请先完成图形验证码");
        }
        DevCaptchaChannel dev = devCaptchaChannelProvider.getIfAvailable();
        if (dev != null && dev.getDevCode().equals(captchaCode.trim().toUpperCase(Locale.ROOT))) {
            return;
        }
        String key = KEY + captchaId;
        String stored = redisTemplate.opsForValue().get(key);
        // 无论成败都消费，防重放
        redisTemplate.delete(key);
        if (stored == null) {
            throw BusinessException.badRequest(ErrorCodes.CAPTCHA_EXPIRED, "图形验证码已过期，请刷新重试");
        }
        if (!stored.equals(hash(captchaCode.trim().toUpperCase(Locale.ROOT)))) {
            throw BusinessException.badRequest(ErrorCodes.CAPTCHA_INVALID, "图形验证码错误，请重试");
        }
    }

    private String randomCode() {
        StringBuilder sb = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            sb.append(CHARS[SECURE_RANDOM.nextInt(CHARS.length)]);
        }
        return sb.toString();
    }

    /**
     * SHA-256 摘要。验证码低熵 + 5 分钟 TTL + 一次性消费，落库泄漏的猜测窗口极小，
     * 无需短信码那样的 HMAC pepper 级防拖库离线枚举（成本收益不匹配）。
     * package-private 供同包单测构造已知摘要。
     */
    String hash(String code) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(code.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    // 图片渲染
    private static final int WIDTH = 120;
    private static final int HEIGHT = 44;

    private String render(String code) {
        BufferedImage image = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setColor(new Color(245, 246, 248));
            g.fillRect(0, 0, WIDTH, HEIGHT);

            // 干扰线
            for (int i = 0; i < 3; i++) {
                g.setColor(randomColor(150, 220));
                g.setStroke(new BasicStroke(1.2f));
                g.drawLine(
                        ThreadLocalRandom.current().nextInt(WIDTH),
                        ThreadLocalRandom.current().nextInt(HEIGHT),
                        ThreadLocalRandom.current().nextInt(WIDTH),
                        ThreadLocalRandom.current().nextInt(HEIGHT));
            }

            // 字符（随机旋转 + 颜色）
            g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 26));
            int charWidth = WIDTH / (CODE_LENGTH + 1);
            for (int i = 0; i < code.length(); i++) {
                g.setColor(randomColor(20, 130));
                double angle = ThreadLocalRandom.current().nextDouble(0.9) - 0.45;
                int x = charWidth * i + 10;
                int y = HEIGHT / 2 + 9;
                g.translate(x, y);
                g.rotate(angle);
                g.drawString(String.valueOf(code.charAt(i)), 0, 0);
                g.rotate(-angle);
                g.translate(-x, -y);
            }

            // 噪点
            for (int i = 0; i < 50; i++) {
                g.setColor(randomColor(120, 200));
                g.fillOval(
                        ThreadLocalRandom.current().nextInt(WIDTH),
                        ThreadLocalRandom.current().nextInt(HEIGHT),
                        1,
                        1);
            }
        } finally {
            g.dispose();
        }

        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            ImageIO.write(image, "png", out);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (java.io.IOException e) {
            throw new IllegalStateException("验证码图片生成失败", e);
        }
    }

    private Color randomColor(int min, int max) {
        int r = ThreadLocalRandom.current().nextInt(min, max);
        int gr = ThreadLocalRandom.current().nextInt(min, max);
        int b = ThreadLocalRandom.current().nextInt(min, max);
        return new Color(r, gr, b);
    }

    /** 生成结果：前端渲染图 + 校验回传 token。本 record 即 /auth/captcha 的 HTTP 出参（无独立 Response 镜像） */
    public record Captcha(
            @Schema(requiredMode = REQUIRED) String captchaId, @Schema(requiredMode = REQUIRED) String image) {}
}

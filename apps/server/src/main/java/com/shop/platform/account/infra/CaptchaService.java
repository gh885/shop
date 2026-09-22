package com.shop.platform.account.infra;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.BusinessException;
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
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 图形验证码（人机验证）：生成 4 位字符图，答案 SHA-256 摘要落 Redis（5 分钟一次性消费），
 * 校验后即焚。跨模块共享技术能力 → 根 infra，任何入口（登录发码 / 注册 / 找回密码 / 下单防刷）
 * 都可复用。
 *
 * <p>防御定位：拦截「脚本直调 /auth/sms-code 短信轰炸」这类前端裸接口滥用。防线顺序：
 * 人机验证（本类） → 频控（SmsCodeService）→ OTP。仅凭图形验证码不足以对抗高级黑产
 * （滑块/行为指纹/设备指纹由 SaaS 承担），C 端登录的目标是挡普通脚本，此处够用。
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
     */
    public void verify(String captchaId, String captchaCode) {
        if (!StringUtils.hasText(captchaId) || !StringUtils.hasText(captchaCode)) {
            throw new BusinessException(400, "CAPTCHA_REQUIRED", "请先完成图形验证码");
        }
        String key = KEY + captchaId;
        String stored = redisTemplate.opsForValue().get(key);
        // 无论成败都消费，防重放
        redisTemplate.delete(key);
        if (stored == null) {
            throw new BusinessException(400, "CAPTCHA_EXPIRED", "图形验证码已过期，请刷新重试");
        }
        if (!stored.equals(hash(captchaCode.trim().toUpperCase(Locale.ROOT)))) {
            throw new BusinessException(400, "CAPTCHA_INVALID", "图形验证码错误，请重试");
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

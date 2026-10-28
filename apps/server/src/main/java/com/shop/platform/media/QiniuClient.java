package com.shop.platform.media;

import com.qiniu.util.Auth;
import com.qiniu.util.StringMap;
import java.time.Duration;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 七牛 Kodo 直传凭证的本地签名。只调 SDK 的签名 API（{@link Auth} / {@link StringMap}），
 * 从不发起网络请求——okhttp 已从依赖里排除，哪天 SDK 把签名路径改到需要 okhttp，这里的单测会红。
 *
 * <p>凭证一次一签、scope 绑死到 key：这张凭证只能传这一个对象，多一张都传不上去。
 * 返回的是<b>相对 key</b>，不是完整 URL——入库存 key，展示由前端拼 {@code publicBaseUrl}，换域名不坏历史数据。
 */
@Component
public final class QiniuClient {

    /** 凭证有效期。覆盖「用户挑图 + 网络慢」的窗口，又不至于长到凭证可被转手滥用。 */
    static final Duration TOKEN_TTL = Duration.ofMinutes(10);

    /** 单图上限。商品详情图再大也是展示图，10MB 足够。 */
    private static final long FSIZE_LIMIT_BYTES = 10 * 1024 * 1024;

    private final QiniuProperties properties;
    private final Auth auth;

    public QiniuClient(QiniuProperties properties) {
        this.properties = properties;
        this.auth = properties.configured() ? Auth.create(properties.accessKey(), properties.secretKey()) : null;
    }

    public boolean configured() {
        return properties.configured();
    }

    /**
     * @param ext 已归一化的小写扩展名，白名单由入口控制
     * @return uploadUrl 直传目标、token 上传凭证、key 相对对象名、url 公网访问地址、expiresIn 凭证有效期（秒）
     */
    public ImageTicket issue(String ext) {
        if (!configured()) {
            throw new IllegalStateException("七牛直传通道未配置（shop.media.qiniu）");
        }
        String key = "product/" + UUID.randomUUID() + "." + ext;
        String token = auth.uploadToken(
                properties.bucket(),
                key,
                TOKEN_TTL.toSeconds(),
                new StringMap().put("fsizeLimit", FSIZE_LIMIT_BYTES).put("insertOnly", 1));
        String base = properties.publicBaseUrl();
        String url = (base.endsWith("/") ? base.substring(0, base.length() - 1) : base) + "/" + key;
        return new ImageTicket("https://" + properties.uploadHost(), token, url, key, TOKEN_TTL.toSeconds());
    }

    /**
     * 直传凭证。字段名即前端消费的 wire 形状，动一个都要带上前端。
     *
     * @param uploadUrl 直传目标地址（七牛按空间区域分的上传域名）
     * @param token 上传凭证（上传表单的 token 格）
     * @param url 传完之后的公网访问地址
     * @param key 相对对象名，入库存这个
     * @param expiresIn 凭证剩余有效期（秒），前端据此判断要不要重取
     */
    public record ImageTicket(String uploadUrl, String token, String url, String key, long expiresIn) {}
}

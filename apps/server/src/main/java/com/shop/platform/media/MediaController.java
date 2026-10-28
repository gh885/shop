package com.shop.platform.media;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import java.util.Locale;
import java.util.Set;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 商品图的直传凭证入口。media 是无域模块（上传即走即弃，asset 数据在对象存储，库不保管），
 * 所以没有 service 层——凭证是纯计算，签完就忘。
 *
 * <p>判权用 {@link Permission#PRODUCT_WRITE}：这扇门唯一的消费者就是商品创建/编辑，
 * 能传图就意味着能往商品详情里塞内容，两者一个爆炸半径。端点不认店铺上下文——bucket 是全局的，
 * key 随机、scope 绑死，商家之间互不可见。
 */
@RestController
@RequestMapping("/api/seller/media")
public class MediaController {

    /** 展示图只收位图。svg 能带脚本、heic 浏览器支持参差，都不放行。 */
    private static final Set<String> EXTENSIONS = Set.of("jpg", "jpeg", "png", "webp", "gif", "avif");

    private final QiniuClient client;
    private final Authorizer authorizer;

    public MediaController(QiniuClient client, Authorizer authorizer) {
        this.client = client;
        this.authorizer = authorizer;
    }

    /**
     * 签一张直传凭证。ext 取文件扩展名（前端已归一化为小写），这里再做一次白名单——
     * 扩展名只是给 key 定后缀，真正的类型约束在凭证的 mimeLimit 与展示侧，双重不信任。
     */
    @PostMapping("/image-tickets")
    public QiniuClient.ImageTicket issueImageTicket(@RequestParam String ext) {
        authorizer.check(Permission.PRODUCT_WRITE);
        String normalized = ext == null ? "" : ext.toLowerCase(Locale.ROOT);
        if (!EXTENSIONS.contains(normalized)) {
            throw new BusinessException(400, "不支持的图片格式：" + ext);
        }
        if (!client.configured()) {
            throw new BusinessException(503, "图片上传通道未配置");
        }
        return client.issue(normalized);
    }
}

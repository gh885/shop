package com.shop.platform.media;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.Authorizer;
import java.util.Locale;
import java.util.Set;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家侧图片直传凭证入口。评价晒图是第一个消费者，售后凭证（TODO 里与评价图片格合并成
 * 一件事的那个前置）走同一扇门。
 *
 * <p>判权不判权限点——买家没有权限体系，身份从令牌来：买家令牌才能签凭证，商家/员工令牌
 * 走 {@code /api/seller/media}（那边绑 product:write）。买家上传的图没有店铺上下文，
 * scope 绑死买家人，key 随机、互不可见，与卖家侧同一套存储纪律。
 */
@RestController
@RequestMapping("/api/buyer/media")
public class BuyerMediaController {

    /** 展示图只收位图。svg 能带脚本、heic 浏览器支持参差，都不放行。 */
    private static final Set<String> EXTENSIONS = Set.of("jpg", "jpeg", "png", "webp", "gif", "avif");

    private final QiniuClient client;
    private final Authorizer authorizer;

    public BuyerMediaController(QiniuClient client, Authorizer authorizer) {
        this.client = client;
        this.authorizer = authorizer;
    }

    /** 签一张直传凭证。扩展名双重不信任：前端归一化 + 这里白名单。 */
    @PostMapping("/image-tickets")
    public QiniuClient.ImageTicket issueImageTicket(@RequestParam String ext) {
        authorizer.buyer();
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

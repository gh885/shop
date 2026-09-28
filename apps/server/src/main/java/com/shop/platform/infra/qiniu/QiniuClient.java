package com.shop.platform.infra.qiniu;

import com.qiniu.util.Auth;
import com.qiniu.util.StringMap;
import com.shop.platform.common.BusinessException;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.util.StringUtils;

/**
 * 七牛云对象存储客户端（技术适配，归 infra 共享层）。
 *
 * <p>职责边界：只做「怎么传」——生成上传凭证（浏览器 presigned 直传）、拼公网 URL、生成资源 key。
 * 不碰「传什么 / 谁传 / 传完干什么」：业务归属、权限、传后关联实体，一律由各业务模块自己编排。
 *
 * <p>浏览器直传链路：前端 POST 到业务模块拿到本客户端的 {@link #issueUploadToken(String)} 凭证后，
 * POST {@code multipart/form-data} 到 {@code https://<uploadHost>/<key>}（字段 {@code token} + {@code file}），
 * 文件流不经过应用服务器。不能走浏览器 PUT：七牛 Kodo 上传接口对 PUT 返回 405「only allow POST method」〔实测〕——
 * 原因是 Kodo 的标准上传是表单（POST multipart），不支持 raw PUT 直传。
 */
public class QiniuClient {

    private final QiniuProperties props;

    public QiniuClient(QiniuProperties props) {
        this.props = props;
    }

    /**
     * 签发上传凭证。key 唯一（见 {@link #newKey}），同 key 只能传一次，天然防覆盖。
     *
     * @param key 资源 key（相对路径，如 {@code product/xxx.webp}）
     * @return 上传凭证 token，前端放进 multipart 表单的 {@code token} 字段 POST 到 uploadUrl
     */
    public String issueUploadToken(String key) {
        ensureConfigured();
        return auth().uploadToken(props.getBucket(), key, props.getTokenExpirationSeconds(), new StringMap());
    }

    /**
     * 生成唯一的资源 key，按业务前缀归档（product/ user/avatar/ cms/banner/ …）。
     * UUID 无业务含义、不可预测，杜绝用户文件名注入；后缀决定 MIME 判定。
     */
    public String newKey(String prefix, String ext) {
        return prefix + "/" + UUID.randomUUID() + (ext == null || ext.isBlank() ? "" : "." + ext);
    }

    /** 拼公开可访问的图片 URL（公网域名 + key）。 */
    public String publicUrl(String key) {
        return props.getPublicBaseUrl() + "/" + key;
    }

    /** 浏览器直传目标地址（上传域名 + key）：POST multipart/form-data，表单含 token + file 两个字段。 */
    public String uploadUrl(String key) {
        return "https://" + props.getUploadHost() + "/" + key;
    }

    /**
     * 签发一张图片直传凭证：扩展名白名单 → 唯一 key → 凭证 + 直传地址 + 公网地址，一次拼齐。
     *
     * <p>各业务模块原先各自把 {@code validateImageExt / newKey / uploadUrl / issueUploadToken / publicUrl}
     * 串一遍（头像、商品图各一份），任何一处漏掉白名单校验就是任意后缀上传。串法只留一份。
     *
     * @param prefix 业务归档前缀，如 {@code product} / {@code user/avatar}
     * @param ext 前端给的文件扩展名（不带点），非白名单直接 400
     */
    public UploadTicket issueTicket(String prefix, String ext) {
        String key = newKey(prefix, validateImageExt(ext));
        return new UploadTicket(uploadUrl(key), key, issueUploadToken(key), publicUrl(key));
    }

    /** 图片扩展名白名单：只接受这些常见图片格式，返回规范化小写扩展名（不带点）。 */
    public static String validateImageExt(String ext) {
        if (!StringUtils.hasText(ext)) throw BusinessException.badRequest("缺少图片扩展名");
        String normalized = ext.strip().toLowerCase(Locale.ROOT);
        if (!IMAGE_EXTS.contains(normalized)) {
            throw BusinessException.badRequest("不支持的图片格式：" + ext + "（支持 " + IMAGE_EXTS + "）");
        }
        return normalized;
    }

    private static final Set<String> IMAGE_EXTS = Set.of("jpg", "jpeg", "png", "webp");

    /** 惰性创建：密钥校验通过后才构造，避免密钥未配置时实例化即抛异常（应用照常启动） */
    private Auth auth() {
        return Auth.create(props.getAccessKey(), props.getSecretKey());
    }

    private void ensureConfigured() {
        if (!StringUtils.hasText(props.getAccessKey())
                || !StringUtils.hasText(props.getSecretKey())
                || !StringUtils.hasText(props.getBucket())) {
            throw new IllegalStateException("文件存储未配置：请设置 shop.qiniu.access-key / secret-key / bucket");
        }
    }
}

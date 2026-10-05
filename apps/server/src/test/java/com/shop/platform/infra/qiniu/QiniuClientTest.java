package com.shop.platform.infra.qiniu;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.Test;

/**
 * 上传凭证签发走**真实**签名链路：不起 Spring 上下文、不连库、不 mock 七牛 SDK。
 *
 * <p>为什么单独留这么一个测试：Controller 那两处（{@code ProductAdminControllerTest} /
 * {@code AuthControllerTest}）把整个 {@link QiniuClient} 换成了 {@code @MockitoBean}，真实调用
 * {@code com.qiniu.util.Auth} 的代码在那里一行都没跑到——「排除 okhttp 之后签名还能不能用」用它们是验不出来的。
 *
 * <p>而 pom 里给 qiniu-java-sdk 排除了 okhttp（理由见该依赖块注释）。排除的依据是「签名路径不碰 HTTP」，
 * 这个依据必须有东西守着：SDK 哪天升级把 okhttp 变成签名路径的必需依赖，这里就会红。
 */
class QiniuClientTest {

    private static final String ACCESS_KEY = "test-access-key";

    private static final String SECRET_KEY = "test-secret-key";

    private static final String BUCKET = "test-bucket";

    private static QiniuClient client() {
        return new QiniuClient(props(ACCESS_KEY, SECRET_KEY, BUCKET));
    }

    private static QiniuProperties props(String accessKey, String secretKey, String bucket) {
        QiniuProperties props = new QiniuProperties();
        props.setAccessKey(accessKey);
        props.setSecretKey(secretKey);
        props.setBucket(bucket);
        return props;
    }

    /** 把凭证解回三段并读出 policy——只断言「非空」的话，签名整段退化成常量也照样绿。 */
    private static String decodePolicy(String token) {
        String[] parts = token.split(":", 3);
        assertThat(parts).as("凭证应为 <AccessKey>:<签名>:<base64(policy)> 三段").hasSize(3);
        return new String(Base64.getUrlDecoder().decode(parts[2]), StandardCharsets.UTF_8);
    }

    @Test
    void 签发上传凭证_真实签名链路可用_不依赖okhttp() {
        String token = client().issueUploadToken("product/x.jpg");

        String[] parts = token.split(":", 3);
        assertThat(parts[0]).isEqualTo(ACCESS_KEY);
        assertThat(parts[1]).as("HMAC-SHA1 签名段").isNotBlank();
        assertThat(decodePolicy(token))
                .contains("\"scope\":\"" + BUCKET + ":product/x.jpg\"")
                .contains("\"deadline\":");
    }

    @Test
    void 换密钥_签出来的凭证跟着变() {
        String a = client().issueUploadToken("product/x.jpg");
        String b = new QiniuClient(props(ACCESS_KEY, "another-secret", BUCKET)).issueUploadToken("product/x.jpg");

        assertThat(a.split(":", 3)[1]).isNotEqualTo(b.split(":", 3)[1]);
    }

    @Test
    void 签发图片凭证_一次拼齐直传地址与公网地址() {
        UploadTicket ticket = client().issueTicket("product", "JPG");

        assertThat(ticket.key()).startsWith("product/").endsWith(".jpg");
        assertThat(ticket.uploadUrl()).isEqualTo("https://upload-z1.qiniup.com/" + ticket.key());
        assertThat(ticket.token()).startsWith(ACCESS_KEY + ":");
        assertThat(decodePolicy(ticket.token())).contains("\"scope\":\"" + BUCKET + ":" + ticket.key() + "\"");
    }

    @Test
    void 扩展名不在白名单_直接拒绝() {
        QiniuClient client = client();

        assertThatThrownBy(() -> client.issueTicket("product", "exe")).hasMessageContaining("不支持的图片格式");
        assertThatThrownBy(() -> client.issueTicket("product", "  ")).hasMessageContaining("缺少图片扩展名");
    }

    @Test
    void 未配置密钥_签发时报错_而不是签出一个空凭证() {
        QiniuClient client = new QiniuClient(new QiniuProperties());

        assertThatThrownBy(() -> client.issueUploadToken("product/x.jpg"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("文件存储未配置");
    }
}

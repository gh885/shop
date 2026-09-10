package com.shop.platform.logistics.infra.kdniao;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 快递鸟即时查询（聚合服务）配置。密钥走环境变量注入，绝不写死进代码 / 仓库。
 *
 * <p>与七牛同一条思路：<b>未配置时应用照常启动</b>，只是网关 {@code available()} 为 false，
 * 轮询任务与 webhook 都不工作（轨迹仍可由平台运营补录）。生产必须显式注入密钥。
 *
 * <p>为什么选聚合服务而不是直连各家快递公司：一次性接一家就把几十家承运商覆盖了，
 * 领域侧只认 {@code carriers.code}——换供应商换的是这一个适配器。
 */
@Data
@ConfigurationProperties(prefix = "shop.logistics.kdniao")
public class KdniaoProperties {

    /** 是否启用（未配置密钥时保持 false，任务不空转） */
    private boolean enabled;

    /** 用户 ID（快递鸟的 EBusinessID，公开标识） */
    private String ebusinessId;

    /** API Key（签名密钥，等于密码），从环境变量读 */
    private String appKey;

    /** 即时查询接口地址 */
    private String endpoint = "https://api.kdniao.com/Ebusiness/EbusinessOrderHandle.aspx";
}

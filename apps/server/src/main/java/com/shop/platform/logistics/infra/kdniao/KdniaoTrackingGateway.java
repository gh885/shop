package com.shop.platform.logistics.infra.kdniao;

import com.shop.platform.logistics.service.CarrierTrackingGateway;
import com.shop.platform.logistics.service.CarrierTrackingNode;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 快递鸟即时查询适配（技术适配，仅 logistics 使用，故归模块 infra 而非共享层）。
 *
 * <p>边界职责只有三件：拼报文、验对方响应、把响应拍平成 {@link CarrierTrackingNode}。
 * 状态码与文本的翻译不在这里——那是领域规则（{@code model.TrackingNormalizer}）。
 *
 * <p>承运商编码的映射：本模块的字典 code（SF/ZTO…）与快递鸟的 ShipperCode 恰好同名，
 * 但<b>不假设永远同名</b>：映射失败时直接返回空列表并记日志（宁可这轮不拉，也不用错误的编码去查）。
 * 真接入时这张映射表应落到字典列（{@code carriers.gateway_code}），而不是写死在适配器里。
 */
@Slf4j
public class KdniaoTrackingGateway implements CarrierTrackingGateway {

    /** 即时查询（免费版可用） */
    private static final String REQUEST_TYPE = "1002";

    private final KdniaoProperties props;

    private final RestClient restClient;

    private final ObjectMapper objectMapper;

    public KdniaoTrackingGateway(KdniaoProperties props, RestClient restClient, ObjectMapper objectMapper) {
        this.props = props;
        this.restClient = restClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean available() {
        return props.isEnabled()
                && StringUtils.hasText(props.getEbusinessId())
                && StringUtils.hasText(props.getAppKey());
    }

    @Override
    public List<CarrierTrackingNode> fetchTracker(String carrierCode, String trackingNo) {
        if (!available()) {
            return List.of();
        }
        if (!StringUtils.hasText(carrierCode)) {
            // 字典 code 缺失（老端点手填且没归一成功）→ 无法确定 ShipperCode，这轮不查
            log.debug("[LOGISTICS] 缺少承运商编码，跳过拉取, 运单号={}", trackingNo);
            return List.of();
        }
        String requestData = "{\"LogisticCode\":\"" + trackingNo + "\",\"ShipperCode\":\"" + carrierCode + "\"}";
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("EBusinessID", props.getEbusinessId());
        form.add("RequestType", REQUEST_TYPE);
        form.add("RequestData", requestData);
        form.add("DataSign", KdniaoSign.sign(requestData, props.getAppKey()));
        form.add("DataType", "2");

        String body = restClient
                .post()
                .uri(props.getEndpoint())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(String.class);
        return parse(body);
    }

    /** 响应解析：{@code {Success, State, Traces:[{AcceptTime, AcceptStation, Location}]}} */
    private List<CarrierTrackingNode> parse(String body) {
        if (!StringUtils.hasText(body)) {
            return List.of();
        }
        JsonNode root = objectMapper.readTree(body);
        if (!root.path("Success").asBoolean(false)) {
            log.warn("[LOGISTICS] 快递鸟查询未成功, 原因={}", root.path("Reason").asString(""));
            return List.of();
        }
        return KdniaoTraces.parse(root);
    }
}

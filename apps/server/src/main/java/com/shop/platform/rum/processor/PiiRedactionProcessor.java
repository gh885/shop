package com.shop.platform.rum.processor;

import com.shop.platform.common.PhoneNumber;
import com.shop.platform.rum.RumCounters;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * PII 脱敏：**这条链上唯一拦不住就要出事的环节**。
 *
 * <p>它补的是前端契约第 5 条（隐私边界）的漏。那条契约要前端做到「不采输入框内容、不采 URL 的
 * query 与 hash、手机号只以掩码形态出现」，可这个端点**匿名可达**——契约是前端的自觉，
 * 不是接收端的保障。于是 `message` / `detail` / `stack` / 面包屑这些自由文本会原样进日志，
 * 而它们恰恰是最容易夹带用户数据的地方：`订单 13800138000 不存在`、`无法投递到 zhang@x.com`、
 * 栈里一句带 token 的 URL。
 *
 * <p>三条口径：
 *
 * <ol>
 *   <li><b>扫全树的所有字符串值，不维护字段白名单。</b>白名单是「今天想得到的字段」，
 *       而夹带 PII 的字段是明天新加的那个。代价只是这里多走一遍 JSON——事件也就几 KB。
 *   <li><b>只动手，不判决。</b>一个字都没匹配上就原样返回，不计任何数；匹配上了按**规则名**
 *       计数（不是按字段名——字段名由客户端给，是无界标签）。这条计数是「前端契约正在被谁违反」
 *       的唯一证据：它在涨，说明有调用方在往 message 里塞用户数据，而不是说接收端出了故障。
 *   <li><b>数字型字段不管。</b>手机号写成 JSON 数字（`"message": 13800138000`）能溜过这里，
 *       但溜不进日志——{@link com.shop.platform.rum.RumVocabulary#text} 对非字符串一律当不存在。
 *       与其为了堵它把裸数字一起抹掉（那是把行号、耗时、状态码全毁掉），不如认下这个边界。
 * </ol>
 *
 * <p>掩码本身**复用既有出口**：手机号走 {@link PhoneNumber#mask}，那是 GEN-51 定的全后端唯一出口，
 * 这里不另写一套「前 3 后 4」，否则同一个号在两个地方会掩出两种样子。
 */
@Component
@Order(10)
@RequiredArgsConstructor
public class PiiRedactionProcessor implements RumProcessor {

    /** 规则名进指标标签，所以必须是**有界的这一份**，不许由匹配到的东西生成 */
    static final String RULE_PHONE = "phone";

    static final String RULE_EMAIL = "email";
    static final String RULE_ID_CARD = "id_card";
    static final String RULE_TOKEN = "token";

    /**
     * 大陆手机号，允许被 1~2 个分隔符切开（`138 0000 0000` / `138-0000-0000`——用户粘贴进输入框
     * 又被原样带回错误信息里的那种最常见）。`(?<!\d)` / `(?!\d)` 挡住长数字串的中间片段：
     * 订单号是 16 位，不挡的话它中间那 11 位会被当成手机号。
     */
    private static final Pattern PHONE =
            Pattern.compile("(?<!\\d)(?:\\+?86[\\s-]?)?(1[3-9]\\d[\\s-]?\\d{4}[\\s-]?\\d{4})(?!\\d)");

    /** 邮箱。只掩 local part、留域名——域名与「谁的邮箱」无关，而后缀能帮我们认出是哪家在漏 */
    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+");

    /** 身份证：18 位，尾部可能是校验位 X。掩中间 8 位（生日那一段），留地区码与校验位 */
    private static final Pattern ID_CARD = Pattern.compile("(?<!\\d)(\\d{6})\\d{8}(\\d{3}[0-9Xx])(?!\\d)");

    /**
     * `Bearer <token>`。**必须排在 {@link #SECRET} 前面**：不先吃掉它的话，
     * {@code Authorization: Bearer eyJhbGci...} 会被 SECRET 匹配成「authorization = Bearer」，
     * 然后**把真正的 token 原样留在后面**——一个看起来脱敏了、其实漏了的假象。
     */
    private static final Pattern BEARER = Pattern.compile("(?i)\\bbearer\\s+[A-Za-z0-9._~+/=:-]{8,}");

    /**
     * `password=…` / `token: "…"` 这类键值对。值取到第一个空白、引号或分隔符为止。
     *
     * <p>值里那个可选的 `bearer\s+` 是为 {@link #BEARER} 收尾用的：上一条把
     * `Bearer eyJ…` 抹成 `Bearer ***` 之后，这里若不把它一起吃进去，`Authorization: Bearer ***`
     * 会被匹配成「authorization = Bearer」，留下 `Authorization=*** ***` 这个尾。
     * 尾不影响安全，但一个「脱敏结果长得像没脱干净」的输出，下次真漏了也没人会多看一眼。
     */
    private static final Pattern SECRET = Pattern.compile(
            "(?i)\\b(password|passwd|pwd|token|secret|authorization|api[_-]?key|access[_-]?key)\\b\\s*[:=]\\s*[\"']?(?:bearer\\s+)?[^\\s\"',;&]{3,}[\"']?");

    private final RumCounters counters;

    @Override
    public String name() {
        return "pii-redaction";
    }

    @Override
    public Optional<JsonNode> process(JsonNode event) {
        redact(event);
        return Optional.of(event);
    }

    private void redact(JsonNode node) {
        if (node.isObject()) {
            redactObject((ObjectNode) node);
            return;
        }
        if (node.isArray()) {
            for (JsonNode child : node) {
                redact(child);
            }
        }
    }

    /**
     * 对象分两步走：先收集要改的键值，**遍历完再写回**。
     *
     * <p>不边遍历边改同一个 map——那是在迭代器的眼皮底下动集合。今天改的是已存在的键
     * （`LinkedHashMap` 的 `put` 换值不算结构修改），看着没事；哪天有人把这里改成新增键，
     * 就会变成 `ConcurrentModificationException`，而且是那种「平时不炸、某条事件恰好带某字段时才炸」。
     */
    private void redactObject(ObjectNode object) {
        List<Map.Entry<String, String>> pending = new ArrayList<>();
        for (Map.Entry<String, JsonNode> entry : object.properties()) {
            JsonNode value = entry.getValue();
            if (value.isString()) {
                String original = value.asString();
                String masked = mask(original);
                if (!masked.equals(original)) {
                    pending.add(Map.entry(entry.getKey(), masked));
                }
            } else {
                redact(value);
            }
        }
        pending.forEach(replaced -> object.put(replaced.getKey(), replaced.getValue()));
    }

    /**
     * 一段自由文本过一遍全部规则。返回非空即已改写——四类顺序有意：先具体后泛化，
     * 而 {@link #BEARER} 必须早于 {@link #SECRET}（理由见它自己的注释）。
     */
    private String mask(String text) {
        String result = replace(text, PHONE, RULE_PHONE, m -> PhoneNumber.mask(digitsOnly(m.group(1))));
        result = replace(result, EMAIL, RULE_EMAIL, PiiRedactionProcessor::maskEmail);
        result = replace(result, ID_CARD, RULE_ID_CARD, m -> m.group(1) + "********" + m.group(2));
        result = replace(result, BEARER, RULE_TOKEN, m -> "Bearer ***");
        return replace(result, SECRET, RULE_TOKEN, m -> m.group(1) + "=***");
    }

    private String replace(String text, Pattern pattern, String rule, Function<Matcher, String> to) {
        Matcher matcher = pattern.matcher(text);
        if (!matcher.find()) {
            return text;
        }
        StringBuilder out = new StringBuilder(text.length());
        do {
            matcher.appendReplacement(out, Matcher.quoteReplacement(to.apply(matcher)));
            counters.redacted(rule);
        } while (matcher.find());
        matcher.appendTail(out);
        return out.toString();
    }

    /** `zhang@x.com` → `z***@x.com`。空 local part 不可能是邮箱，正则已经挡在外面 */
    private static String maskEmail(Matcher matcher) {
        String full = matcher.group();
        int at = full.indexOf('@');
        return full.charAt(0) + "***" + full.substring(at);
    }

    private static String digitsOnly(String raw) {
        return raw.replaceAll("\\D", "");
    }
}

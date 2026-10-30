package com.shop.telemetry.server.symbolication;

import com.shop.telemetry.server.symbolication.internal.JdbcSourceMapRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 把事件的压缩位置还原成原始位置。
 *
 * <p><b>在读取时做，而不是写入时做</b>，这是 M0 的一个明确选择：
 *
 * <ul>
 *   <li>sourcemap 通常晚于事件到达（先发版、后上传；或事后补传），写入时符号化等于把
 *       "晚到的符号表"永远用不上——历史事件的堆栈就永远是压缩态
 *   <li>读取时做的代价是每次详情请求多一次 map 解析；详情页是低频操作，这个代价可以接受
 * </ul>
 *
 * <p>什么时候该改成写入时做：详情页 QPS 上来了，或者要按"还原后的文件"做聚合检索。那时把
 * 这个类在 {@code ingest} 里调一次并把结果落列即可，接口不变。
 */
@Component
public class StackReader {

    private final JdbcSourceMapRepository repository;
    private final ObjectMapper json;

    StackReader(JdbcSourceMapRepository repository, ObjectMapper json) {
        this.repository = repository;
        this.json = json;
    }

    public SymbolicatedStack read(String projectId, JsonNode payload) {
        List<Image> images = images(payload);
        JsonNode values = payload.path("exception").path("values");

        List<ReadableFrame> frames = new ArrayList<>();
        if (values.isArray()) {
            for (JsonNode value : values) {
                JsonNode stacktraceFrames = value.path("stacktrace").path("frames");
                if (!stacktraceFrames.isArray()) {
                    continue;
                }
                for (JsonNode frame : stacktraceFrames) {
                    frames.add(resolve(projectId, frame, images));
                }
            }
        }

        if (frames.isEmpty()) {
            return new SymbolicatedStack(SymbolicationStatus.NO_FRAMES, List.of());
        }
        // 原生栈（Java/.NET…）自带类名与行号，不需要 sourcemap，也不该报"缺 debug_id"
        if (!"javascript".equals(payload.path("platform").asString(""))) {
            return new SymbolicatedStack(SymbolicationStatus.NOT_NEEDED, frames);
        }
        if (images.isEmpty()) {
            return new SymbolicatedStack(SymbolicationStatus.NO_DEBUG_ID, frames);
        }
        boolean resolved = frames.stream().anyMatch(ReadableFrame::resolved);
        return new SymbolicatedStack(resolved ? SymbolicationStatus.OK : SymbolicationStatus.NO_SOURCEMAP, frames);
    }

    private ReadableFrame resolve(String projectId, JsonNode frame, List<Image> images) {
        String file = firstNonNull(text(frame, "abs_path"), text(frame, "filename"), "<unknown>");
        String function = text(frame, "function");
        int line = frame.path("lineno").asInt(0);
        int column = frame.path("colno").asInt(0);
        boolean inApp = frame.path("in_app").asBoolean(false);
        ReadableFrame fallback = new ReadableFrame(file, function, line, column, inApp, file);

        Image image = match(images, file);
        if (image == null || line <= 0) {
            return fallback;
        }
        Optional<SourceMapV3> map = load(projectId, image.debugId());
        if (map.isEmpty()) {
            return fallback;
        }
        Optional<OriginalPosition> position = map.get().lookup(line, Math.max(column, 1));
        if (position.isEmpty()) {
            return fallback;
        }
        OriginalPosition original = position.get();
        return new ReadableFrame(
                file,
                original.name() != null ? original.name() : function,
                original.line(),
                original.column(),
                inApp,
                original.source());
    }

    /** 先按 code_file 精确/后缀匹配；匹配不上但只有一个 map 时就用它（单 chunk 产物的常见情况）。 */
    private static Image match(List<Image> images, String file) {
        for (Image image : images) {
            String codeFile = image.codeFile();
            if (codeFile != null && (codeFile.equals(file) || file.endsWith(codeFile) || codeFile.endsWith(file))) {
                return image;
            }
        }
        return images.size() == 1 ? images.getFirst() : null;
    }

    private Optional<SourceMapV3> load(String projectId, String debugId) {
        if (debugId == null || debugId.isBlank()) {
            return Optional.empty();
        }
        Optional<String> content = repository.find(projectId, debugId);
        if (content.isEmpty()) {
            return Optional.empty();
        }
        try {
            return Optional.of(SourceMapV3.parse(json.readTree(content.get())));
        } catch (RuntimeException e) {
            // 上传时校验过，这里只可能是历史脏数据：当作没有，不要因为一条坏 map 让详情页 500
            return Optional.empty();
        }
    }

    private static List<Image> images(JsonNode payload) {
        JsonNode images = payload.path("debug_meta").path("images");
        List<Image> result = new ArrayList<>();
        if (!images.isArray()) {
            return result;
        }
        for (JsonNode image : images) {
            String debugId = text(image, "debug_id");
            if (debugId == null) {
                continue;
            }
            result.add(new Image(debugId, text(image, "code_file")));
        }
        return result;
    }

    private static String text(JsonNode node, String field) {
        JsonNode child = node.path(field);
        if (!child.isString() || child.asString().isBlank()) {
            return null;
        }
        return child.asString();
    }

    private static String firstNonNull(String... values) {
        for (String value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private record Image(String debugId, String codeFile) {}
}

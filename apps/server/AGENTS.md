## 编码风格 — Java

### 主键 ID 策略（全库强制）

- 主键统一 **uuidv7**，列定义 `id UUID PRIMARY KEY DEFAULT uuidv7()`（PG 18 原生）
- Entity 用 `java.util.UUID` + `@TableId(type = IdType.INPUT)`，insert 时由 `MyBatisPlusMetaObjectHandler` 应用层生成
- 禁止自增 / 雪花 / uuidv4；给用户看的业务编号（订单号等）是独立业务字段，不是主键
- 详见 `docs/product-architecture.md`

### 能用就用

| 注解                       | 使用场景                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `@RequiredArgsConstructor` | **构造器注入**：Service / Component 声明 `private final` 依赖时用，Spring 自动通过生成的构造器注入，省掉手写构造器 |
| `@Data`                    | POJO / Entity / DTO：所有字段可读写、需要 `toString`/`equals`/`hashCode` 时                                        |
| `@Getter` / `@Setter`      | 当 `@Data` 不合适时按需使用（如不想暴露 setter，或不需要生成 `equals`/`hashCode`）                                 |
| `@NoArgsConstructor`       | MyBatis-Plus / JPA Entity 需要无参构造时，常与 `@AllArgsConstructor` 或 `@Builder` 组合                            |
| `@AllArgsConstructor`      | 需要全参构造器时，常配合 `@Builder` 使用（加 `access = AccessLevel.PRIVATE` 强制走 Builder）                       |
| `@Slf4j`                   | 代替手写 `LoggerFactory.getLogger()`                                                                               |
| `record`                   | 请求/响应 DTO、不可变值对象、业务方法返回值（Spring 4.x / MyBatis-Plus 3.5.x 已完全兼容）                          |

### @Builder

构造器参数 **≥ 3 个** 时加 `@Builder`。

搭配方式：

```java
// 选项 A：配合 @Data（用于 DTO / 请求体）
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateProductRequest {
    private String name;
    private Long categoryId;
    private Long price;
}

// 选项 B：配合构造器私有化 + 全参构造（推荐用于实体）
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class Product {
    private Long id;
    private String name;
}
```

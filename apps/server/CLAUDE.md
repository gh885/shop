## 编码风格 — Java

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

### service 层方法注释（编号脉络）

**业务方法内部用 `// 1.` `// 2.` `// 3.` 编号注释写出流程脉络** —— 只读注释骨架就能看懂编排（校验 → 变更 → 对账…）。既是自文档，也是验收介质。范本见 `AuthService.loginBySms` / `ProductService.updateSpecs`。

规则：

- 每步是「业务条款」，不是代码复述：`// 4. 对账：组合没变的保留，新增的补 SKU`；不要写 `// 4. 调用 updateById`
- 只在有真实阶段的方法里用；琐碎方法（2~3 行无阶段）别硬编号，会变成噪音
- 某一步超过 ~10 行 → 抽成私有方法，注释升级成方法名（编号是重构温度计）
- 落实在 service 层；controller/mapper 是样板代码，不强制

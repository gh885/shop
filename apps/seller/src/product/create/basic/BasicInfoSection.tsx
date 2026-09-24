import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
    ImageUploadGrid,
} from "@shop/ui-web"
import {
    PRODUCT_NAME_MAX,
    ProductNameSchema,
    SELL_POINT_MAX,
    SELL_POINT_MIN,
    SellPointSchema,
} from "@shop/common"

import { imgUrl } from "#/shared/lib/image"

import type { BasicForm } from "./form-instance"

/**
 * 发布第二步「基础信息」区块（section-basic）：主图 / 商品标题 / 商品卖点。
 *
 * 表单字段由整体壳(PublishBasicStep)用 useAppForm 创建并持有；这里**只接收 form 实例**做展示
 * （form.AppField 渲染 + 校验），值变化经壳的 form.Subscribe 上报 autosave。
 * 不依赖隐式 context：组件纯净、可独立测试，字段类型完整（不退化 any）。
 */
export function BasicInfoSection({
    form,
    uploadImage,
}: {
    form: BasicForm
    uploadImage: (file: File) => Promise<string>
}) {
    return (
        <Card
            id="section-basic"
            className="scroll-mt-16"
        >
            <CardHeader>
                <CardTitle>
                    <span className="mr-2 text-muted-foreground/60 tabular-nums">01</span>
                    基础信息
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                <form.AppField
                    name="images"
                    validators={{
                        onSubmit: ({ value }) =>
                            value.length > 0 ? undefined : "请至少上传 1 张商品图",
                    }}
                >
                    {(field) => (
                        <Field orientation="horizontal">
                            <FieldLabel required>商品图片</FieldLabel>
                            {/* 直传七牛：upload 取凭证后浏览器 PUT，落公网 URL；失败回退本地预览由 ImageUpload 提示 */}
                            <ImageUploadGrid
                                value={field.state.value}
                                onChange={(imgs) => field.handleChange(imgs)}
                                label="上传图片"
                                coverLabel="主图"
                                maxCount={5}
                                size="size-28"
                                upload={uploadImage}
                                resolveSrc={imgUrl}
                            />
                            {field.state.meta.isValid ? (
                                <FieldDescription>
                                    第一张即主图（列表/详情首图），拖拽句柄可调顺序；建议
                                    1:1、800×800 以上
                                </FieldDescription>
                            ) : (
                                <FieldError errors={field.state.meta.errors} />
                            )}
                        </Field>
                    )}
                </form.AppField>

                <form.AppField
                    name="name"
                    validators={{ onSubmit: ProductNameSchema }}
                >
                    {(field) => (
                        <field.TextField
                            label="商品标题"
                            required
                            orientation="horizontal"
                            counter
                            maxLength={PRODUCT_NAME_MAX}
                            placeholder="如：宠物智能喂食器 定时定量 大容量"
                            hint="买家搜索靠它命中，把品牌、品类、核心属性写进去"
                        />
                    )}
                </form.AppField>

                <form.AppField
                    name="subtitle"
                    validators={{ onSubmit: SellPointSchema }}
                >
                    {(field) => (
                        <field.TextField
                            label="商品卖点"
                            orientation="horizontal"
                            counter
                            maxLength={SELL_POINT_MAX}
                            placeholder="如：定时定量不撑食，断电续航 72 小时"
                            hint={`选填；填了就写 ${SELL_POINT_MIN}~${SELL_POINT_MAX} 字，展示在商品详情页标题下方`}
                        />
                    )}
                </form.AppField>
                {/* 七天无理由：法定权利默认给，只有特殊类目才关掉（关掉后详情页要说明白，所以默认勾选） */}
                <form.AppField name="sevenDayReturn">
                    {(field) => (
                        <field.CheckboxField
                            label="支持七天无理由退货"
                            orientation="horizontal"
                            hint="定制、鲜活易腐、数字化商品等法定除外类目才取消；取消后买家详情页会明示「不支持七天无理由退货」"
                        />
                    )}
                </form.AppField>
            </CardContent>
        </Card>
    )
}

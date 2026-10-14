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
} from "@shop/common/domain"
import { imgUrl } from "#/shared/lib/image"
import { messageFactFactory } from "@shop/i18n"

import { useT } from "#/locales/use-t"
import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

import type { BasicForm } from "./form-instance"

/** 校验消息只发结构化事实（§6.1）：这句没有槽位，`min` 不是可调的上限而是规则本身（「一张图都不许交」） */
type ProductErrKey = Extract<SellerMessageKey, `product.err.${string}`>
const err = messageFactFactory<ProductErrKey, SellerParamsByKey>()

/**
 * 发布第二步「基础信息」区块（section-basic）：主图 / 商品标题 / 商品卖点。
 *
 * 表单字段由内部表单(BasicStep)用 useAppForm 创建并持有；这里**只接收 form 实例**做展示
 * （form.AppField 渲染 + 校验），值变化经 form.store 订阅上报编辑会话，仅显式提交才保存。
 * 不依赖隐式 context：组件纯净、可独立测试，字段类型完整（不退化 any）。
 */
export function BasicInfoSection({
    form,
    uploadImage,
}: {
    form: BasicForm
    uploadImage: (file: File) => Promise<string>
}) {
    const t = useT("product")
    return (
        <Card
            id="section-basic"
            className="scroll-mt-16"
        >
            <CardHeader>
                <CardTitle>
                    <span className="mr-2 text-muted-foreground/60 tabular-nums">01</span>
                    {t("product.info.title")}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                <form.AppField
                    name="images"
                    validators={{
                        onSubmit: ({ value }) =>
                            value.length > 0 ? undefined : err("product.err.imagesRequired"),
                    }}
                >
                    {(field) => (
                        <Field orientation="horizontal">
                            <FieldLabel required>{t("product.info.images.label")}</FieldLabel>
                            {/* 直传七牛：upload 取凭证后浏览器 PUT，落公网 URL；失败回退本地预览由 ImageUpload 提示 */}
                            <ImageUploadGrid
                                value={field.state.value}
                                onChange={(imgs) => field.handleChange(imgs)}
                                label={t("product.info.images.uploadLabel")}
                                coverLabel={t("product.info.images.coverLabel")}
                                maxCount={5}
                                size="size-28"
                                upload={uploadImage}
                                resolveSrc={imgUrl}
                            />
                            {field.state.meta.isValid ? (
                                <FieldDescription>{t("product.info.images.hint")}</FieldDescription>
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
                            label={t("product.info.name.label")}
                            required
                            orientation="horizontal"
                            counter
                            maxLength={PRODUCT_NAME_MAX}
                            placeholder={t("product.info.name.placeholder")}
                            hint={t("product.info.name.hint")}
                        />
                    )}
                </form.AppField>

                <form.AppField
                    name="subtitle"
                    validators={{ onSubmit: SellPointSchema }}
                >
                    {(field) => (
                        <field.TextField
                            label={t("product.info.subtitle.label")}
                            orientation="horizontal"
                            counter
                            maxLength={SELL_POINT_MAX}
                            placeholder={t("product.info.subtitle.placeholder")}
                            hint={t("product.info.subtitle.hint", {
                                min: SELL_POINT_MIN,
                                max: SELL_POINT_MAX,
                            })}
                        />
                    )}
                </form.AppField>
                {/* 七天无理由：法定权利默认给，只有特殊类目才关掉（关掉后详情页要说明白，所以默认勾选） */}
                <form.AppField name="sevenDayReturn">
                    {(field) => (
                        <field.CheckboxField
                            label={t("product.info.sevenDay.label")}
                            orientation="horizontal"
                            hint={t("product.info.sevenDay.hint")}
                        />
                    )}
                </form.AppField>
            </CardContent>
        </Card>
    )
}

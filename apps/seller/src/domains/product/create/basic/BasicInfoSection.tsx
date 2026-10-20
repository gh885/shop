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

type ProductErrKey = Extract<SellerMessageKey, `product.err.${string}`>
const err = messageFactFactory<ProductErrKey, SellerParamsByKey>()

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
                {/* 七天无理由必须默认勾选（法定权利，特殊类目才关）：默认不勾等于每次发布都把该给的关了 */}
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

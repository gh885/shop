import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Field,
    FieldDescription,
    FieldLabel,
    ImageUploadGrid,
} from "@shop/ui-web"

import { imgUrl } from "#/shared/lib/image"
import { useT } from "#/locales/use-t"

import type { BasicForm } from "./form-instance"

/**
 * 发布页「图文详情」区块（section-detail）：详情图流（数组，按序铺开渲染，代替富文本 HTML）。
 *
 * 与主图/图集同为 basic 字段（detailImages 随 updateBasic 落库），只是视觉上排在销售信息之下。
 * 可拖拽排序；直传七牛（upload=uploadProductImage）；无封面概念（每张都是详情图）。
 */
export function DetailImagesSection({
    form,
    uploadImage,
}: {
    form: BasicForm
    uploadImage: (file: File) => Promise<string>
}) {
    const t = useT("product")
    return (
        <Card
            id="section-detail"
            className="scroll-mt-16"
        >
            <CardHeader>
                <CardTitle>
                    <span className="mr-2 text-muted-foreground/60 tabular-nums">03</span>
                    {t("product.detail.title")}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                <form.AppField name="detailImages">
                    {(field) => (
                        <Field orientation="horizontal">
                            <FieldLabel>{t("product.detail.images.label")}</FieldLabel>
                            <ImageUploadGrid
                                value={field.state.value}
                                onChange={(imgs) => field.handleChange(imgs)}
                                label={t("product.detail.images.uploadLabel")}
                                maxCount={10}
                                size="size-24"
                                upload={uploadImage}
                                resolveSrc={imgUrl}
                                className="max-w-132"
                            />
                            <FieldDescription>{t("product.detail.images.hint")}</FieldDescription>
                        </Field>
                    )}
                </form.AppField>
            </CardContent>
        </Card>
    )
}

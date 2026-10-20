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

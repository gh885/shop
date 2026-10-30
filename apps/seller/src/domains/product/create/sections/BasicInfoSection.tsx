import {
    ImageUploadGrid,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Field,
    FieldDescription,
    FieldLabel,
} from "@shop/ui-web"
import { PRODUCT_NAME_MAX, SELL_POINT_MAX } from "@shop/common/domain"
import type { BrandRow } from "@shop/api/sdk"

import { useT } from "#/locales/use-t"
import { imgUrl } from "#/shared/lib/image"
import type { CreateDraft, FieldErrors } from "../model"
import { isCreateFieldErrorKey } from "../submit"

const NO_BRAND = "__none__"

export function BasicInfoSection({
    draft,
    errors,
    brands,
    brandPolicy,
    onPatch,
    upload,
}: {
    draft: CreateDraft
    errors: FieldErrors
    brands: BrandRow[]
    brandPolicy: string
    onPatch: (patch: Partial<CreateDraft>) => void
    upload: (file: File) => Promise<string>
}) {
    const t = useT("product")
    const errorText = (key: string) => (isCreateFieldErrorKey(key) ? t(key) : key)
    const brandRequired = brandPolicy === "required"
    const showBrand = brandPolicy !== "forbidden"

    return (
        <section
            id="section-basic"
            className="scroll-mt-16 space-y-5 rounded-lg bg-background p-5 shadow-sm"
        >
            <h2 className="text-base font-semibold">{t("product.create.section.basic")}</h2>

            <Field orientation="horizontal">
                <FieldLabel required>{t("product.create.title.label")}</FieldLabel>
                <Input
                    value={draft.title}
                    maxLength={PRODUCT_NAME_MAX}
                    placeholder={t("product.create.title.placeholder")}
                    onChange={(event) => onPatch({ title: event.target.value })}
                />
                {errors["title"] ? (
                    <ErrorText text={errorText(errors["title"])} />
                ) : (
                    <FieldDescription>{t("product.create.title.hint")}</FieldDescription>
                )}
            </Field>

            <Field orientation="horizontal">
                <FieldLabel>{t("product.create.subtitle.label")}</FieldLabel>
                <Input
                    value={draft.subtitle}
                    maxLength={SELL_POINT_MAX}
                    placeholder={t("product.create.subtitle.placeholder")}
                    onChange={(event) => onPatch({ subtitle: event.target.value })}
                />
                {errors["subtitle"] ? (
                    <ErrorText text={errorText(errors["subtitle"])} />
                ) : (
                    <FieldDescription>{t("product.create.subtitle.hint")}</FieldDescription>
                )}
            </Field>

            {showBrand ? (
                <Field orientation="horizontal">
                    <FieldLabel required={brandRequired}>
                        {t("product.create.brand.label")}
                    </FieldLabel>
                    <Select
                        items={[
                            ...(brandRequired
                                ? []
                                : [{ value: NO_BRAND, label: t("product.create.brand.none") }]),
                            ...brands.map((brand) => ({ value: brand.id, label: brand.name })),
                        ]}
                        value={
                            draft.brandId === "" ? (brandRequired ? "" : NO_BRAND) : draft.brandId
                        }
                        onValueChange={(value) =>
                            onPatch({ brandId: value === null || value === NO_BRAND ? "" : value })
                        }
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder={t("product.create.brand.placeholder")} />
                        </SelectTrigger>
                        <SelectContent>
                            {brandRequired ? null : (
                                <SelectItem value={NO_BRAND}>
                                    {t("product.create.brand.none")}
                                </SelectItem>
                            )}
                            {brands.map((brand) => (
                                <SelectItem
                                    key={brand.id}
                                    value={brand.id}
                                >
                                    {brand.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            ) : null}

            <Field orientation="horizontal">
                <FieldLabel>{t("product.create.modelNo.label")}</FieldLabel>
                <Input
                    value={draft.modelNo}
                    maxLength={100}
                    placeholder={t("product.create.modelNo.placeholder")}
                    onChange={(event) => onPatch({ modelNo: event.target.value })}
                />
                <FieldDescription>{t("product.create.modelNo.hint")}</FieldDescription>
            </Field>

            <Field orientation="horizontal">
                <FieldLabel required>{t("product.create.images.label")}</FieldLabel>
                <ImageUploadGrid
                    value={draft.images}
                    onChange={(images) => onPatch({ images })}
                    label={t("product.create.images.uploadLabel")}
                    coverLabel={t("product.create.images.coverLabel")}
                    maxCount={5}
                    size="size-28"
                    upload={upload}
                    resolveSrc={imgUrl}
                />
                {errors["images"] ? (
                    <ErrorText text={errorText(errors["images"])} />
                ) : (
                    <FieldDescription>{t("product.create.images.hint")}</FieldDescription>
                )}
            </Field>

            <Field orientation="horizontal">
                <FieldLabel>{t("product.create.sevenDay.label")}</FieldLabel>
                <label className="flex items-center gap-2 pt-2 text-sm">
                    <input
                        type="checkbox"
                        checked={draft.sevenDayReturn}
                        onChange={(event) => onPatch({ sevenDayReturn: event.target.checked })}
                        className="size-4 accent-primary"
                    />
                    {t("product.create.sevenDay.checkbox")}
                </label>
                <FieldDescription>{t("product.create.sevenDay.hint")}</FieldDescription>
            </Field>

            <Field orientation="horizontal">
                <FieldLabel>{t("product.create.detailImages.label")}</FieldLabel>
                <ImageUploadGrid
                    value={draft.detailImages}
                    onChange={(detailImages) => onPatch({ detailImages })}
                    label={t("product.create.detailImages.uploadLabel")}
                    maxCount={30}
                    size="size-24"
                    upload={upload}
                    resolveSrc={imgUrl}
                />
                <FieldDescription>{t("product.create.detailImages.hint")}</FieldDescription>
            </Field>
        </section>
    )
}

function ErrorText({ text }: { text: string }) {
    return (
        <p
            role="alert"
            className="text-sm text-destructive"
        >
            {text}
        </p>
    )
}

import { Field, FieldDescription, FieldLabel, ImageUploadGrid } from "@shop/ui-web"
import type { CategoryConfig } from "@shop/api/sdk"

import { useT } from "#/locales/use-t"
import { imgUrl } from "#/shared/lib/image"
import { specAttributes, specImageKey, type Dimensions, type SpecImages } from "../model"

export function SpecImageSection({
    config,
    dimensions,
    images,
    onChange,
    upload,
}: {
    config: CategoryConfig
    dimensions: Dimensions
    images: SpecImages
    onChange: (next: SpecImages) => void
    upload: (file: File) => Promise<string>
}) {
    const t = useT("product")
    const groups = specAttributes(config)
        .map((attribute) => ({
            attribute,
            values: (dimensions[attribute.id] ?? []).filter((value) => value.trim() !== ""),
        }))
        .filter((group) => group.values.length > 0)

    if (groups.length === 0) return null

    function setImage(attributeId: string, value: string, image: string | undefined) {
        const key = specImageKey(attributeId, value)
        const next = { ...images }
        if (image === undefined || image === "") {
            delete next[key]
        } else {
            next[key] = image
        }
        onChange(next)
    }

    return (
        <section
            id="section-spec-images"
            className="scroll-mt-16 space-y-4 rounded-lg bg-background p-5 shadow-sm"
        >
            <h2 className="text-base font-semibold">{t("product.create.section.specImages")}</h2>
            <FieldDescription>{t("product.create.specImages.hint")}</FieldDescription>
            {groups.map((group) => (
                <div
                    key={group.attribute.id}
                    className="space-y-2"
                >
                    <p className="text-sm font-medium">{group.attribute.name}</p>
                    <div className="flex flex-wrap gap-4">
                        {group.values.map((value) => (
                            <Field
                                key={value}
                                orientation="vertical"
                                className="w-28"
                            >
                                <FieldLabel>{value}</FieldLabel>
                                <ImageUploadGrid
                                    value={
                                        images[specImageKey(group.attribute.id, value)] ===
                                        undefined
                                            ? []
                                            : [images[specImageKey(group.attribute.id, value)]!]
                                    }
                                    onChange={(next) =>
                                        setImage(group.attribute.id, value, next[0])
                                    }
                                    label={t("product.create.specImages.uploadLabel")}
                                    maxCount={1}
                                    size="size-24"
                                    upload={upload}
                                    resolveSrc={imgUrl}
                                />
                            </Field>
                        ))}
                    </div>
                </div>
            ))}
        </section>
    )
}

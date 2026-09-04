"""Build responsive AVIF and WebP variants for checked-in Facebook replays."""

from pathlib import Path

from PIL import Image, ImageOps


IMAGE_DIRECTORY = Path(__file__).resolve().parents[1] / "images"
TARGET_WIDTHS = (320, 540)


def resized(image: Image.Image, width: int) -> Image.Image:
    if image.width == width:
        return image.copy()

    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def main() -> None:
    sources = sorted(IMAGE_DIRECTORY.glob("facebook-live-*.jpg"))
    if not sources:
        raise SystemExit("No Facebook replay JPEGs found.")

    for source in sources:
        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")

        for width in TARGET_WIDTHS:
            variant = resized(image, width)
            stem = source.with_suffix("")
            variant.save(
                stem.with_name(f"{stem.name}-{width}.avif"),
                "AVIF",
                quality=60,
                speed=6,
            )
            variant.save(
                stem.with_name(f"{stem.name}-{width}.webp"),
                "WEBP",
                quality=78,
                method=6,
            )
            variant.close()


if __name__ == "__main__":
    main()

import type { ImgHTMLAttributes } from 'react';

interface PictureImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

/**
 * Drop-in replacement for <img> that adds avif/webp <source> elements as modern format
 * alternatives, with the original jpg/png as fallback.
 */
export function PictureImg({ src, className, ...props }: PictureImgProps) {
  const base = src.replace(/\.(jpg|jpeg|png)$/i, '');
  const isConvertible = /\.(jpg|jpeg|png)$/i.test(src);

  if (!isConvertible) {
    return <img src={src} className={className} {...props} />;
  }

  return (
    <picture>
      <source srcSet={`${base}.avif`} type="image/avif" />
      <source srcSet={`${base}.webp`} type="image/webp" />
      <img src={src} className={className} {...props} />
    </picture>
  );
}

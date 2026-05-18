"use client";

import Image, { ImageProps } from "next/image";
import { ReactNode, useState } from "react";

type Props = Omit<ImageProps, "src" | "onError"> & {
  src: string | null | undefined;
  fallback: ReactNode;
};

/**
 * Image wrapper that renders `fallback` when:
 *   - src is null / empty
 *   - browser fires onError on the Image (broken URL / 404 / CORS / etc.)
 */
export default function RecipeImage({ src, alt, fallback, ...rest }: Props) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return <>{fallback}</>;
  }

  return (
    <Image
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      {...rest}
    />
  );
}

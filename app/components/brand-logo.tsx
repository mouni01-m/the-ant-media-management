import Image from "next/image";

type BrandLogoProps = {
  src?: string | null;
  className?: string;
  compact?: boolean;
  priority?: boolean;
};

export default function BrandLogo({
  src,
  className = "",
  compact = false,
  priority = false,
}: BrandLogoProps) {
  const imageSrc = typeof src === "string" && src.trim() ? src.trim() : "/logo.png";

  return (
    <div
      className={`brand-logo ${compact ? "brand-logo--compact" : "h-[4.4rem] w-full max-w-[15rem]"} ${className}`}
    >
      <Image
        src={imageSrc}
        alt="THE ANT MEDIA"
        fill
        priority={priority}
        sizes={compact ? "48px" : "(max-width: 640px) 100vw, 240px"}
        className="object-contain"
      />
    </div>
  );
}

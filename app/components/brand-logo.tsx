import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  priority?: boolean;
};

export default function BrandLogo({
  className = "",
  compact = false,
  priority = false,
}: BrandLogoProps) {
  return (
    <div
      className={`brand-logo ${compact ? "brand-logo--compact" : ""} ${className}`}
    >
      <Image
        src="/logo.png"
        alt="THE ANT MEDIA"
        fill
        priority={priority}
        sizes={compact ? "48px" : "240px"}
        className="object-contain"
      />
    </div>
  );
}

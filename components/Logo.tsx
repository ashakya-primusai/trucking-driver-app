import Image from "next/image";
import Link from "next/link";
import enroutLogo from "@/assets/enrout_logo.png";
import { cn } from "@/lib/utils";

const sizeClasses = {
  nav: "h-9 w-auto",
  xs: "h-14 w-auto",
  sm: "h-20 w-auto",
  md: "h-28 w-auto",
  lg: "h-[9rem] w-auto",
} as const;

type LogoProps = {
  className?: string;
  size?: keyof typeof sizeClasses;
  href?: string;
};

export function Logo({ className, size = "md", href = "/home" }: LogoProps) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center shrink-0", className)}
      aria-label="Enrout Ops home"
    >
      <Image
        src={enroutLogo}
        alt="Enrout Ops"
        className={cn(sizeClasses[size], "object-contain object-left")}
        priority
      />
    </Link>
  );
}

"use client";

/* Kokonut UI Pro Product Button adaptation. See SOURCES.md. */
import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@opal/utils";
import "@/sections/customer/pro/product-button.css";

interface ProductButtonStyleProps {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "default" | "compact" | "icon";
}

type ProductButtonProps = ProductButtonStyleProps & ComponentProps<"button">;
export function ProductButton({
  variant = "primary",
  size = "default",
  className,
  type = "button",
  ...props
}: ProductButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "kokonut-product-button",
        `kokonut-product-button--${variant}`,
        `kokonut-product-button--${size}`,
        className
      )}
      {...props}
    />
  );
}

type ProductLinkProps = ProductButtonStyleProps & ComponentProps<typeof Link>;
export function ProductLink({
  variant = "primary",
  size = "default",
  className,
  ...props
}: ProductLinkProps) {
  return (
    <Link
      className={cn(
        "kokonut-product-button",
        `kokonut-product-button--${variant}`,
        `kokonut-product-button--${size}`,
        className
      )}
      {...props}
    />
  );
}

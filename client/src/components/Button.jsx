import React from "react";

export default function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}) {
  const base =
    "inline-flex items-center justify-center rounded-full text-sm font-semibold transition focus:outline-none";

  const variants = {
    primary: "bg-primary-500 hover:bg-primary-600 text-grey-300 shadow-green hover:shadow-green-lg",  
    ghost: "bg-transparent border border-primary-500 text-primary-500",
    light: "bg-card-light text-grey-300",
  };

  const variantClass = variants[variant] || variants.primary;

  return (
    <button className={`${base} ${variantClass} ${className}`} {...props}>
      {children}
    </button>
  );
}

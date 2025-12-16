import React from "react";

export default function Input({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  className = "",
  ...props
}) {
  return (
    <div>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-medium text-gray-300 mb-1"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`w-full px-4 py-3 rounded-lg border border-card-default bg-card-light text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 ${className}`}
        {...props}
      />
    </div>
  );
}

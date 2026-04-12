type ButtonProps = {
  label: string;
  variant?: "primary" | "secondary";
};

export function Button({ label, variant = "primary" }: ButtonProps) {
  const background = variant === "primary" ? "#24411e" : "#ffb25b";
  const color = variant === "primary" ? "#f7f2ea" : "#1f2b38";

  return (
    <button
      type="button"
      style={{
        border: "none",
        borderRadius: "999px",
        padding: "12px 20px",
        background,
        color,
        fontSize: "16px",
        cursor: "pointer"
      }}
    >
      {label}
    </button>
  );
}

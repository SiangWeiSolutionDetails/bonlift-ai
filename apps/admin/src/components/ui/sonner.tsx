import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/theme/use-theme"

// shadcn's sonner, on the app's own theme hook instead of next-themes
function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }

"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-[13px] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,opacity] duration-100 outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/45 active:duration-0 disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/0.16),inset_0_1px_0_0_rgb(255_255_255/0.17)] hover:bg-primary/92 active:bg-primary/85 active:shadow-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none",
        outline:
          "border-border bg-elevated text-foreground shadow-[0_1px_1.5px_rgb(0_0_0/0.07)] hover:bg-muted aria-expanded:bg-muted active:bg-accent active:shadow-none dark:border-white/12 dark:bg-white/8 dark:shadow-none dark:hover:bg-white/12 dark:active:bg-white/16",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent active:bg-accent aria-expanded:bg-accent",
        ghost:
          "text-foreground hover:bg-accent/60 aria-expanded:bg-accent/60 active:bg-accent dark:hover:bg-white/8 dark:active:bg-white/12",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/16 active:bg-destructive/22 focus-visible:border-destructive/40 focus-visible:ring-destructive/25 dark:bg-destructive/18 dark:hover:bg-destructive/26",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-7 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-[22px] gap-1 rounded-[5px] px-2 text-[11px] in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-6 gap-1.5 rounded-[5px] px-2.5 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-8 gap-2 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-7",
        "icon-xs":
          "size-[22px] rounded-[5px] in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-6 rounded-[5px] in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

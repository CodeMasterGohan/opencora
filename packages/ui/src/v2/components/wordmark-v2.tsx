import { type ComponentProps } from "solid-js"

export function WordmarkV2(props: Pick<ComponentProps<"svg">, "class">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <text
        x="50%"
        y="50%"
        dominant-baseline="middle"
        text-anchor="middle"
        fill="currentColor"
        font-family="system-ui, -apple-system, sans-serif"
        font-weight="bold"
        font-size="96"
        letter-spacing="4"
      >
        OPENCORA
      </text>
    </svg>
  )
}

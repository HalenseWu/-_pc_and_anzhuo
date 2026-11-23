interface IconProps {
  id: string
  size?: number
}

export function Icon({ id, size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  )
}

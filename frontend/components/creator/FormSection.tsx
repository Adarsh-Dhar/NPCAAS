interface FormSectionProps {
  title: string
  description?: string
  borderColor: 'orange' | 'purple' | 'red' | 'yellow' | 'cyan' | 'green'
  children: React.ReactNode
}

const colorMap = {
  orange: 'retro-card-blue',
  purple: 'retro-card-purple',
  red: 'retro-card-blue',
  yellow: 'retro-card-blue',
  cyan: 'retro-card-blue',
  green: 'retro-card-blue',
}

export default function FormSection({
  title,
  description,
  borderColor,
  children,
}: FormSectionProps) {
  return (
    <div className={`${colorMap[borderColor]}`}>
      {/* Header */}
      <div className="mb-4 pb-3 border-b-2 border-current">
        <h3 className="text-sm font-bold uppercase text-white">{title}</h3>
        {description && (
          <p className="text-xs text-gray-300 mt-1">{description}</p>
        )}
      </div>

      {/* Content */}
      <div className="space-y-4">{children}</div>
    </div>
  )
}
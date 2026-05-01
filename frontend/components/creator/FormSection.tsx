interface FormSectionProps {
  title: string
  description?: string
  borderColor: 'purple' | 'blue'
  children: React.ReactNode
}

const colorMap = {
  blue : 'retro-border-blue',
  purple : 'retro-border-purple',
}

export default function FormSection({
  title,
  description,
  borderColor,
  children,
}: FormSectionProps) {
  return (
    <div className={`${colorMap[borderColor as keyof typeof colorMap]} border-2 rounded-lg p-6`}>
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
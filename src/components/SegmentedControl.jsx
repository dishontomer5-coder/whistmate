export default function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="flex bg-secondary rounded-full p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-1.5 px-2 rounded-full text-center font-medium transition-colors whitespace-nowrap ${
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground'
          }`}
        >
          <span className="hidden sm:inline">{opt.label}</span>
          <span className="sm:hidden">{opt.shortLabel || opt.label}</span>
        </button>
      ))}
    </div>
  );
}
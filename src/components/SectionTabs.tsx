import './SectionTabs.css';

interface SectionTabsOption {
  value: string;
  label: string;
}

interface SectionTabsProps {
  options: SectionTabsOption[];
  value: string;
  onChange: (value: string) => void;
}

export default function SectionTabs({ options, value, onChange }: SectionTabsProps) {
  return (
    <div className="section-tabs" role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`section-tab ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
          role="tab"
          aria-selected={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

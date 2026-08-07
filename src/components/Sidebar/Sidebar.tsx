import './Sidebar.css';

interface SidebarItem {
  id: string;
  label: string;
  count?: number;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

interface SidebarProps {
  items: SidebarItem[];
}

function Sidebar({ items }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-content">
        {items.map((item) => (
          <div
            key={item.id}
            className={`sidebar-item ${item.active ? 'active' : ''} ${
              item.disabled ? 'disabled' : ''
            }`}
            onClick={item.onClick && !item.disabled ? item.onClick : undefined}
          >
            <span className="sidebar-item-label">{item.label}</span>
            {item.count !== undefined && (
              <span className="sidebar-item-count">{item.count}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Sidebar;

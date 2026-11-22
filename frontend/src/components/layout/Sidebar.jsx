import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Video, 
  Users, 
  FileText, 
  Plus, 
  LogOut, 
  Settings,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Sidebar = ({ isOpen, setIsOpen }) => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Interviews', path: '/interviews', icon: Video },
    { name: 'Candidates', path: '/candidates', icon: Users },
    { name: 'Evaluation Reports', path: '/reports', icon: FileText },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`
        fixed top-0 bottom-0 left-0 z-40 w-64 bg-white 
        border-r border-gray-200 flex flex-col transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Branding & Logo - GFG Clean Style */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <NavLink 
            to="/dashboard" 
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2.5"
          >
            <div className="w-8 h-8 rounded bg-[#2F855A] flex items-center justify-center text-white font-bold text-sm">
              BG
            </div>
            <div>
              <span className="font-bold text-sm text-gray-900 tracking-tight">BiasGuard Portal</span>
              <p className="text-[11px] text-gray-500 font-mono">Evaluation Portal</p>
            </div>
          </NavLink>
        </div>

        {/* Primary Call-To-Action: + New Interview */}
        <div className="p-3">
          <NavLink
            to="/create-interview"
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded bg-[#2F855A] hover:bg-[#276749] text-white font-semibold text-xs transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Interview</span>
          </NavLink>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) => `
                  flex items-center gap-3 px-3 py-2 rounded text-xs font-semibold transition-colors
                  ${isActive 
                    ? 'bg-green-50 text-[#2F855A] border-l-4 border-[#2F855A]' 
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'}
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Session Footer */}
        <div className="p-3 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="overflow-hidden mr-2">
              <p className="text-xs font-bold text-gray-900 truncate">{user?.name || 'Evaluator'}</p>
              <p className="text-[10px] text-gray-500 font-mono truncate">{user?.email || 'evaluator@bitmesra.ac.in'}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-1.5 text-gray-500 hover:text-red-600 rounded hover:bg-gray-200 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, Settings, Sparkles, Code2, Globe, Calendar, Image as ImageIcon, Send } from 'lucide-react';
import clsx from 'clsx';

export default function Sidebar() {
  const pathname = usePathname();

  const links = [
    { href: '/chat', label: 'Chat', icon: MessageSquare },
    { href: '/codework', label: 'Codework', icon: Code2 },
    { href: '/browser', label: 'Browser', icon: Globe },
    { href: '/planner', label: 'Planner', icon: Calendar },
    { href: '/studio', label: 'Studio', icon: ImageIcon },
  ];

  const bottomLinks = [
    { href: '/skills', label: 'Skills', icon: Sparkles },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 flex flex-col border-r border-white/15 bg-[rgba(0,0,0,0.8)] [backdrop-filter:saturate(180%)_blur(20px)] pt-6 pb-4">
      {/* Brand */}
      <div className="px-6 flex items-center gap-3 mb-8">
        <div className="w-12 h-10 flex items-center justify-center">
          <Image
            src="/takeover-logo.svg"
            alt="Takeover logo"
            width={48}
            height={40}
            className="w-full h-full object-contain drop-shadow-[0_6px_18px_rgba(0,113,227,0.25)]"
            priority
          />
        </div>
        <div>
          <h1 className="font-semibold text-lg leading-tight tracking-tight text-white">Takeover</h1>
          <div className="text-[10px] text-[var(--text-subtle)] uppercase tracking-widest font-semibold flex items-center gap-1.5">
            <div className="status-online"></div> Local
          </div>
        </div>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-4 space-y-1">
        {links.map((link) => {
          const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} className={clsx('nav-item', isActive && 'active')}>
              <Icon size={18} className={isActive ? 'text-[#ffffff]' : 'text-[var(--text-muted)]'} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Telegram Banner */}
      <div className="px-4 mb-4">
        <div className="rounded-xl border border-white/15 bg-[#1d1d1f] p-3 flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-[#0071e3] opacity-20 blur-xl rounded-full translate-x-1/2 -translate-y-1/2"></div>
          <div className="flex items-center gap-2 text-[#2997ff] font-medium text-sm">
            <Send size={14} /> Telegram
          </div>
          <div className="text-xs text-[var(--text-subtle)]">
            Connect bot to control agent from your phone.
          </div>
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="px-4 space-y-1">
        {bottomLinks.map((link) => {
          const isActive = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} className={clsx('nav-item', isActive && 'active')}>
              <Icon size={18} className={isActive ? 'text-[#ffffff]' : 'text-[var(--text-muted)]'} />
              {link.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

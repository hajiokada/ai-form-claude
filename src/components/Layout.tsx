import { ReactNode } from 'react';

export default function Layout({
  title,
  children,
  sidebar,
}: {
  title: string;
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  return (
    <div className="flex flex-col h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-full mx-auto px-4 h-12 flex items-center justify-center">
          <h1 className="font-semibold truncate">{title}</h1>
        </div>
      </header>
      <div className="flex-1 flex min-h-0">
        {sidebar ? (
          <aside className="hidden md:flex md:flex-col w-72 border-r border-slate-200 bg-white">
            {sidebar}
          </aside>
        ) : null}
        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

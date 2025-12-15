import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-800">
      <header className="bg-monk-800 text-monk-50 py-4 px-6 shadow-md sticky top-0 z-50 border-b border-monk-700">
        <div className="max-w-6xl mx-auto flex items-center gap-6">
          <div className="flex items-center space-x-4 group cursor-pointer" onClick={() => window.location.reload()}>
            {/* Zen Enso Logo - Minimalist & Atmospheric */}
            <div className="relative w-12 h-12 flex items-center justify-center">
               <svg viewBox="0 0 100 100" className="w-full h-full text-monk-100 fill-current opacity-90">
                  {/* Outer Enso Brush Stroke */}
                  <path d="M50,95C25.1,95,5,74.9,5,50S25.1,5,50,5c10.5,0,20.2,3.6,28,9.5l-4.5,5.5C67.1,15.6,58.9,13,50,13C29.6,13,13,29.6,13,50s16.6,37,37,37s37-16.6,37-37c0-2.8-0.3-5.5-0.9-8.1l7.8-2.2C94.6,42.8,95,46.3,95,50C95,74.9,74.9,95,50,95z" />
                  {/* Inner Abstract Lotus/Meditator */}
                  <path d="M50,28c-2,0-4,3-6,7c-3,6-7,15-7,15s6,3,13,3s13-3,13-3s-4-9-7-15C54,31,52,28,50,28z M50,60c-8,0-15,4-15,10c0,3,15,8,15,8s15-5,15-8C65,64,58,60,50,60z" opacity="0.8"/>
               </svg>
            </div>
            
            <div className="flex flex-col -space-y-1">
               <h1 className="text-2xl font-serif font-medium tracking-widest text-monk-50">
                 ZEN·CREATE
               </h1>
               <span className="text-[10px] font-sans text-monk-300 tracking-[0.3em] uppercase opacity-80">
                 Dharma Studio
               </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center space-x-6">
             <div className="h-8 w-px bg-monk-600"></div>
             <span className="text-xs font-serif text-monk-300 tracking-widest">
                诸恶莫作 · 众善奉行
             </span>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-6xl mx-auto w-full p-4 md:p-8">
        {title && <h2 className="text-3xl font-serif text-monk-900 mb-8 border-b-2 border-monk-200 pb-2">{title}</h2>}
        {children}
      </main>

      <footer className="bg-monk-100 text-monk-800 py-6 text-center text-sm border-t border-monk-200">
        <p>&copy; {new Date().getFullYear()} ZenCreate. 自净其意，是诸佛教。</p>
        <p className="text-xs text-monk-400 mt-2 opacity-80">创作者：涂继明</p>
      </footer>
    </div>
  );
};
/**
 * AutoNexa console layout: a sticky index of the page's sections on wide screens, the
 * sections themselves on the right. Phones show the sections stacked, without the index.
 */
export function ConsoleLayout({
  label,
  sections,
  children,
}: {
  label: string;
  sections: { id: string; title: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
      <nav aria-label={label} className="hidden lg:sticky lg:top-0 lg:grid lg:gap-1">
        <p className="eyebrow text-muted-foreground mb-2 px-3">{label}</p>
        {sections.map((section, index) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="text-muted-foreground hover:bg-card hover:text-foreground hover:ring-border flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-[color,background-color,box-shadow] hover:shadow-xs hover:ring-1"
          >
            <span className="text-brand font-mono text-[10px] tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            {section.title}
          </a>
        ))}
      </nav>
      <div className="grid min-w-0 gap-6 [&>*]:scroll-mt-6">{children}</div>
    </div>
  );
}

import Link from "next/link";

type Props = {
  icon: React.ReactNode;
  label: string;
  /** Small text on the right (e.g. "POD needed"). */
  detail?: string | null;
  tone?: "default" | "warning" | "danger";
  onClick?: () => void;
  href?: string;
  /** "tile" = square card for the home quick-actions grid. */
  variant?: "row" | "tile";
};

/** One tappable row in a grouped list: icon · label · detail · chevron. */
export function MenuRow({ icon, label, detail, tone = "default", onClick, href, variant = "row" }: Props) {
  if (variant === "tile") return <MenuTile icon={icon} label={label} detail={detail} tone={tone} onClick={onClick} href={href} />;
  const labelColor = tone === "danger" ? "text-[color:var(--danger)]" : "text-[color:var(--ink)]";
  const detailColor = tone === "warning" ? "bg-amber-500/15 text-amber-900 rounded-full px-2.5 py-0.5" : "text-[color:var(--ink-muted)]";
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--canvas)] text-[18px]" aria-hidden>
        {icon}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[16px] font-medium ${labelColor}`}>{label}</span>
      {detail ? <span className={`shrink-0 text-[13px] font-semibold ${detailColor}`}>{detail}</span> : null}
      <span className="shrink-0 text-[20px] leading-none text-[color:var(--ink-faint)]" aria-hidden>›</span>
    </>
  );
  const cls = "flex w-full items-center gap-3 px-4 py-3.5 text-left no-underline active:bg-[color:var(--canvas)]";
  return href ? (
    <Link href={href} className={cls}>{body}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{body}</button>
  );
}

function MenuTile({ icon, label, detail, tone, onClick, href }: Omit<Props, "variant">) {
  const body = (
    <>
      <span className="flex items-start justify-between">
        <span className="text-[26px] leading-none" aria-hidden>{icon}</span>
        {detail ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              tone === "warning" ? "bg-amber-500/15 text-amber-900" : "bg-[color:var(--canvas)] text-[color:var(--ink-muted)]"
            }`}
          >
            {detail}
          </span>
        ) : null}
      </span>
      <span className="mt-auto text-[15px] font-semibold text-[color:var(--ink)]">{label}</span>
    </>
  );
  const cls = "flex h-[104px] flex-col rounded-2xl bg-[color:var(--surface)] p-4 text-left no-underline active:scale-[0.98]";
  return href ? (
    <Link href={href} className={cls}>{body}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{body}</button>
  );
}

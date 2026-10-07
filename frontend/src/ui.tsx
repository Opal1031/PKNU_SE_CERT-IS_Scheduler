import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import type { Id, Model, ModalState, Preferences, Session } from './model';
import { name } from './model';
const paths = {
  "home": "m3 10 9-7 9 7v10H6V10m3 10v-7h6v7",
  "calendar": "M4 5h16v16H4zM4 10h16M8 2v6m8-6v6",
  "reservation": "M4 5h16v16H4zM4 10h16M8 2v6m8-6v6m-9 7 3 3 5-5",
  "waffle": "M3 3h4v4H3zM10 3h4v4h-4zM17 3h4v4h-4zM3 10h4v4H3zM10 10h4v4h-4zM17 10h4v4h-4zM3 17h4v4H3zM10 17h4v4h-4zM17 17h4v4h-4z",
  "plus": "M12 4v16M4 12h16",
  "pin": "M12 17v5M9 3h6l-1 7 4 3v3H6v-3l4-3-1-7z",
  "close": "m5 5 14 14M5 19 19 5",
  "search": "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6",
  "tag": "M3 3h8l10 10-8 8L3 11zM7 7h.01",
  "settings": "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  "document": "M5 2h10l4 4v16H5zM14 2v5h5M8 12h8m-8 4h8",
  "filter": "M3 5h18M6 12h12M9 19h6",
  "left": "m15 4-8 8 8 8",
  "right": "m9 4 8 8-8 8",
  "user": "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-3a8 6 0 0 1 16 0v3",
  "download": "M12 2v14m-5-5 5 5 5-5M3 17v5h18v-5",
  "history": "M3 10a9 9 0 1 1 1 8M3 3v7h7M12 6v7l4 2",
  "sort": "M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4",
  "ai": "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
  "up": "m4 15 8-8 8 8",
  "down": "m4 9 8 8 8-8"
};
export type IconName = keyof typeof paths;
export function Icon({ name: kind }: { name: IconName }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>; }
export function IconButton({ title, icon = 'settings', onClick, disabled }: { title: string; icon?: IconName; onClick: () => void; disabled?: boolean }) { return <button type="button" className="icon-button" title={title} aria-label={title} onClick={onClick} disabled={disabled}><Icon name={icon} /></button>; }
export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="form-field"><span>{label}</span><input {...props} /></label>; }
export function Area({ label, name: fieldName, value }: { label: string; name: string; value?: string }) { return <label className="form-field"><span>{label}</span><textarea name={fieldName} rows={3} maxLength={3000} defaultValue={value} /></label>; }
export function Select({ label, items, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; items: (string | [Id, string])[] }) { return <label className="form-field"><span>{label}</span><select {...props}>{items.map(x => { const [value, text] = typeof x === 'string' ? [x, x] : x; return <option key={value} value={value}>{text}</option>; })}</select></label>; }
export function Checks({ fieldName, ids, selected, onChange }: { fieldName: string; ids: string[]; selected: string[]; onChange?: (ids: string[]) => void }) { return <div className="checkboxes">{ids.map(user => <label key={user}><input type="checkbox" name={fieldName} value={user} {...(onChange ? { checked: selected.includes(user) } : { defaultChecked: selected.includes(user) })} onChange={e => onChange?.(e.target.checked ? [...selected, user] : selected.filter(x => x !== user))} />{name(user)}</label>)}</div>; }
export function Heading({ title, children }: { title: string; children?: ReactNode }) { return <div className="page-heading"><h1>{title}</h1><div className="button-row">{children}</div></div>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty-state">{children}</div>; }
export interface ViewProps {
  model: Model; session: Session; prefs: Preferences;
  setPrefs: (patch: Partial<Preferences>) => void;
  open: (modal: ModalState) => void; notify: (message: string) => void;
}
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part);
}
// ponytail: basic Markdown only; use a maintained parser when full Markdown becomes required.
export function Markdown({ body }: { body: string }) {
  const result: ReactNode[] = []; let code: string[] | undefined;
  for (const [i, line] of body.split('\n').entries()) {
    if (line.startsWith('```')) { if (code) { result.push(<pre key={i}>{code.join('\n')}</pre>); code = undefined; } else code = []; continue; }
    if (code) { code.push(line); continue; }
    const heading = /^(#{1,3}) (.*)/.exec(line);
    result.push(heading ? heading[1].length === 1 ? <h1 key={i}>{inline(heading[2])}</h1> : heading[1].length === 2 ? <h2 key={i}>{inline(heading[2])}</h2> : <h3 key={i}>{inline(heading[2])}</h3> : line ? <p key={i}>{inline(line.startsWith('- ') ? `• ${line.slice(2)}` : line)}</p> : <br key={i} />);
  }
  if (code) result.push(<pre key="unfinished-code">{code.join('\n')}</pre>);
  return <div className="markdown-preview">{result}</div>;
}

import type { ReactNode } from 'react';

// Componentes visuais compartilhados (Script 11). Mantêm a identidade existente: fundo slate, verde-esmeralda
// como cor de ação principal, cantos arredondados e bordas suaves. Sem biblioteca de UI externa.

export const buttonClass = 'inline-flex items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50';
export const primaryButtonClass = 'inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50';
export const dangerButtonClass = 'inline-flex items-center justify-center gap-1 rounded-lg border border-red-800 bg-slate-900 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-950/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50';
export const inputClass = 'rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-700 disabled:bg-slate-800';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0"><h1 className="text-2xl font-bold text-slate-100">{title}</h1>
      {description && <p className="text-sm text-slate-400">{description}</p>}</div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>;
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
const tones: Record<Tone, string> = {
  success: 'border-emerald-800 bg-emerald-950/50 text-emerald-300',
  warning: 'border-amber-900 bg-amber-950/40 text-amber-200',
  danger: 'border-red-900 bg-red-950/40 text-red-200',
  info: 'border-sky-900 bg-sky-950/40 text-sky-200',
  neutral: 'border-slate-800 bg-slate-800 text-slate-300',
};

// Situações conhecidas do sistema → tom e rótulo. Sempre texto + cor (nunca só cor).
const statusTone: Record<string, [Tone, string]> = {
  ATIVO: ['success', 'Ativo'], INATIVO: ['neutral', 'Inativo'], CANCELADO: ['danger', 'Cancelado'],
  ABERTA: ['info', 'Aberta'], FECHADA: ['neutral', 'Fechada'], FINALIZADA: ['success', 'Finalizada'], CANCELADA: ['danger', 'Cancelada'],
  PENDENTE: ['warning', 'Pendente'], ENVIADO: ['info', 'Enviado'], RECEBIDO: ['success', 'Recebido'],
  ENTRADA: ['success', 'Entrada'], SAIDA_VENDA: ['info', 'Saída por venda'], PERDA: ['danger', 'Perda'], AJUSTE: ['warning', 'Ajuste'],
  BAIXO: ['warning', 'Abaixo do mínimo'], ACIMA: ['info', 'Acima do máximo'], NORMAL: ['neutral', 'Normal'],
  VENCIDO: ['danger', 'Vencido'], PROXIMO: ['warning', 'Próximo do vencimento'], SEM_VALIDADE: ['neutral', 'Sem validade'],
  CONFERIDO: ['success', 'Conferido'], FALTA: ['danger', 'Falta'], SOBRA: ['warning', 'Sobra'],
  baixo: ['warning', 'Baixo'], alto: ['info', 'Alto'], normal: ['neutral', 'Normal'],
};

export function Badge({ status, children, tone }: { status?: string; children?: ReactNode; tone?: Tone }) {
  const [known, label] = status && statusTone[status] ? statusTone[status] : [tone ?? 'neutral', status];
  return <span className={'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ' + tones[tone ?? known]}>{children ?? label}</span>;
}

export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return <p role={tone === 'danger' ? 'alert' : 'status'} className={'rounded-lg border px-3 py-2 text-sm ' + tones[tone]}>{children}</p>;
}

export function Loading({ children = 'Carregando…' }: { children?: ReactNode }) {
  return <p role="status" className="flex items-center gap-2 text-sm text-slate-400">
    <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-700" />{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900 px-3 py-4 text-center text-sm text-slate-400">{children}</p>;
}

export function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm">
    <span className="font-medium text-slate-300">{label}{required && <span className="text-red-400" aria-hidden="true"> *</span>}</span>
    {children}
    {hint && !error && <span className="text-xs text-slate-400">{hint}</span>}
    {error && <span role="alert" className="text-xs text-red-300">{error}</span>}
  </label>;
}

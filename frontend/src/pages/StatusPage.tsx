import { useQuery } from '@tanstack/react-query';
import { checkStatus } from '../services/health';

function ServiceStatus({ label, status }: { label: string; status: string }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="font-semibold text-slate-100">{label}</h2>
      <p role="status" className="mt-2 text-slate-300">{status}</p>
    </section>
  );
}

export function StatusPage() {
  const query = useQuery({
    queryKey: ['status'],
    queryFn: ({ signal }) => checkStatus(signal),
    retry: false,
    refetchInterval: 15000,
  });

  const apiStatus = query.isPending ? 'Verificando…' : query.isError ? 'API indisponível' : 'Conectada';
  const databaseStatus = query.isPending ? 'Aguardando diagnóstico…'
    : query.isError ? 'Estado desconhecido. A API está indisponível.'
    : query.data;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-semibold text-emerald-400">Status do ambiente</p>
      <h1 className="mt-2 text-3xl font-bold">Supermercado Qualidade Líder</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <ServiceStatus label="API" status={apiStatus} />
        <ServiceStatus label="MySQL" status={databaseStatus} />
      </div>
    </main>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCcw } from "lucide-react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("Erro inesperado na tela:", {
      message: error.message,
      digest: error.digest
    });
  }, [error]);

  return (
    <main className="content error-boundary-page">
      <section className="product-section-card error-boundary-card">
        <div className="metric-top">
          <div>
            <p className="eyebrow">Falha inesperada</p>
            <h1>Nao foi possivel carregar esta tela</h1>
          </div>
          <AlertTriangle size={28} />
        </div>
        <p className="lead">
          Tente carregar novamente. Se o erro continuar, registre o que estava fazendo para avaliarmos o fluxo com seguranca.
        </p>
        {error.digest ? <p className="metric-sub mono">Codigo tecnico: {error.digest}</p> : null}
        <div className="button-row">
          <button className="primary-button" type="button" onClick={reset}>
            <RefreshCcw size={17} />
            Tentar novamente
          </button>
          <Link className="secondary-button" href="/dashboard">Voltar ao dashboard</Link>
        </div>
      </section>
    </main>
  );
}

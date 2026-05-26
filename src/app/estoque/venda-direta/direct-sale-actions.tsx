"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit3, Printer, XCircle } from "lucide-react";

type DirectSaleActionsProps = {
  sale: {
    id: string;
    customerName: string;
    customerDocument: string;
    unitPrice: string;
    discount: string;
    paymentMethod: string;
    note: string;
    status: string;
  };
};

export function DirectSaleActions({ sale }: DirectSaleActionsProps) {
  const router = useRouter();
  const disabled = sale.status !== "ATIVA";

  async function editSale() {
    if (disabled) {
      return;
    }

    const customerName = window.prompt("Cliente", sale.customerName);

    if (!customerName) {
      return;
    }

    const customerDocument = window.prompt("CPF/CNPJ", sale.customerDocument) ?? sale.customerDocument;
    const unitPrice = window.prompt("Preco unitario", sale.unitPrice) ?? sale.unitPrice;
    const discount = window.prompt("Desconto", sale.discount) ?? sale.discount;
    const paymentMethod = window.prompt("Forma de pagamento", sale.paymentMethod) ?? sale.paymentMethod;
    const note = window.prompt("Observacao", sale.note) ?? sale.note;

    const response = await fetch(`/api/estoque/vendas/${sale.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName,
        customerDocument,
        unitPrice,
        discount,
        paymentMethod,
        note
      })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      window.alert(data.error || "Nao foi possivel editar o recibo.");
      return;
    }

    router.refresh();
  }

  async function cancelSale() {
    if (disabled) {
      return;
    }

    const reason = window.prompt("Motivo do cancelamento e estorno do estoque", "Cancelamento solicitado");

    if (!reason) {
      return;
    }

    const confirmed = window.confirm("Cancelar este recibo e devolver a quantidade ao estoque?");

    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/estoque/vendas/${sale.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      window.alert(data.error || "Nao foi possivel cancelar o recibo.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="quote-action-cell">
      <Link className="icon-button" href={`/vendas/recibos/${sale.id}`} title="Reimprimir recibo">
        <Printer size={16} />
      </Link>
      <button className="icon-button" type="button" onClick={editSale} disabled={disabled} title="Editar dados comerciais">
        <Edit3 size={16} />
      </button>
      <button className="icon-button danger" type="button" onClick={cancelSale} disabled={disabled} title="Cancelar e estornar estoque">
        <XCircle size={16} />
      </button>
    </div>
  );
}

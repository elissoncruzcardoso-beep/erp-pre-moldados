"use client";

import { Printer } from "lucide-react";

export function PrintReceiptButton() {
  return (
    <button className="primary-button" type="button" onClick={() => window.print()}>
      <Printer size={16} />
      Imprimir PDF
    </button>
  );
}

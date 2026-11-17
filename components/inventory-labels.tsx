"use client";

import { useEffect, useMemo, useState } from "react";
import * as QRCode from "qrcode";
import type { InventoryUnitView } from "@/lib/inventory-repository";

type Props = {
  units: InventoryUnitView[];
  siteUrl: string;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function InventoryLabels({ units, siteUrl }: Props) {
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(
    () => new Set(units.map((unit) => unit.code)),
  );
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let active = true;

    async function generate() {
      setGenerating(true);
      try {
        const entries = await Promise.all(
          units.map(async (unit) => {
            const target = `${siteUrl}/admin/venda/${encodeURIComponent(
              unit.code,
            )}`;

            const image = await QRCode.toDataURL(target, {
              width: 320,
              margin: 1,
              errorCorrectionLevel: "M",
            });

            return [unit.code, image] as const;
          }),
        );

        if (active) setQrCodes(Object.fromEntries(entries));
      } finally {
        if (active) setGenerating(false);
      }
    }

    void generate();

    return () => {
      active = false;
    };
  }, [siteUrl, units]);

  const selectedUnits = useMemo(
    () => units.filter((unit) => selectedCodes.has(unit.code)),
    [selectedCodes, units],
  );

  const pages = useMemo(() => chunks(selectedUnits, 18), [selectedUnits]);

  function toggle(code: string) {
    setSelectedCodes((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function selectAll() {
    setSelectedCodes(new Set(units.map((unit) => unit.code)));
  }

  function clearSelection() {
    setSelectedCodes(new Set());
  }

  function printLabels() {
    if (!selectedUnits.length) {
      window.alert("Selecione pelo menos uma etiqueta.");
      return;
    }

    if (generating || selectedUnits.some((unit) => !qrCodes[unit.code])) {
      window.alert("Aguarde a geração dos QR Codes.");
      return;
    }

    window.print();
  }

  if (!units.length) {
    return (
      <div className="admin-empty">
        <h3>Nenhuma etiqueta disponível</h3>
        <p>
          Cadastre estoque em uma variação do produto para os códigos
          individuais serem gerados automaticamente.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="inventory-controls">
        <div>
          <strong>{selectedUnits.length} etiqueta(s) selecionada(s)</strong>
          <span>Cada folha A4 comporta até 18 etiquetas de 5 × 4 cm.</span>
        </div>

        <div className="admin-heading-actions">
          <button type="button" className="button button-outline" onClick={clearSelection}>
            Limpar
          </button>
          <button type="button" className="button button-outline" onClick={selectAll}>
            Selecionar todas
          </button>
          <button
            type="button"
            className="button button-dark"
            onClick={printLabels}
            disabled={generating}
          >
            {generating ? "Gerando QR Codes..." : "Imprimir etiquetas"}
          </button>
        </div>
      </div>

      <div className="inventory-selection">
        {units.map((unit) => (
          <label className="inventory-unit-row" key={unit.id}>
            <input
              type="checkbox"
              checked={selectedCodes.has(unit.code)}
              onChange={() => toggle(unit.code)}
            />
            <span>
              <strong>{unit.productName}</strong>
              <small>{unit.color} • Tamanho {unit.size} • {unit.sku}</small>
            </span>
            <b>{money.format(unit.price)}</b>
            <code>{unit.code}</code>
          </label>
        ))}
      </div>

      <div className="inventory-preview-heading">
        <h2>Pré-visualização</h2>
        <p>
          Na janela de impressão, use papel A4, escala 100% e desative
          cabeçalhos e rodapés.
        </p>
      </div>

      <div className="inventory-print-root">
        {pages.map((page, pageIndex) => (
          <div className="inventory-print-page" key={pageIndex}>
            {page.map((unit) => (
              <article className="inventory-label" key={unit.id}>
                <div className="inventory-label-brand">
                  <strong>A&amp;C MODA</strong>
                  <span>ESTOQUE</span>
                </div>

                <div className="inventory-label-content">
                  <div className="inventory-label-copy">
                    <strong>{unit.productName}</strong>
                    <span>{unit.color} • Tam. {unit.size}</span>
                    <b>{money.format(unit.price)}</b>
                    <small>{unit.code}</small>
                  </div>

                  <div className="inventory-label-qr">
                    {qrCodes[unit.code] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qrCodes[unit.code]} alt={`QR Code da peça ${unit.code}`} />
                    ) : (
                      <span>Gerando...</span>
                    )}
                    <small>Escaneie para vender</small>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>

      <style jsx global>{`
        .inventory-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 18px;
          margin-bottom: 18px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 16px;
          background: #fff;
        }

        .inventory-controls > div:first-child {
          display: grid;
          gap: 4px;
        }

        .inventory-controls span {
          font-size: 13px;
          opacity: 0.7;
        }

        .inventory-selection {
          display: grid;
          gap: 8px;
        }

        .inventory-unit-row {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 14px;
          padding: 13px 15px;
          border: 1px solid rgba(0, 0, 0, 0.09);
          border-radius: 13px;
          background: #fff;
          cursor: pointer;
        }

        .inventory-unit-row > span {
          display: grid;
          gap: 3px;
        }

        .inventory-unit-row small {
          opacity: 0.68;
        }

        .inventory-unit-row code {
          font-size: 12px;
        }

        .inventory-preview-heading {
          margin: 32px 0 14px;
        }

        .inventory-preview-heading h2 {
          margin-bottom: 4px;
        }

        .inventory-preview-heading p {
          margin: 0;
          opacity: 0.7;
        }

        .inventory-print-root {
          display: grid;
          gap: 20px;
        }

        .inventory-print-page {
          display: grid;
          grid-template-columns: repeat(3, 50mm);
          grid-auto-rows: 40mm;
          width: fit-content;
          max-width: 100%;
          margin: 0 auto;
          overflow: auto;
          background: #fff;
          box-shadow: 0 10px 35px rgba(0, 0, 0, 0.1);
        }

        .inventory-label {
          box-sizing: border-box;
          width: 50mm;
          height: 40mm;
          overflow: hidden;
          border: 0.25mm solid #222;
          background: #fff;
          color: #111;
          font-family: Arial, Helvetica, sans-serif;
        }

        .inventory-label-brand {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 7mm;
          padding: 0 2.4mm;
          border-bottom: 0.25mm solid #222;
        }

        .inventory-label-brand strong {
          font-size: 8.5pt;
        }

        .inventory-label-brand span {
          font-size: 5.5pt;
          letter-spacing: 0.08em;
        }

        .inventory-label-content {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 22mm;
          gap: 1.5mm;
          height: 33mm;
          padding: 2mm 2.4mm;
          box-sizing: border-box;
        }

        .inventory-label-copy {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .inventory-label-copy > strong {
          display: -webkit-box;
          overflow: hidden;
          font-size: 8pt;
          line-height: 1.08;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .inventory-label-copy > span {
          margin-top: 0.8mm;
          overflow: hidden;
          font-size: 6.2pt;
          line-height: 1.1;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .inventory-label-copy > b {
          margin-top: auto;
          font-size: 9.5pt;
        }

        .inventory-label-copy > small {
          margin-top: 0.5mm;
          font-size: 5.2pt;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }

        .inventory-label-qr {
          display: flex;
          align-items: center;
          flex-direction: column;
          justify-content: center;
        }

        .inventory-label-qr img {
          display: block;
          width: 21mm;
          height: 21mm;
        }

        .inventory-label-qr > span {
          display: grid;
          place-items: center;
          width: 21mm;
          height: 21mm;
          font-size: 6pt;
        }

        .inventory-label-qr small {
          margin-top: 0.4mm;
          font-size: 5.2pt;
          white-space: nowrap;
        }

        @media (max-width: 800px) {
          .inventory-controls {
            align-items: stretch;
            flex-direction: column;
          }

          .inventory-unit-row {
            grid-template-columns: auto minmax(0, 1fr);
          }

          .inventory-unit-row > b,
          .inventory-unit-row > code {
            grid-column: 2;
          }
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .inventory-print-root,
          .inventory-print-root * {
            visibility: visible !important;
          }

          .inventory-print-root {
            position: absolute;
            top: 0;
            left: 0;
            display: block;
            width: 190mm;
            margin: 0 !important;
          }

          .inventory-print-page {
            display: grid;
            grid-template-columns: repeat(3, 50mm);
            grid-template-rows: repeat(6, 40mm);
            width: 150mm;
            height: 240mm;
            margin: 0 auto;
            overflow: visible;
            box-shadow: none;
            break-after: page;
            page-break-after: always;
          }

          .inventory-print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }

          .inventory-label {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </>
  );
}

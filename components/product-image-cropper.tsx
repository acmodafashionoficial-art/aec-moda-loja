"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";

type ProductImageCropperProps = {
  file: File;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void> | void;
};

type LoadedImage = HTMLImageElement;

const PREVIEW_WIDTH = 360;
const PREVIEW_HEIGHT = 450;
const OUTPUT_WIDTH = 1800;
const OUTPUT_HEIGHT = 2250;
const TARGET_RATIO = OUTPUT_WIDTH / OUTPUT_HEIGHT;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function calculateCrop(
  image: LoadedImage,
  zoom: number,
  focusX: number,
  focusY: number,
) {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const sourceRatio = sourceWidth / sourceHeight;

  let cropWidth: number;
  let cropHeight: number;

  if (sourceRatio > TARGET_RATIO) {
    cropHeight = sourceHeight;
    cropWidth = sourceHeight * TARGET_RATIO;
  } else {
    cropWidth = sourceWidth;
    cropHeight = sourceWidth / TARGET_RATIO;
  }

  cropWidth /= zoom;
  cropHeight /= zoom;

  const availableX = Math.max(0, sourceWidth - cropWidth);
  const availableY = Math.max(0, sourceHeight - cropHeight);

  return {
    sourceX: availableX * (focusX / 100),
    sourceY: availableY * (focusY / 100),
    cropWidth,
    cropHeight,
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

export function ProductImageCropper({
  file,
  busy = false,
  onCancel,
  onConfirm,
}: ProductImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<LoadedImage | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startFocusX: number;
    startFocusY: number;
  } | null>(null);

  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [focusX, setFocusX] = useState(50);
  const [focusY, setFocusY] = useState(50);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      imageRef.current = image;
      setReady(true);
      setError("");
    };

    image.onerror = () => {
      setError("Não foi possível abrir esta imagem.");
    };

    image.src = objectUrl;

    return () => {
      imageRef.current = null;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;

    if (!canvas || !image || !ready) return;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(PREVIEW_WIDTH * pixelRatio);
    canvas.height = Math.round(PREVIEW_HEIGHT * pixelRatio);

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    context.fillStyle = "#f3f1ed";
    context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

    const crop = calculateCrop(image, zoom, focusX, focusY);

    context.drawImage(
      image,
      crop.sourceX,
      crop.sourceY,
      crop.cropWidth,
      crop.cropHeight,
      0,
      0,
      PREVIEW_WIDTH,
      PREVIEW_HEIGHT,
    );
  }, [focusX, focusY, ready, zoom]);

  function startDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (!ready || busy || applying) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startFocusX: focusX,
      startFocusY: focusY,
    };
  }

  function moveDrag(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const sensitivity = 100 / Math.max(1, zoom);

    setFocusX(
      clamp(
        drag.startFocusX -
          ((event.clientX - drag.startX) / Math.max(1, bounds.width)) *
            sensitivity,
        0,
        100,
      ),
    );

    setFocusY(
      clamp(
        drag.startFocusY -
          ((event.clientY - drag.startY) / Math.max(1, bounds.height)) *
            sensitivity,
        0,
        100,
      ),
    );
  }

  function stopDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  function centralize() {
    setFocusX(50);
    setFocusY(50);
    setZoom(1);
  }

  async function applyCrop() {
    const image = imageRef.current;
    if (!image || !ready) return;

    setApplying(true);
    setError("");

    try {
      const output = document.createElement("canvas");
      output.width = OUTPUT_WIDTH;
      output.height = OUTPUT_HEIGHT;

      const context = output.getContext("2d");
      if (!context) {
        throw new Error("Não foi possível preparar o recorte.");
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

      const crop = calculateCrop(image, zoom, focusX, focusY);

      context.drawImage(
        image,
        crop.sourceX,
        crop.sourceY,
        crop.cropWidth,
        crop.cropHeight,
        0,
        0,
        OUTPUT_WIDTH,
        OUTPUT_HEIGHT,
      );

      let blob = await canvasToBlob(output, "image/webp", 0.92);
      let extension = "webp";
      let mimeType = "image/webp";

      if (!blob) {
        blob = await canvasToBlob(output, "image/jpeg", 0.92);
        extension = "jpg";
        mimeType = "image/jpeg";
      }

      if (!blob) {
        throw new Error("Não foi possível gerar a imagem ajustada.");
      }

      const baseName =
        file.name.replace(/\.[^.]+$/, "").trim().slice(0, 80) || "produto";

      const adjustedFile = new File(
        [blob],
        `${baseName}-ajustada.${extension}`,
        {
          type: mimeType,
          lastModified: Date.now(),
        },
      );

      await onConfirm(adjustedFile);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível aplicar o ajuste.",
      );
    } finally {
      setApplying(false);
    }
  }

  const blocked = busy || applying;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ajustar enquadramento da foto"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "rgba(0, 0, 0, 0.78)",
      }}
    >
      <div
        style={{
          width: "min(760px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          background: "#fff",
          padding: 22,
          boxShadow: "0 30px 100px rgba(0,0,0,.45)",
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <h2
            style={{
              margin: "0 0 6px",
              font: "500 28px Georgia, serif",
            }}
          >
            Ajustar enquadramento
          </h2>
          <p
            style={{
              margin: 0,
              color: "#666",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            Arraste a foto para posicionar a peça. Use o zoom para aproximar
            sem esticar a imagem.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div>
            <canvas
              ref={canvasRef}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              style={{
                display: "block",
                width: "100%",
                aspectRatio: "4 / 5",
                background: "#eee",
                cursor: ready ? "grab" : "default",
                touchAction: "none",
                border: "1px solid #d8d3cc",
              }}
            />

            {!ready && !error && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "#666",
                }}
              >
                Carregando imagem…
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            <label
              style={{
                display: "grid",
                gap: 8,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Zoom: {zoom.toFixed(2)}x
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={zoom}
                disabled={blocked || !ready}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>

            <label
              style={{
                display: "grid",
                gap: 8,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Posição horizontal
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={focusX}
                disabled={blocked || !ready}
                onChange={(event) => setFocusX(Number(event.target.value))}
              />
            </label>

            <label
              style={{
                display: "grid",
                gap: 8,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Posição vertical
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={focusY}
                disabled={blocked || !ready}
                onChange={(event) => setFocusY(Number(event.target.value))}
              />
            </label>

            <button
              type="button"
              className="button button-outline"
              disabled={blocked || !ready}
              onClick={centralize}
            >
              Centralizar
            </button>

            <div
              style={{
                padding: 13,
                background: "#f5f2ed",
                fontSize: 11,
                lineHeight: 1.55,
                color: "#625d57",
              }}
            >
              A imagem será salva no formato vertical da loja. O preenchimento
              será proporcional, sem bordas e sem deformar a foto.
            </div>
          </div>
        </div>

        {error && (
          <div className="form-error" style={{ marginTop: 16 }}>
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 20,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="button button-outline"
            disabled={blocked}
            onClick={onCancel}
          >
            Pular esta foto
          </button>

          <button
            type="button"
            className="button button-dark"
            disabled={blocked || !ready}
            onClick={applyCrop}
          >
            {blocked ? "Aplicando…" : "Aplicar ajuste"}
          </button>
        </div>
      </div>
    </div>
  );
}

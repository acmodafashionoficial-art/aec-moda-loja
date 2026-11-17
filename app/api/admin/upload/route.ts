import { NextResponse } from "next/server";
import sharp from "sharp";
import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminMutation } from "@/lib/security/admin-request";
import { checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { enforceContentLength, hashedClientId, noStoreHeaders, securityStatus } from "@/lib/security/request";

export const runtime = "nodejs";

type UploadKind = "logo" | "product" | "category" | "hero";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

async function saveLocal(filename: string, buffer: Buffer) {
  const directory = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, filename), buffer, {
    flag: "wx",
    mode: 0o600,
  });
  return `/uploads/${filename}`;
}

async function buildProductImage(
  source: ReturnType<typeof sharp>,
  width: number,
  height: number,
  quality: number,
  withoutEnlargement = false,
) {
  return source
    .clone()
    .resize(width, height, {
      fit: "cover",
      position: "attention",
      withoutEnlargement,
    })
    .sharpen({
      sigma: 0.8,
    })
    .webp({
      quality,
      effort: 4,
    })
    .toBuffer();
}

async function buildCategoryImage(
  source: ReturnType<typeof sharp>,
  width: number,
  height: number,
  quality: number,
) {
  return source
    .clone()
    .resize(width, height, {
      fit: "cover",
      position: "centre",
    })
    .sharpen({
      sigma: 0.65,
    })
    .webp({
      quality,
      effort: 4,
    })
    .toBuffer();
}

async function buildHeroImage(
  source: ReturnType<typeof sharp>,
  width: number,
  height: number,
  quality: number,
) {
  return source
    .clone()
    .resize(width, height, {
      fit: "cover",
      position: "centre",
    })
    .sharpen({
      sigma: 0.7,
    })
    .webp({
      quality,
      effort: 4,
    })
    .toBuffer();
}

export async function POST(request: Request) {
  try {
    await requireAdminMutation(request);
    enforceContentLength(request, MAX_BYTES + 256 * 1024);

    const limit = await checkRateLimit(
      `admin-upload:${hashedClientId(request, "upload")}`,
      {
        limit: 12,
        windowSeconds: 10 * 60,
        blockSeconds: 20 * 60,
      },
    );

    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: "Muitos envios. Aguarde antes de tentar novamente.",
        },
        {
          status: 429,
          headers: noStoreHeaders(rateLimitHeaders(limit)),
        },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const requestedKind = String(formData.get("kind") || "");
    const kind: UploadKind =
      requestedKind === "logo"
        ? "logo"
        : requestedKind === "category"
          ? "category"
          : requestedKind === "hero"
            ? "hero"
            : "product";

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "Selecione uma imagem.",
        },
        {
          status: 400,
          headers: noStoreHeaders(),
        },
      );
    }

    if (!ACCEPTED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error: "Formato não aceito. Use JPG, PNG ou WebP.",
        },
        {
          status: 400,
          headers: noStoreHeaders(),
        },
      );
    }

    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: "A imagem deve ter no máximo 8 MB.",
        },
        {
          status: 400,
          headers: noStoreHeaders(),
        },
      );
    }

    const input = Buffer.from(await file.arrayBuffer());

    if (input.byteLength !== file.size || input.byteLength > MAX_BYTES) {
      throw new Error("Arquivo inválido ou muito grande.");
    }

    const source = sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_PIXELS,
    }).rotate();

    const metadata = await source.metadata();
    const detectedMime = metadata.format
      ? FORMAT_TO_MIME[metadata.format]
      : undefined;

    if (!detectedMime || detectedMime !== file.type) {
      throw new Error(
        "O conteúdo do arquivo não corresponde ao formato informado.",
      );
    }

    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_PIXELS
    ) {
      throw new Error("A imagem possui dimensões inválidas ou excessivas.");
    }

    let fullBuffer: Buffer;
    let thumbnailBuffer: Buffer;
    let safeMaster: Buffer;

    if (kind === "logo") {
      fullBuffer = await source
        .clone()
        .resize(900, 360, {
          fit: "contain",
          background: {
            r: 0,
            g: 0,
            b: 0,
            alpha: 0,
          },
        })
        .webp({
          quality: 88,
          alphaQuality: 90,
          effort: 4,
        })
        .toBuffer();

      thumbnailBuffer = await source
        .clone()
        .resize(450, 180, {
          fit: "contain",
          background: {
            r: 0,
            g: 0,
            b: 0,
            alpha: 0,
          },
        })
        .webp({
          quality: 84,
          alphaQuality: 88,
          effort: 4,
        })
        .toBuffer();

      safeMaster = fullBuffer;
    } else if (kind === "category") {
      fullBuffer = await buildCategoryImage(source, 1080, 1350, 90);
      thumbnailBuffer = await buildCategoryImage(source, 432, 540, 84);
      safeMaster = await buildCategoryImage(source, 1800, 2250, 92);
    } else if (kind === "hero") {
      fullBuffer = await buildHeroImage(source, 1200, 1400, 90);
      thumbnailBuffer = await buildHeroImage(source, 480, 560, 84);
      safeMaster = await buildHeroImage(source, 1800, 2100, 92);
    } else {
      fullBuffer = await buildProductImage(source, 1080, 1350, 90);
      thumbnailBuffer = await buildProductImage(source, 432, 540, 84);
      safeMaster = await buildProductImage(source, 1800, 2250, 92, true);
    }

    const id = randomUUID();
    const datePrefix = new Date().toISOString().slice(0, 7).replace("-", "/");

    const fullSuffix =
      kind === "logo"
        ? "logo-900x360"
        : kind === "category"
          ? "category-1080x1350"
          : kind === "hero"
            ? "hero-1200x1400"
            : "1080x1350";

    const thumbSuffix =
      kind === "logo"
        ? "logo-450x180"
        : kind === "category"
          ? "category-432x540"
          : kind === "hero"
            ? "hero-480x560"
            : "432x540";

    const masterSuffix =
      kind === "logo"
        ? "logo-master"
        : kind === "category"
          ? "category-master-1800x2250"
          : kind === "hero"
            ? "hero-master-1800x2100"
            : "master-1800x2250";

    const fullName = `${datePrefix}/${id}-${fullSuffix}.webp`;
    const thumbName = `${datePrefix}/${id}-${thumbSuffix}.webp`;
    const masterName = `${datePrefix}/${id}-${masterSuffix}.webp`;

    const supabase = getSupabaseAdmin();

    let imageUrl: string;
    let thumbnailUrl: string;
    let originalUrl: string;

    if (supabase) {
      const bucket =
        kind === "logo"
          ? "brand-assets"
          : kind === "category"
            ? "category-images"
            : kind === "hero"
              ? "hero-images"
              : "product-images";

      await supabase.storage
        .createBucket(bucket, {
          public: true,
          fileSizeLimit: MAX_BYTES,
          allowedMimeTypes: ["image/webp"],
        })
        .catch(() => null);

      for (const [name, buffer] of [
        [masterName, safeMaster],
        [fullName, fullBuffer],
        [thumbName, thumbnailBuffer],
      ] as const) {
        const { error } = await supabase.storage
          .from(bucket)
          .upload(name, buffer, {
            contentType: "image/webp",
            upsert: false,
            cacheControl: "31536000",
          });

        if (error) {
          throw new Error(`Erro ao guardar imagem: ${error.message}`);
        }
      }

      originalUrl = supabase.storage
        .from(bucket)
        .getPublicUrl(masterName).data.publicUrl;

      imageUrl = supabase.storage
        .from(bucket)
        .getPublicUrl(fullName).data.publicUrl;

      thumbnailUrl = supabase.storage
        .from(bucket)
        .getPublicUrl(thumbName).data.publicUrl;
    } else {
      originalUrl = await saveLocal(
        masterName.replaceAll("/", "-"),
        safeMaster,
      );

      imageUrl = await saveLocal(
        fullName.replaceAll("/", "-"),
        fullBuffer,
      );

      thumbnailUrl = await saveLocal(
        thumbName.replaceAll("/", "-"),
        thumbnailBuffer,
      );
    }

    await writeAudit({
      request,
      action: "image.upload",
      resourceType: kind,
      resourceId: id,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        bytes: file.size,
      },
    });

    const warning =
      kind === "logo"
        ? metadata.width < 500 || metadata.height < 160
          ? "A logo foi ajustada, mas uma versão maior ficará mais nítida."
          : undefined
        : metadata.width < 800 || metadata.height < 1000
          ? kind === "category"
            ? "A foto da categoria foi ajustada, mas uma imagem vertical maior ficará mais nítida."
            : kind === "hero"
              ? "A foto do banner foi ajustada, mas uma imagem maior ficará mais nítida."
              : "A foto foi ajustada para 1080 × 1350 px, mas a resolução original é baixa."
          : undefined;

    return NextResponse.json(
      {
        imageUrl,
        thumbnailUrl,
        originalUrl,
        width: metadata.width,
        height: metadata.height,
        warning,
      },
      {
        headers: noStoreHeaders(rateLimitHeaders(limit)),
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível processar a imagem.",
      },
      {
        status: securityStatus(error, 400),
        headers: noStoreHeaders(),
      },
    );
  }
}

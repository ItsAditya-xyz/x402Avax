import { NextResponse } from "next/server";

const ARENA_JWT = process.env.ARENA_JWT;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";
const REFERRER = "https://arena.social";
const UPLOAD_POLICY_URL = "https://api.starsarena.com/uploads/getUploadPolicy";
const UPLOAD_TARGET = "https://storage.googleapis.com/starsarena-s3-01/";

function ensureEnv() {
  if (!ARENA_JWT) {
    throw new Error("Missing ARENA_JWT env var");
  }
}

function sanitizeFileName(name) {
  const fallback = `upload-${Date.now()}.png`;
  if (!name) return fallback;
  return name.replace(/[^A-Za-z0-9._-]/g, "_") || fallback;
}

export async function POST(req) {
  try {
    ensureEnv();

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
    }

    const fileType = file.type || "image/png";
    if (!fileType.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "Only image uploads are supported" },
        { status: 400 }
      );
    }

    const fileName = sanitizeFileName(formData.get("filename")?.toString() || file.name);

    const encodedType = encodeURIComponent(fileType);
    const encodedName = encodeURIComponent(fileName);

    const policyRes = await fetch(
      `${UPLOAD_POLICY_URL}?fileType=${encodedType}&fileName=${encodedName}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ARENA_JWT}`,
          "User-Agent": USER_AGENT,
          Referrer: REFERRER,
          "Content-Type": "application/json",
        },
      }
    );

    if (!policyRes.ok) {
      const body = await policyRes.text();
      throw new Error(`Failed to fetch upload policy (${policyRes.status}): ${body}`);
    }

    const policyJson = await policyRes.json();
    const uploadPolicy = policyJson?.uploadPolicy;
    if (!uploadPolicy?.key) {
      throw new Error("Upload policy missing key");
    }

    const policyFields = { ...uploadPolicy, "Content-Type": fileType };
    delete policyFields.enctype;
    delete policyFields.url;

    const uploadForm = new FormData();
    Object.entries(policyFields).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        uploadForm.append(key, value);
      }
    });
    uploadForm.append("file", file, fileName);

    const uploadRes = await fetch(UPLOAD_TARGET, {
      method: "POST",
      body: uploadForm,
      headers: {
        "User-Agent": USER_AGENT,
        Referrer: REFERRER,
      },
    });

    if (uploadRes.status !== 204) {
      const errText = await uploadRes.text();
      throw new Error(`Upload failed (${uploadRes.status}): ${errText}`);
    }

    const key = policyFields.key;
    const slug = key.split("/").pop();
    const url = `https://static.starsarena.com/${key}`;

    return NextResponse.json({
      ok: true,
      url,
      slug,
      key,
    });
  } catch (err) {
    console.error("upload-image error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "unknown error" },
      { status: 500 }
    );
  }
}

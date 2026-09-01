import { getServerConfig } from "../config";

function getAuthHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

export async function uploadPdfToSupabase(
  fileName: string,
  fileBytes: Buffer | Uint8Array,
  bucketName = "pdfs"
): Promise<string> {
  const config = getServerConfig();
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment");
  }

  const cleanUrl = config.supabaseUrl.replace(/\/+$/, "");
  const headers = {
    ...getAuthHeaders(config.supabaseServiceRoleKey),
    "Content-Type": "application/pdf",
    "x-upsert": "true",
  };

  // Ensure bucket exists (best-effort: only 409 AlreadyExists is expected)
  try {
    const bucketResp = await fetch(`${cleanUrl}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        ...getAuthHeaders(config.supabaseServiceRoleKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: bucketName,
        name: bucketName,
        public: true,
        file_size_limit: 26214400,
      }),
    });
    if (!bucketResp.ok && bucketResp.status !== 409) {
      const errorText = await bucketResp.text();
      console.warn(`Supabase bucket creation warning (status ${bucketResp.status}): ${errorText}`);
    }
  } catch (err) {
    console.warn("Supabase bucket creation warning:", err);
  }

  // Upload file
  const resp = await fetch(`${cleanUrl}/storage/v1/object/${bucketName}/${fileName}`, {
    method: "POST",
    headers,
    body: fileBytes instanceof Buffer ? fileBytes : Buffer.from(fileBytes),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error(`Supabase storage upload failed with status ${resp.status}: ${errorText}`);
    throw new Error(`Supabase upload failed: ${resp.status} ${errorText}`);
  }

  const publicUrl = `${cleanUrl}/storage/v1/object/public/${bucketName}/${fileName}`;
  return publicUrl;
}

export async function downloadPdfFromSupabase(
  fileName: string,
  bucketName = "pdfs"
): Promise<Buffer> {
  const config = getServerConfig();
  if (!config.supabaseUrl) {
    throw new Error("SUPABASE_URL is required to download from Supabase Storage");
  }

  const cleanUrl = config.supabaseUrl.replace(/\/+$/, "");

  // Strip any bucket prefix if passed
  let cleanFileName = fileName;
  const prefix = `${cleanUrl}/storage/v1/object/public/${bucketName}/`;
  if (cleanFileName.startsWith(prefix)) {
    cleanFileName = cleanFileName.replace(prefix, "");
  } else if (cleanFileName.startsWith("http://") || cleanFileName.startsWith("https://")) {
    const parts = cleanFileName.split("/");
    cleanFileName = parts[parts.length - 1];
  }

  // Try public URL first
  const publicUrl = `${cleanUrl}/storage/v1/object/public/${bucketName}/${cleanFileName}`;
  const resp = await fetch(publicUrl);
  if (resp.ok) {
    const arrayBuf = await resp.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  // Fallback to authenticated endpoint
  if (config.supabaseServiceRoleKey) {
    const authUrl = `${cleanUrl}/storage/v1/object/authenticated/${bucketName}/${cleanFileName}`;
    const resp2 = await fetch(authUrl, {
      headers: getAuthHeaders(config.supabaseServiceRoleKey),
    });
    if (resp2.ok) {
      const arrayBuf = await resp2.arrayBuffer();
      return Buffer.from(arrayBuf);
    }
  }

  throw new Error(`Failed to download PDF from Supabase storage: ${fileName}`);
}

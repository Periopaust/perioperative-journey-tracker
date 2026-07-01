import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  if (!endpoint || !apiKey) {
    return Response.json({ error: "Azure Document Intelligence not configured" }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();

  // Call Azure Document Intelligence — prebuilt-read model for text extraction
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-02-29-preview`;

  const analyzeRes = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Ocp-Apim-Subscription-Key": apiKey,
    },
    body: buffer,
  });

  if (!analyzeRes.ok) {
    const err = await analyzeRes.text();
    return Response.json({ error: `Document analysis failed: ${err}` }, { status: analyzeRes.status });
  }

  // Poll for result
  const operationLocation = analyzeRes.headers.get("Operation-Location");
  if (!operationLocation) {
    return Response.json({ error: "No operation location returned" }, { status: 500 });
  }

  let result: any = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const pollRes = await fetch(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
    });
    const pollData = await pollRes.json();
    if (pollData.status === "succeeded") {
      result = pollData;
      break;
    }
    if (pollData.status === "failed") {
      return Response.json({ error: "Document analysis failed" }, { status: 500 });
    }
  }

  if (!result) {
    return Response.json({ error: "Document analysis timed out" }, { status: 504 });
  }

  // Extract all text content
  const pages: string[] = (result.analyzeResult?.pages ?? []).map((page: any) =>
    (page.lines ?? []).map((line: any) => line.content).join("\n")
  );

  const extractedText = pages.join("\n\n").trim();

  return Response.json({ extractedText });
}

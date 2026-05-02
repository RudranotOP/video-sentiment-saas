import { writeFile } from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function PUT(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await req.arrayBuffer());
    const filePath = path.join("/tmp", key);

    await writeFile(filePath, buffer);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Local upload error: ", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

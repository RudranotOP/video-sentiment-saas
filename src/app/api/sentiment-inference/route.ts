import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  InvokeEndpointCommand,
  SageMakerRuntime,
  SageMakerRuntimeClient,
} from "@aws-sdk/client-sagemaker-runtime";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import path from "path";
import { env } from "~/env";
import { checkAndUpdateQuota } from "~/lib/quota";
import { db } from "~/server/db";

export async function POST(req: Request) {
  try {
    // Get API key from the header
    const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }

    // Find the user by API key
    const quota = await db.apiQuota.findUnique({
      where: {
        secretKey: apiKey,
      },
      select: {
        userId: true,
      },
    });

    if (!quota) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const { key } = await req.json();

    if (!key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    const file = await db.videoFile.findUnique({
      where: { key },
      select: { userId: true, analyzed: true },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.userId !== quota.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (file.analyzed) {
      return NextResponse.json(
        { error: "File already analyzed" },
        { status: 400 },
      );
    }

    const hasQuota = await checkAndUpdateQuota(quota.userId, true);

    if (!hasQuota) {
      return NextResponse.json(
        { error: "Monthly quota exceeded" },
        { status: 429 },
      );
    }

    // Call Hugging Face or Local server
    const videoPath = path.join("/tmp", key);
    
    // Using standard fetch and FormData for Hugging Face
    const formData = new FormData();
    const fileContent = await import("fs/promises").then(fs => fs.readFile(videoPath));
    const videoBlob = new Blob([fileContent], { type: "video/mp4" });
    formData.append("file", videoBlob, key);

    const aiServerUrl = process.env.AI_SERVER_URL || "http://localhost:8000/analyze";
    
    const response = await fetch(aiServerUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Inference failed");
    }

    const analysis = await response.json();

    await db.videoFile.update({
      where: { key },
      data: {
        analyzed: true,
      },
    });

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Analysis error: ", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Konfigurasi Anti-Cache Vercel & Batas Waktu
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

// Inisialisasi Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64 } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Gambar tidak ditemukan" },
        { status: 400 }
      );
    }

    // Gunakan model Flash yang cepat dan mendukung multimodal
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0, // Sangat cepat, fokus pada fakta di gambar
        responseMimeType: "application/json", // Jauh lebih cepat dari format teks biasa
      },
    });

    const prompt = `
      Anda adalah asisten pembaca struk restoran. Analisis gambar struk ini dan ekstrak datanya ke dalam format JSON.
      Aturan ketat:
      1. Kembalikan HANYA JSON valid.
      2. Format harga dan angka HARUS integer (tanpa titik, koma, atau Rp. Contoh: 25000).
      3. Struktur JSON yang wajib:
      {
        "items": [
          {"name": "Nama Menu", "qty": 1, "price": 25000}
        ],
        "subtotal": 25000,
        "tax": 2500,
        "service_charge": 1250,
        "total": 28750
      }
    `;

    const imageParts = [
      {
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg", // Asumsi JPEG, sesuaikan jika perlu
        },
      },
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text();

    // Membersihkan output dari markdown code block bawaan LLM jika ada
    return NextResponse.json(JSON.parse(responseText));
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Gagal memproses gambar" },
      { status: 500 }
    );
  }
}
